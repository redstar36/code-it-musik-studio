// werkstatt.js – Ideen-Werkstatt (KONZEPT.md 3.10, ab Lektion 11).
// Raster für Schlagzeug, Bass, Akkorde und Melodie. Jede Änderung erzeugt Code, der rechts zu sehen ist
// und mit der normalen Klangmaschine abgespielt wird. „Ins Studio übernehmen“ öffnet das
// Musik Studio mit genau diesem Code. Live-Spielen, Szenen, Aufnahme und Speichern gibt es nur dort.

import { AudioEngine } from './audio-engine.js?v=f646818';
import { programmAusfuehren } from './befehle.js?v=f646818';
import { CodeFehler } from './interpreter.js?v=f646818';
import { SCHLAGZEUG, INSTRUMENTE } from './klaenge.js?v=f646818';
import { codeLinkFuer, stufeAuslesen } from './links.js?v=f646818';
import { melodieSchreiben, tonSetzen, tonEntfernenAb } from './raster.js?v=f646818';

const SPEICHER = 'musikstudio-werkstatt';
const GRUNDTOENE = ['c', 'cis', 'd', 'es', 'e', 'f', 'fis', 'g', 'as', 'a', 'b', 'h'];
const REIHUM = ['.', 'x', 'X', 'o'];
const MELODIE_SCHRITTE = 32;   // Bass und Melodie: 2 Takte
// Feste Spurnummern: Schlagzeug 1–5, Bass 6, Akkorde 7, Melodie 8
const SPUR_BASS = 6;
const SPUR_AKKORDE = 7;
const AKKORD_TAKTE = 4;
const SPUR_MELODIE = 8;

const engine = new AudioEngine();
const playBtn = document.getElementById('play-btn');
const tempoRegler = document.getElementById('ws-tempo');
const tempoWert = document.getElementById('ws-tempo-wert');
const grundtonWahl = document.getElementById('ws-grundton');
const leiterWahl = document.getElementById('ws-leiter');
const codeText = document.getElementById('ws-code-text');
const meldung = document.getElementById('meldung');
const hochKnopf = document.getElementById('ws-hoch');

// ─── Zustand ─────────────────────────────────────────────

function leererZustand() {
  return {
    tempo: 100,
    grundton: 'a',
    leiter: 'moll',
    schlagzeug: ['kick', 'snare', 'clap', 'hihat', 'openhat'].map((klang) => ({ klang, muster: Array(16).fill('.') })),
    bass: { klang: 'synbass', schritte: Array(MELODIE_SCHRITTE).fill(null) },
    akkorde: { klang: 'pad', takte: Array(AKKORD_TAKTE).fill(null) },
    melodie: { klang: 'floete', schritte: Array(MELODIE_SCHRITTE).fill(null), hoch: false },
  };
}

function zustandLaden() {
  try {
    const z = JSON.parse(localStorage.getItem(SPEICHER));
    if (z && z.schlagzeug && z.bass && z.melodie) {
      z.akkorde ??= leererZustand().akkorde;   // ältere Speicherstände ohne Akkorde
      return z;
    }
  } catch { /* nichts gespeichert oder nicht lesbar */ }
  return leererZustand();
}

let zustand = zustandLaden();

function zustandMerken() {
  try { localStorage.setItem(SPEICHER, JSON.stringify(zustand)); } catch { /* Speichern nicht möglich */ }
}

// ─── Code erzeugen ───────────────────────────────────────

function beatText(muster) {
  return muster.join('').match(/.{4}/g).join(' ');
}

function codeErzeugen() {
  const zeilen = ['# Meine Idee aus der Ideen-Werkstatt', `tempo(${zustand.tempo})`, `tonart("${zustand.grundton}-${zustand.leiter}")`, ''];
  const spuren = [];
  const namen = new Map();   // gleiche Klänge bekommen eine Nummer: kick, kick2 …
  zustand.schlagzeug.forEach((reihe, i) => {
    if (reihe.muster.every((z) => z === '.')) return;
    const anzahl = (namen.get(reihe.klang) ?? 0) + 1;
    namen.set(reihe.klang, anzahl);
    const name = anzahl === 1 ? reihe.klang : `${reihe.klang}${anzahl}`;
    zeilen.push(`${name} = beat("${beatText(reihe.muster)}", klang="${reihe.klang}")`);
    spuren.push(`spur(${i + 1}, ${name})`);
  });
  if (zustand.bass.schritte.some(Boolean)) {
    zeilen.push(`bass = melodie("${melodieSchreiben(zustand.bass.schritte)}", klang="${zustand.bass.klang}")`);
    spuren.push(`spur(${SPUR_BASS}, bass)`);
  }
  const folge = akkordFolge();
  if (folge) {
    zeilen.push(`flaeche = akkorde([${folge.join(', ')}], klang="${zustand.akkorde.klang}")`);
    spuren.push(`spur(${SPUR_AKKORDE}, flaeche)`);
  }
  if (zustand.melodie.schritte.some(Boolean)) {
    zeilen.push(`hauptmelodie = melodie("${melodieSchreiben(zustand.melodie.schritte)}", klang="${zustand.melodie.klang}")`);
    spuren.push(`spur(${SPUR_MELODIE}, hauptmelodie)`);
  }
  if (spuren.length > 0) zeilen.push('', ...spuren);
  return zeilen.join('\n') + '\n';
}

