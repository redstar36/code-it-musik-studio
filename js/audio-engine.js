// audio-engine.js – Lookahead-Scheduler und Klangerzeugung
// Basiert auf Chris Wilsons "A Tale of Two Clocks"

import { SCHLAGZEUG, INSTRUMENTE } from './klaenge.js?v=8d8df3a';
import { frequenz, STANDARD_TONART } from './tonart.js?v=8d8df3a';

/** Im Song-Modus spielt jeder Eintrag des Ablaufs so viele Takte */
export const TAKTE_PRO_TEIL = 4;

/**
 * Gesamtsumme: Eingangsregler → Limiter → Ausgleich → sanfte Begrenzung.
 * Verhindert Übersteuern und Verzerrung, auch wenn Kinder viele laute Spuren gleichzeitig spielen.
 * Gibt den Eingang zurück, an den alle Klänge angeschlossen werden.
 */
export function summeAufbauen(ctx) {
  // Eingangsregler: Ein voller Mix aus 6–8 Spuren ist zusammen etwa dreimal zu laut.
  // Deshalb erst absenken, damit der Limiter nur noch Spitzen abfangen muss.
  // (Gemessen: so verzerrt der Start-Mix etwa ein Drittel so stark wie vorher.)
  const eingang = ctx.createGain();
  eingang.gain.value = 0.2;

  // Limiter: regelt sanft herunter, wenn es zu laut wird
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -4;
  limiter.knee.value = 6;
  limiter.ratio.value = 8;
  limiter.attack.value = 0.005;
  limiter.release.value = 0.3;   // langsam zurückregeln, sonst „pumpen“ gehaltene Töne

  // Ausgleich: Gesamtlautstärke wieder anheben
  const ausgleich = ctx.createGain();
  ausgleich.gain.value = 2.0;

  // Sanfte Begrenzung als letzte Sicherung: bis 0,7 bleibt das Signal unverändert,
  // darüber wird es weich abgerundet und bleibt unter 0,95 (kein Krachen).
  const begrenzer = ctx.createWaveShaper();
  const kurve = new Float32Array(2048);
  for (let i = 0; i < kurve.length; i++) {
    const x = (i / (kurve.length - 1)) * 4 - 2;   // Eingang von -2 bis 2
    const a = Math.abs(x);
    const y = a <= 0.7 ? a : 0.7 + 0.3 * Math.tanh((a - 0.7) / 0.3);
    kurve[i] = Math.sign(x) * 0.95 * y;
  }
  begrenzer.curve = kurve;
  begrenzer.oversample = '4x';

  // Die Kurve deckt -2 bis 2 ab, der Waveshaper erwartet -1 bis 1: vorher halbieren, Kurve rechnet in doppelter Größe
  const halb = ctx.createGain();
  halb.gain.value = 0.5;

  eingang.connect(limiter);
  limiter.connect(ausgleich);
  ausgleich.connect(halb);
  halb.connect(begrenzer);
  begrenzer.connect(ctx.destination);
  return eingang;
}

export class AudioEngine {
  constructor() {
    this.audioCtx = null;
    this.ausgang = null;   // Eingang des Limiters – alle Klänge gehen hierhin
    this.isPlaying = false;
    this.bpm = 120;
    this.tonart = STANDARD_TONART;

    // Scheduler-Einstellungen
    this.lookahead = 0.1;        // 100ms vorausschauen
    this.scheduleInterval = 25;  // alle 25ms prüfen
    this.timerID = null;

    // Position
    this.currentStep = 0;  // 0–15
    this.currentBar = 0;
    this.nextStepTime = 0; // Wann der nächste Schritt erklingen soll (AudioContext-Zeit)

    // Spuren: Map(nummer → { art, muster, klang, oktave, lautstaerke })
    //   art 'beat':    muster ist ein Text wie "x...x..."
    //   art 'melodie': muster ist eine Liste mit null oder { stufe, dauer } je Schritt
    this.spuren = new Map();
    // Neues Programm, das am nächsten Taktanfang übernommen wird
    this.wartendesProgramm = null;
    // Szenen: Map(taste → Liste von Spurnummern)
    this.szenen = new Map();
    // Ablauf für den Song-Modus: Liste von Szenen-Tasten
    this.ablauf = [];
    // 'live': Kinder schalten mit Tasten, 'song': der Ablauf spielt von selbst
    this.modus = 'live';

    // Live-Zustand: Nummern der Spuren, die gerade klingen
    this.aktiv = new Set();
    // Gewünschte Spuren ab dem nächsten Takt (null = nichts geplant)
    this.ziel = null;

    // Callbacks für UI-Updates
    this.onStep = null;
    this.onProgrammUebernommen = null;
    this.onLiveZustand = null;
    this.onEnde = null;   // Song ist zu Ende gespielt
  }

