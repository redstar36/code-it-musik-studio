// audio-engine.js – Lookahead-Scheduler und Klangerzeugung
// Basiert auf Chris Wilsons "A Tale of Two Clocks"

import { SCHLAGZEUG, INSTRUMENTE } from './klaenge.js?v=b387a8e';
import { frequenz, STANDARD_TONART } from './tonart.js?v=b387a8e';

/** Im Song-Modus spielt jeder Eintrag des Ablaufs so viele Takte */
export const TAKTE_PRO_TEIL = 4;

/** Längere Aufnahmen würden beim Speichern zu viel Speicher brauchen */
export const AUFNAHME_MAX_SEKUNDEN = 10 * 60;

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

  // Filter für das Live-Spiel (Lektion 8): ganz offen hört man ihn nicht
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = filterFrequenz(1);
  filter.Q.value = 1.2;

  eingang.connect(filter);
  filter.connect(limiter);
  limiter.connect(ausgleich);
  ausgleich.connect(halb);
  halb.connect(begrenzer);
  begrenzer.connect(ctx.destination);
  eingang.filterKnoten = filter;
  return eingang;
}

/** Filterwert 0 (dunkel) … 1 (offen) → Grenzfrequenz in Hz, gleichmäßig fürs Ohr (exponentiell) */
export function filterFrequenz(wert) {
  return 150 * Math.pow(20000 / 150, wert);
}

/** Trommelwirbel für fill(): Snare und Tom im zweiten Teil des Takts, lauter werdend */
// Sidechain: Bei jeder Kick werden Töne unter TIEF_GRENZE (Hz) kurz auf DUCK_TIEF abgesenkt,
// alle anderen Töne (Akkorde, Melodien) etwas weniger stark auf DUCK_MITTE
const TIEF_GRENZE = 200;
const DUCK_TIEF = 0.35;
const DUCK_MITTE = 0.5;