/**
 * Akkordfolge für akkorde([…]): Ein leerer Takt nach einem Akkord lässt diesen weiterklingen.
 * Wiederholt sich die Folge, wird sie gekürzt ([1, 5, 1, 5] → [1, 5]).
 * null, wenn es keine Akkorde gibt oder der erste Takt leer ist.
 */
function akkordFolge() {
  const takte = zustand.akkorde.takte;
  if (takte[0] === null) return null;
  const folge = [];
  for (const a of takte) folge.push(a ?? folge[folge.length - 1]);
  for (const laenge of [1, 2]) {
    if (folge.every((a, i) => a === folge[i % laenge])) return folge.slice(0, laenge);
  }
  return folge;
}

// ─── Abspielen ───────────────────────────────────────────

let aktuellerCode = '';

/** Nach jeder Änderung: Code erzeugen, anzeigen, merken und hörbar machen */
function aktualisieren() {
  aktuellerCode = codeErzeugen();
  codeText.textContent = aktuellerCode;
  zustandMerken();
  try {
    const programm = programmAusfuehren(aktuellerCode);
    meldung.textContent = '';
    meldung.className = '';
    // In der Werkstatt sofort hören, nicht erst am nächsten Takt
    if (engine.isPlaying) engine._uebernehmen(programm);
    else engine.setProgramm(programm);
    stummAnwenden();
  } catch (e) {
    if (!(e instanceof CodeFehler)) throw e;
    meldung.textContent = e.message;
    meldung.className = 'fehler';
  }
}

// ─── Stumm schalten ──────────────────────────────────────
// Nur zum Anhören: Der Code bleibt vollständig, stumme Teile kommen trotzdem ins Studio.

/** Alle Teile mit ihrer Spurnummer */
function teile() {
  return [
    ...zustand.schlagzeug.map((reihe, i) => ({ teil: reihe, nr: i + 1 })),
    { teil: zustand.bass, nr: SPUR_BASS },
    { teil: zustand.akkorde, nr: SPUR_AKKORDE },
    { teil: zustand.melodie, nr: SPUR_MELODIE },
  ];
}

/** Stumme Teile sofort aus-, die anderen einschalten */
function stummAnwenden() {
  for (const { teil, nr } of teile()) {
    if (teil.stumm) engine.aktiv.delete(nr);
    else if (engine.spuren.has(nr)) engine.aktiv.add(nr);
  }
}

const stummAnzeigen = [];   // Knöpfe der Karten neu zeichnen (z. B. nach „Neu anfangen“)

/**
 * Lautsprecher-Knopf für einen Teil; element wird bei „stumm“ blass dargestellt.
 * teil: der Teil selbst oder eine Funktion, die ihn liefert (Karten bleiben, der Zustand kann wechseln)
 */
function stummKnopf(teilOderFunktion, element) {
  const holen = typeof teilOderFunktion === 'function' ? teilOderFunktion : () => teilOderFunktion;
  const knopf = document.createElement('button');
  knopf.type = 'button';
  knopf.className = 'ws-stumm';
  knopf.tabIndex = -1;
  knopf.addEventListener('mousedown', (e) => e.preventDefault());
  const zeigen = () => {
    const teil = holen();
    knopf.textContent = teil.stumm ? '🔇' : '🔊';
    knopf.title = teil.stumm ? 'Stumm. Klick zum Einschalten' : 'Klick zum Stummschalten';
    knopf.classList.toggle('aus', !!teil.stumm);
    element.classList.toggle('stumm', !!teil.stumm);
  };
  knopf.addEventListener('click', () => {
    const teil = holen();
    teil.stumm = !teil.stumm;
    zeigen();
    stummAnwenden();
    zustandMerken();
  });
  zeigen();
  if (typeof teilOderFunktion === 'function') stummAnzeigen.push(zeigen);
  return knopf;
}