  /** AudioContext initialisieren (muss nach User-Geste aufgerufen werden) */
  init() {
    if (!this.audioCtx) {
      this.audioCtx = new AudioContext();
      this.ausgang = summeAufbauen(this.audioCtx);
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  /** Dauer eines 16tel-Schritts in Sekunden */
  get stepDuration() {
    // Ein Takt = 4 Viertel = 16 Sechzehntel
    // Viertel-Dauer = 60 / BPM
    // 16tel-Dauer = Viertel / 4
    return 60 / this.bpm / 4;
  }

  /**
   * Neues Programm setzen ({ tempo, tonart, spuren }).
   * Läuft die Musik, greift es erst am nächsten Taktanfang.
   */
  setProgramm(programm) {
    if (this.isPlaying) {
      this.wartendesProgramm = programm;
    } else {
      this._uebernehmen(programm);
    }
  }

  _uebernehmen(programm) {
    // Neu hinzugekommene Spuren sind an, entfernte verschwinden.
    // Spuren, die es schon gab, behalten ihren Zustand (an oder aus).
    for (const nr of programm.spuren.keys()) {
      if (!this.spuren.has(nr)) {
        this.aktiv.add(nr);
        if (this.ziel) this.ziel.add(nr);
      }
    }
    for (const nr of [...this.aktiv]) {
      if (!programm.spuren.has(nr)) this.aktiv.delete(nr);
    }
    if (this.ziel) {
      for (const nr of [...this.ziel]) {
        if (!programm.spuren.has(nr)) this.ziel.delete(nr);
      }
    }

    this.bpm = programm.tempo;
    this.tonart = programm.tonart;
    this.spuren = programm.spuren;
    this.szenen = programm.szenen;
    this.ablauf = programm.ablauf;
    this.wartendesProgramm = null;
    if (this.onProgrammUebernommen) {
      const bar = this.currentBar;
      setTimeout(() => this.onProgrammUebernommen(bar), this._msBisNaechsterSchritt());
    }
    this._meldeLive();
  }

  // ─── Live-Steuerung ────────────────────────────────────

  /** Spur an/aus. Greift am nächsten Takt. Gibt false zurück, wenn auf der Spur nichts liegt. */
  umschalten(nr) {
    if (!this.spuren.has(nr)) return false;
    const neu = new Set(this.ziel ?? this.aktiv);
    if (neu.has(nr)) neu.delete(nr); else neu.add(nr);
    this._zielSetzen(neu);
    return true;
  }

  /** Szene starten: genau ihre Spuren klingen ab dem nächsten Takt. false, wenn es die Szene nicht gibt. */
  szeneStarten(taste) {
    const spuren = this.szenen.get(taste);
    if (!spuren) return false;
    this._zielSetzen(new Set(spuren.filter((nr) => this.spuren.has(nr))));
    return true;
  }

  _zielSetzen(neu) {
    if (!this.isPlaying) {
      // Ohne Musik gibt es keinen Takt, auf den man warten müsste
      this.aktiv = neu;
      this.ziel = null;
    } else {
      this.ziel = gleicheMenge(neu, this.aktiv) ? null : neu;
    }
    this._meldeLive(true);
  }

  _zielAnwenden() {
    if (!this.ziel) return;
    this.aktiv = this.ziel;
    this.ziel = null;
    this._meldeLive();
  }

  /**
   * UI benachrichtigen. Normalerweise genau dann, wenn der Klang tatsächlich zu hören ist
   * (der Scheduler plant ja etwas voraus). sofort: z. B. damit eine Spur gleich zu blinken beginnt.
   */
  _meldeLive(sofort = false) {
    if (!this.onLiveZustand) return;
    setTimeout(() => this.onLiveZustand(), sofort ? 0 : this._msBisNaechsterSchritt());
  }

  _msBisNaechsterSchritt() {
    if (!this.isPlaying) return 0;
    return Math.max(0, (this.nextStepTime - this.audioCtx.currentTime) * 1000);
  }

  /** Wiedergabe starten */
  start() {
    if (this.isPlaying) return;
    this.init();
    this.isPlaying = true;
    this.currentStep = 0;
    this.currentBar = 0;
    this.nextStepTime = this.audioCtx.currentTime + 0.05; // kleiner Puffer
    if (this.modus === 'song') this._songTakt();
    this._schedule();
  }

  /** Wiedergabe stoppen */
  stop() {
    this.isPlaying = false;
    if (this.timerID !== null) {
      clearInterval(this.timerID);
      this.timerID = null;
    }
    // Wartendes Programm und geplante Umschaltungen nicht verlieren
    if (this.wartendesProgramm) this._uebernehmen(this.wartendesProgramm);
    this._zielAnwenden();
  }

  /** Scheduler-Schleife: plant alle fälligen Schritte voraus */
  _schedule() {
    this.timerID = setInterval(() => {
      // isPlaying prüfen: Am Ende eines Songs stoppt die Engine mitten in dieser Schleife
      while (this.isPlaying && this.nextStepTime < this.audioCtx.currentTime + this.lookahead) {
        this._playStep(this.currentStep, this.nextStepTime);
        this._advanceStep();
      }
    }, this.scheduleInterval);
  }

  /** Einen Schritt abspielen: alle Spuren prüfen */
  _playStep(step, time) {
    // UI-Callback: erst dann, wenn der Schritt wirklich zu hören ist
    if (this.onStep) {
      const bar = this.currentBar;
      const verzoegerung = Math.max(0, (time - this.audioCtx.currentTime) * 1000);
      setTimeout(() => this.onStep(step, bar), verzoegerung);
    }

    // Gemeinsame Uhr: Position im Muster ergibt sich aus Takt und Schritt.
    // Kürzere Muster wiederholen sich automatisch.
    const gesamtSchritt = this.currentBar * 16 + step;
    for (const [nr, spur] of this.spuren) {
      if (!this.aktiv.has(nr)) continue;
      const ereignis = spur.muster[gesamtSchritt % spur.muster.length];
      if (spur.art === 'beat') {
        if (ereignis !== '.') {
          SCHLAGZEUG[spur.klang](this.audioCtx, time, ereignis, this.ausgang, spur.lautstaerke);
        }
      } else if (ereignis) {
        // Ein Ereignis kann mehrere Töne haben (Akkord). Dann jeden Ton etwas leiser,
        // damit ein Akkord nicht dreimal so laut ist wie ein einzelner Ton.
        const dauer = ereignis.dauer * this.stepDuration;
        const lautstaerke = spur.lautstaerke / Math.sqrt(ereignis.stufen.length);
        for (const stufe of ereignis.stufen) {
          const freq = frequenz(this.tonart, spur.oktave, stufe);
          INSTRUMENTE[spur.klang].spielen(this.audioCtx, time, freq, dauer, this.ausgang, lautstaerke);
        }
      }
    }
  }

  /** Schritt weiterzählen */
  _advanceStep() {
    this.nextStepTime += this.stepDuration;
    this.currentStep++;
    if (this.currentStep >= 16) {
      this.currentStep = 0;
      this.currentBar++;
      // Taktanfang: jetzt wird neuer Code übernommen (auch neues Tempo)
      const neuerCode = this.wartendesProgramm !== null;
      if (neuerCode) this._uebernehmen(this.wartendesProgramm);
      if (this.modus === 'song') {
        this._songTakt(neuerCode);
      } else {
        this._zielAnwenden();
      }
    }
  }

  // ─── Song-Modus ────────────────────────────────────────

  /** Welcher Teil des Ablaufs gerade läuft (0, 1, 2 …) */
  get songTeil() {
    return Math.floor(this.currentBar / TAKTE_PRO_TEIL);
  }

  /**
   * Am Taktanfang: zu Beginn jedes Teils die passende Szene einschalten, am Schluss stoppen.
   * neuerCode: Szene auch mitten im Teil neu setzen (sie könnte sich im Code geändert haben)
   */
  _songTakt(neuerCode = false) {
    const teil = this.songTeil;
    if (teil >= this.ablauf.length) {
      const verzoegerung = this._msBisNaechsterSchritt();
      this.stop();
      if (this.onEnde) setTimeout(() => this.onEnde(), verzoegerung);
      return;
    }
    if (this.currentBar % TAKTE_PRO_TEIL === 0 || neuerCode) {
      const spuren = this.szenen.get(this.ablauf[teil]) ?? [];
      this.aktiv = new Set(spuren.filter((nr) => this.spuren.has(nr)));
      this.ziel = null;
      this._meldeLive();
    }
  }
}

function gleicheMenge(a, b) {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}