export const FILL_MUSTER = {
  snare: '........x.o.xxXX',
  tom: '..........x.x.x.',
};

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

    // Live-Aufnahme: null oder { zustand: 'wartet' | 'laeuft', takte: [...], sekunden }
    // Pro Takt wird gemerkt, was gespielt hat (Code, Tempo, Tonart, aktive Spuren).
    // Daraus wird die Aufnahme danach exakt neu berechnet (export.js).
    this.aufnahme = null;
    this.onAufnahme = null; // UI: (info) mit info.zustand 'wartet' | 'laeuft' | 'fertig' | 'leer'

    // Live-Effekte (Lektion 8)
    this.filterWert = 1;       // 0 = dunkel … 1 = offen
    this.fillGeplant = false;  // Fill im nächsten Takt
    this.fillAktiv = false;    // Fill im laufenden Takt
    this.onEffekte = null;     // UI: Filterwert, Fill-Zustand

    // jeder_takt (Lektion 9): wird zu Beginn jedes Takts aufgerufen, darin wirken Befehle im selben Takt
    this.onTaktBeginn = null;  // (takt) => …  (läuft im Scheduler, muss schnell sein)
    this.imTaktBeginn = false;
    this.wartendeSpuren = new Map(); // spur() beim Tastendruck: ab dem nächsten Takt
    this.programm = null;            // das gerade klingende Programm
  }

  /** AudioContext initialisieren (muss nach User-Geste aufgerufen werden) */
  init() {
    if (!this.audioCtx) {
      this.audioCtx = new AudioContext();
      this.ausgang = summeAufbauen(this.audioCtx);
      this.ausgang.filterKnoten.frequency.value = filterFrequenz(this.filterWert);
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

    this.programm = programm;
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
    this._taktBeginnen(false);
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
    this._wartendeSpurenAnwenden();
    this._zielAnwenden();
    // Mit der Musik endet auch die Aufnahme
    if (this.aufnahme) this.aufnahmeBeenden();
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

    const { tief: tiefBus, mitte: mitteBus } = this._duckBusse();

    // Gemeinsame Uhr: Position im Muster ergibt sich aus Takt und Schritt.
    // Kürzere Muster wiederholen sich automatisch.
    const gesamtSchritt = this.currentBar * 16 + step;
    // Fill (einmaliger Trommelwirbel) zusätzlich zu den Spuren
    if (this.fillAktiv) {
      for (const [klang, muster] of Object.entries(FILL_MUSTER)) {
        if (muster[step] !== '.') SCHLAGZEUG[klang](this.audioCtx, time, muster[step], this.ausgang, 0.9);
      }
    }

    for (const [nr, spur] of this.spuren) {
      if (!this.aktiv.has(nr)) continue;
      const ereignis = spur.muster[gesamtSchritt % spur.muster.length];
      if (spur.art === 'beat') {
        if (ereignis !== '.') {
          SCHLAGZEUG[spur.klang](this.audioCtx, time, ereignis, this.ausgang, spur.lautstaerke);
          if (spur.klang === 'kick') {
            this._ducken(tiefBus, DUCK_TIEF, time);
            this._ducken(mitteBus, DUCK_MITTE, time);
          }
        }
      } else if (ereignis) {
        // Ein Ereignis kann mehrere Töne haben (Akkord). Dann jeden Ton etwas leiser,
        // damit ein Akkord nicht dreimal so laut ist wie ein einzelner Ton. Lang klingende
        // Instrumente bekommen bei Akkorden zusätzlich ihren eigenen Faktor (klaenge.js).
        const dauer = ereignis.dauer * this.stepDuration;
        const anzahl = ereignis.stufen.length;
        const akkordFaktor = anzahl > 1 ? (INSTRUMENTE[spur.klang].akkord ?? 1) : 1;
        const lautstaerke = spur.lautstaerke / Math.sqrt(anzahl) * akkordFaktor;
        for (const stufe of ereignis.stufen) {
          const freq = frequenz(this.tonart, spur.oktave, stufe);
          // Alle Töne laufen über Busse, die bei jeder Kick kurz leiser werden (tiefe stärker)
          const ziel = freq < TIEF_GRENZE ? tiefBus : mitteBus;
          // Hohe Akkordtöne etwas leiser: Das Ohr hört hohe Töne lauter als tiefe
          const hoehe = anzahl > 1 ? Math.min(1, Math.sqrt(400 / freq)) : 1;
          INSTRUMENTE[spur.klang].spielen(this.audioCtx, time, freq, dauer, ziel, lautstaerke * hoehe, { akkord: anzahl > 1 });
        }
      }
    }
  }

  /**
   * Busse für Instrumente (tief und mitte). Bei jedem Kick-Schlag werden sie kurz leiser
   * („Sidechain“ wie in Drum & Bass und House), damit die Kick nicht in Bass, Akkorden und
   * Melodie untergeht. Pro Ausgang je einer (auch beim WAV-Berechnen).
   */
  _duckBusse() {
    if (!this._busse || this._busse.ziel !== this.ausgang) {
      const tief = this.audioCtx.createGain();
      const mitte = this.audioCtx.createGain();
      tief.connect(this.ausgang);
      mitte.connect(this.ausgang);
      this._busse = { tief, mitte, ziel: this.ausgang };
    }
    return this._busse;
  }

  /** Bus ab time schnell auf tiefe absenken und in gut 0,1 s wieder hochfahren */
  _ducken(bus, tiefe, time) {
    bus.gain.setTargetAtTime(tiefe, time, 0.004);
    bus.gain.setTargetAtTime(1, time + 0.04, 0.05);
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
      this._taktBeginnen(neuerCode);
    }
  }

  /**
   * Alles, was zu Beginn eines Takts passiert, in fester Reihenfolge:
   * wartende Spuren → jeder_takt → Szenen (Song-Ablauf oder Live-Umschaltung) → Fill → Aufnahme
   */
  _taktBeginnen(neuerCode) {
    this._wartendeSpurenAnwenden();
    if (this.onTaktBeginn) {
      this.imTaktBeginn = true;
      try {
        this.onTaktBeginn(this.currentBar);
      } finally {
        this.imTaktBeginn = false;
      }
    }
    if (this.modus === 'song') {
      this._songTakt(neuerCode);
      if (!this.isPlaying) return; // Song zu Ende
    } else {
      this._zielAnwenden();
    }
    this._fillTakt();
    this._aufnahmeTakt();
  }

  // ─── spur() zur Laufzeit (in jeder_takt oder beim Tastendruck) ───

  /** Spur ersetzen oder neu anlegen. In jeder_takt sofort, sonst ab dem nächsten Takt. */
  spurSetzen(nr, daten) {
    if (this.imTaktBeginn || !this.isPlaying) {
      this._spurJetztSetzen(nr, daten);
    } else {
      this.wartendeSpuren.set(nr, daten);
    }
  }

  _spurJetztSetzen(nr, daten) {
    const neu = new Map(this.spuren); // nicht verändern: Aufnahme-Takte zeigen noch auf die alte Map
    if (!this.spuren.has(nr)) {
      this.aktiv.add(nr);
      if (this.ziel) this.ziel.add(nr);
    }
    neu.set(nr, daten);
    this.spuren = neu;
    this._meldeLive();
  }

  _wartendeSpurenAnwenden() {
    if (this.wartendeSpuren.size === 0) return;
    for (const [nr, daten] of this.wartendeSpuren) this._spurJetztSetzen(nr, daten);
    this.wartendeSpuren.clear();
  }

  /** Am Taktanfang: geplanten Fill in diesem Takt spielen */
  _fillTakt() {
    const vorher = this.fillAktiv;
    this.fillAktiv = this.fillGeplant;
    this.fillGeplant = false;
    if (vorher || this.fillAktiv) this._meldeEffekte(false);
  }

  // ─── Live-Aufnahme ─────────────────────────────────────

  /**
   * Aufnahme starten. Läuft keine Musik, beginnt sie sofort mit dem Start (der Aufrufer startet die Musik).
   * Läuft Musik, beginnt sie am nächsten Taktanfang.
   */
  aufnahmeStarten() {
    this.aufnahme = { zustand: 'wartet', takte: [], sekunden: 0 };
    this._meldeAufnahme(true);
  }

  /** Aufnahme beenden. Der laufende Takt ist schon gemerkt und wird ganz mitgenommen. */
  aufnahmeBeenden() {
    const a = this.aufnahme;
    if (!a) return;
    this.aufnahme = null;
    const info = a.takte.length > 0
      ? { zustand: 'fertig', takte: a.takte, sekunden: a.sekunden }
      : { zustand: 'leer' };
    if (this.onAufnahme) setTimeout(() => this.onAufnahme(info), 0);
  }

  // ─── Live-Effekte ──────────────────────────────────────

  /** Filter setzen: 0 = dunkel … 1 = offen. Wirkt sofort, weich übergeblendet. */
  filterSetzen(wert) {
    this.filterWert = Math.min(1, Math.max(0, wert));
    const knoten = this.ausgang && this.ausgang.filterKnoten;
    if (knoten) knoten.frequency.setTargetAtTime(filterFrequenz(this.filterWert), this.audioCtx.currentTime, 0.04);
    // Für die Aufnahme: Änderung mit ungefährer Position im laufenden Takt merken
    // (In jeder_takt nicht nötig: Der neue Takt merkt sich den Filterwert gleich danach.)
    const a = this.aufnahme;
    if (a && a.zustand === 'laeuft' && a.takte.length > 0 && !this.imTaktBeginn) {
      a.takte[a.takte.length - 1].filter.push({ schritt: this.currentStep, wert: this.filterWert });
    }
    this._meldeEffekte();
  }

  /** Fill: einmalig im nächsten Takt ein Trommelwirbel */
  fillPlanen() {
    this.fillGeplant = true;
    this._meldeEffekte();
  }

  _meldeEffekte(sofort = true) {
    if (!this.onEffekte) return;
    const info = { filter: this.filterWert, fillGeplant: this.fillGeplant, fillAktiv: this.fillAktiv };
    setTimeout(() => this.onEffekte(info), sofort ? 0 : this._msBisNaechsterSchritt());
  }

  /** Am Taktanfang: Zustand für die Aufnahme merken */
  _aufnahmeTakt() {
    const a = this.aufnahme;
    if (!a || !this.isPlaying) return;
    if (a.sekunden + 16 * this.stepDuration > AUFNAHME_MAX_SEKUNDEN) {
      this.aufnahmeBeenden();
      return;
    }
    a.zustand = 'laeuft';
    a.takte.push({
      takt: this.currentBar,          // für die richtige Stelle in längeren Mustern
      bpm: this.bpm,
      tonart: this.tonart,
      spuren: this.spuren,            // wird bei neuem Code ersetzt, nie verändert
      aktiv: new Set(this.aktiv),
      fill: this.fillAktiv,
      filter: [{ schritt: 0, wert: this.filterWert }],
    });
    a.sekunden += 16 * this.stepDuration;
    this._meldeAufnahme();
  }

  _meldeAufnahme(sofort = false) {
    if (!this.onAufnahme || !this.aufnahme) return;
    const info = { zustand: this.aufnahme.zustand, takte: this.aufnahme.takte.length, sekunden: this.aufnahme.sekunden };
    setTimeout(() => this.onAufnahme(info), sofort ? 0 : this._msBisNaechsterSchritt());
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