function playKnopfZeigen() {
  playBtn.textContent = engine.isPlaying ? '■ Stop' : '▶ Play';
  playBtn.classList.toggle('playing', engine.isPlaying);
  if (!engine.isPlaying) markieren(-1, -1);
}

playBtn.addEventListener('click', () => {
  if (engine.isPlaying) engine.stop();
  else {
    aktualisieren();
    engine.start();
  }
  playKnopfZeigen();
});

document.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || e.repeat || ['INPUT', 'SELECT', 'BUTTON'].includes(e.target.tagName)) return;
  e.preventDefault();
  playBtn.click();
});

// ─── Schlagzeug ──────────────────────────────────────────

const schlagzeugBereich = document.getElementById('ws-schlagzeug');
let markierbar = [];   // [{ zellen, schritte }]: Kästchen, die beim Abspielen markiert werden

function auswahl(werte, gewaehlt) {
  const select = document.createElement('select');
  for (const w of werte) {
    const o = document.createElement('option');
    o.value = o.textContent = w;
    select.append(o);
  }
  select.value = gewaehlt;
  return select;
}

function schlagzeugZeichnen() {
  schlagzeugBereich.innerHTML = '';
  const spalten = Array.from({ length: 16 }, () => []);
  zustand.schlagzeug.forEach((reihe) => {
    const zeile = document.createElement('div');
    zeile.className = 'raster-reihe';
    const klang = auswahl(Object.keys(SCHLAGZEUG), reihe.klang);
    klang.className = 'ws-reihenklang';
    klang.addEventListener('change', () => { reihe.klang = klang.value; aktualisieren(); });
    zeile.append(stummKnopf(reihe, zeile), klang);
    reihe.muster.forEach((z, i) => {
      const knopf = document.createElement('button');
      knopf.type = 'button';
      knopf.className = 'raster-zelle' + (i % 4 === 0 && i > 0 ? ' gruppe' : '');
      knopf.dataset.zeichen = z;
      knopf.textContent = z === '.' ? '' : z;
      knopf.title = `Schritt ${i + 1}`;
      // Kein Fokus auf dem Kästchen, sonst würde die Leertaste es umschalten statt Play
      knopf.tabIndex = -1;
      knopf.addEventListener('mousedown', (e) => e.preventDefault());
      knopf.addEventListener('click', () => {
        reihe.muster[i] = REIHUM[(REIHUM.indexOf(z) + 1) % REIHUM.length];
        schlagzeugZeichnen();
        aktualisieren();
      });
      zeile.append(knopf);
      spalten[i].push(knopf);
    });
    schlagzeugBereich.append(zeile);
  });
  markierbar = markierbar.filter((m) => m.art !== 'schlagzeug');
  markierbar.push({ art: 'schlagzeug', spalten, schritte: 16 });
}

// ─── Bass und Melodie („Piano-Roll“) ─────────────────────

/**
 * Piano-Roll für zustand[teil] (bass oder melodie), 2 Takte nebeneinander.
 * Klick setzt oder löscht einen Ton, Klick in die Mitte kürzt, Ziehen nach rechts verlängert.
 */
function pianoRoll(teil, bereich) {
  let ziehen = null;

  function oben() {
    const hoechste = Math.max(0, ...zustand[teil].schritte.filter(Boolean).map((x) => x.s));
    return (zustand[teil].hoch || hoechste > 8) ? 14 : 8;
  }

  function zeichnen(schritte = zustand[teil].schritte) {
    bereich.innerHTML = '';
    const feld = document.createElement('div');
    feld.className = 'piano-roll';
    const spalten = Array.from({ length: MELODIE_SCHRITTE }, () => []);
    for (let s = oben(); s >= 1; s--) {
      const reihe = document.createElement('div');
      reihe.className = 'raster-reihe' + (s === 1 || s === 8 ? ' grundton' : '');
      const stufe = document.createElement('span');
      stufe.className = 'raster-stufe';
      stufe.textContent = s;
      reihe.append(stufe);
      for (let i = 0; i < MELODIE_SCHRITTE; i++) {
        const x = schritte[i];
        const zelle = document.createElement('div');
        let klasse = 'roll-zelle' + (i % 4 === 0 && i > 0 ? ' gruppe' : '') + (i === 16 ? ' takt' : '');
        if (x && x.s === s) klasse += x.start ? ' ton' : ' halten';
        zelle.className = klasse;
        zelle.textContent = x && x.s === s && x.start ? s : '';
        zelle.dataset.schritt = i;
        zelle.dataset.stufe = s;
        zelle.title = `Ton ${s}, Takt ${Math.floor(i / 16) + 1}, Schritt ${(i % 16) + 1}`;
        reihe.append(zelle);
        spalten[i].push(zelle);
      }
      feld.append(reihe);
    }
    feld.addEventListener('pointerdown', beginnen);
    bereich.append(feld);
    markierbar = markierbar.filter((m) => m.art !== teil);
    markierbar.push({ art: teil, spalten, schritte: MELODIE_SCHRITTE });
  }

  function zelleUnter(e) {
    const ziel = document.elementFromPoint(e.clientX, e.clientY);
    return ziel && ziel.closest ? ziel.closest('.roll-zelle') : null;
  }

  function beginnen(e) {
    const zelle = zelleUnter(e);
    if (!zelle || e.button !== 0) return;
    e.preventDefault();
    const alt = zustand[teil].schritte;
    const nr = Number(zelle.dataset.schritt);
    const s = Number(zelle.dataset.stufe);
    const x = alt[nr];
    let art = 'neu';
    let anfang = nr;
    if (x && x.s === s && x.start) art = 'ton';
    else if (x && x.s === s) {
      art = 'mitte';
      while (anfang > 0 && !alt[anfang].start) anfang--;
    }
    ziehen = { alt, art, anfang, s, start: nr, bewegt: false, jetzt: art === 'neu' ? tonSetzen(alt, nr, nr, s) : alt };
    zeichnen(ziehen.jetzt);
    document.addEventListener('pointermove', bewegen);
    document.addEventListener('pointerup', beenden);
    document.addEventListener('pointercancel', beenden);
  }

  function bewegen(e) {
    const zelle = zelleUnter(e);
    if (!ziehen || !zelle || !bereich.contains(zelle)) return;
    const nr = Number(zelle.dataset.schritt);
    if (nr === ziehen.start && !ziehen.bewegt) return;
    ziehen.bewegt = true;
    const ende = Math.max(nr, ziehen.anfang);
    ziehen.jetzt = tonSetzen(ziehen.alt, ziehen.anfang, ende, ziehen.s);
    if (ziehen.art !== 'neu') {
      // Teile des alten Tons hinter dem neuen Ende werden Pause
      for (let j = ende + 1; j < MELODIE_SCHRITTE && ziehen.alt[j] && !ziehen.alt[j].start && ziehen.alt[j].s === ziehen.s; j++) {
        ziehen.jetzt[j] = null;
      }
    }
    zeichnen(ziehen.jetzt);
  }

  function beenden() {
    document.removeEventListener('pointermove', bewegen);
    document.removeEventListener('pointerup', beenden);
    document.removeEventListener('pointercancel', beenden);
    const z = ziehen;
    ziehen = null;
    if (!z) return;
    zustand[teil].schritte = (!z.bewegt && z.art !== 'neu') ? tonEntfernenAb(z.alt, z.start) : z.jetzt;
    zeichnen();
    aktualisieren();
  }

  return { zeichnen: () => zeichnen() };
}

// ─── Akkorde: welche Stufe in welchem Takt ───────────────

const akkordBereich = document.getElementById('ws-akkorde');
const akkordHinweis = document.getElementById('ws-akkorde-hinweis');

function akkordeZeichnen() {
  akkordBereich.innerHTML = '';
  const takte = zustand.akkorde.takte;
  const spalten = Array.from({ length: AKKORD_TAKTE }, () => []);
  for (let s = 7; s >= 1; s--) {
    const reihe = document.createElement('div');
    reihe.className = 'raster-reihe' + (s === 1 ? ' grundton' : '');
    const stufe = document.createElement('span');
    stufe.className = 'raster-stufe';
    stufe.textContent = s;
    reihe.append(stufe);
    let klingt = null;   // Akkord, der aus einem früheren Takt weiterklingt
    for (let t = 0; t < AKKORD_TAKTE; t++) {
      if (takte[t] !== null) klingt = takte[t];
      const zelle = document.createElement('button');
      zelle.type = 'button';
      zelle.tabIndex = -1;
      zelle.addEventListener('mousedown', (e) => e.preventDefault());
      let klasse = 'akkord-zelle';
      if (takte[t] === s) klasse += ' ton';
      else if (takte[t] === null && klingt === s) klasse += ' halten';
      zelle.className = klasse;
      zelle.textContent = takte[t] === s ? s : '';
      zelle.title = `Akkord auf Stufe ${s}, Takt ${t + 1}`;
      zelle.addEventListener('click', () => {
        takte[t] = takte[t] === s ? null : s;
        akkordeZeichnen();
        aktualisieren();
      });
      reihe.append(zelle);
      spalten[t].push(zelle);
    }
    akkordBereich.append(reihe);
  }
  const ersterLeer = takte[0] === null && takte.some((a) => a !== null);
  akkordHinweis.hidden = !ersterLeer;
  akkordHinweis.textContent = ersterLeer ? 'Setze auch im ersten Takt einen Akkord. Erst dann kommen die Akkorde in den Code.' : '';
  markierbar = markierbar.filter((m) => m.art !== 'akkorde');
  markierbar.push({ art: 'akkorde', spalten, takte: AKKORD_TAKTE });
}

const bassRoll = pianoRoll('bass', document.getElementById('ws-bass'));
const melodieRoll = pianoRoll('melodie', document.getElementById('ws-melodie'));

function klangWahlEinrichten(id, teil) {
  const select = document.getElementById(id);
  // Lautsprecher-Knopf vor „Klang“; blass wird die ganze Karte
  const karte = select.closest('.ws-karte');
  select.parentElement.prepend(stummKnopf(() => zustand[teil], karte));
  for (const name of Object.keys(INSTRUMENTE)) {
    const o = document.createElement('option');
    o.value = o.textContent = name;
    select.append(o);
  }
  select.value = zustand[teil].klang;
  select.addEventListener('change', () => { zustand[teil].klang = select.value; aktualisieren(); });
  return select;
}

const bassKlang = klangWahlEinrichten('ws-bass-klang', 'bass');
const akkordKlang = klangWahlEinrichten('ws-akkorde-klang', 'akkorde');
const melodieKlang = klangWahlEinrichten('ws-melodie-klang', 'melodie');

function hochKnopfZeigen() {
  hochKnopf.textContent = zustand.melodie.hoch ? 'Nur Töne 1 bis 8' : 'Höhere Töne (9 bis 14)';
}
hochKnopf.addEventListener('click', () => {
  zustand.melodie.hoch = !zustand.melodie.hoch;
  hochKnopfZeigen();
  melodieRoll.zeichnen();
  zustandMerken();
});

// ─── Laufenden Schritt markieren ─────────────────────────

function markieren(step, bar) {
  for (const m of markierbar) {
    // Akkorde: ganze Takte markieren; sonst einzelne Schritte
    const nr = step < 0 ? -1 : m.takte ? bar % m.takte : (bar % (m.schritte / 16)) * 16 + step;
    m.spalten.forEach((zellen, i) => zellen.forEach((z) => z.classList.toggle('jetzt', i === nr)));
  }
}
engine.onStep = (step, bar) => markieren(step, bar);

// ─── Tempo, Tonart, Neu, Ins Studio ──────────────────────

for (const g of GRUNDTOENE) {
  const o = document.createElement('option');
  o.value = o.textContent = g;
  grundtonWahl.append(o);
}

function kopfZeigen() {
  tempoRegler.value = zustand.tempo;
  tempoWert.textContent = zustand.tempo;
  grundtonWahl.value = zustand.grundton;
  leiterWahl.value = zustand.leiter;
  bassKlang.value = zustand.bass.klang;
  akkordKlang.value = zustand.akkorde.klang;
  melodieKlang.value = zustand.melodie.klang;
  hochKnopfZeigen();
  stummAnzeigen.forEach((zeigen) => zeigen());
}

tempoRegler.addEventListener('input', () => {
  zustand.tempo = Number(tempoRegler.value);
  tempoWert.textContent = zustand.tempo;
  aktualisieren();
});
grundtonWahl.addEventListener('change', () => { zustand.grundton = grundtonWahl.value; aktualisieren(); });
leiterWahl.addEventListener('change', () => { zustand.leiter = leiterWahl.value; aktualisieren(); });

document.getElementById('ws-neu').addEventListener('click', () => {
  if (!confirm('Alle Raster leeren und neu anfangen?')) return;
  zustand = leererZustand();
  allesZeichnen();
});

document.getElementById('ws-studio').addEventListener('click', () => {
  if (engine.isPlaying) engine.stop();
  location.href = codeLinkFuer(aktuellerCode, 'index.html', stufeAuslesen(), 'werkstatt');
});

function allesZeichnen() {
  kopfZeigen();
  schlagzeugZeichnen();
  bassRoll.zeichnen();
  akkordeZeichnen();
  melodieRoll.zeichnen();
  aktualisieren();
}

allesZeichnen();
