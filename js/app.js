// app.js – UI-Logik: Code ausführen, Play/Stop, Meldungen, Live-Steuerung

import { AudioEngine, TAKTE_PRO_TEIL } from './audio-engine.js?v=8d8df3a';
import { programmAusfuehren, SZENEN_TASTEN } from './befehle.js?v=8d8df3a';
import { CodeFehler } from './interpreter.js?v=8d8df3a';
import { DEMO_TRACK } from './vorlagen.js?v=8d8df3a';
import { songBerechnen, wavErzeugen, dateiname, herunterladen } from './export.js?v=8d8df3a';
import { codeLaden, codeMerken, codeAlsDatei, dateiLesen } from './speicher.js?v=8d8df3a';
import { linkAuslesen, linkEntfernen, linkFuerCode } from './links.js?v=8d8df3a';

const engine = new AudioEngine();

// UI-Elemente
const playBtn = document.getElementById('play-btn');
const ausfuehrenBtn = document.getElementById('ausfuehren-btn');
const editor = document.getElementById('code-editor');
const zeilennummern = document.getElementById('zeilennummern');
const meldung = document.getElementById('meldung');
const tempoDisplay = document.getElementById('tempo-display');
const tonartDisplay = document.getElementById('tonart-display');
const posDisplay = document.getElementById('position-display');
const spurFelder = document.getElementById('spur-felder');
const szenenFelder = document.getElementById('szenen-felder');
const tastenStatus = document.getElementById('tasten-status');
const ablaufAnzeige = document.getElementById('ablauf-anzeige');
const modusLiveBtn = document.getElementById('modus-live');
const modusSongBtn = document.getElementById('modus-song');

// ─── Start-Code bestimmen ────────────────────────────────
// Reihenfolge: Code aus dem Link (Vorlage) → Code vom letzten Mal → Demo-Track

const gemerkterCode = codeLaden();
let startCode = gemerkterCode ?? DEMO_TRACK;
let startMeldung = gemerkterCode !== null ? ['Dein Code vom letzten Mal ist wieder da.', 'hinweis'] : ['', ''];

const ausLink = linkAuslesen();
if (ausLink) {
  // Aus der Adresszeile entfernen, sonst würde Neuladen die Änderungen wieder überschreiben
  linkEntfernen();
  if (ausLink.fehler) {
    startMeldung = [ausLink.fehler, 'fehler'];
  } else {
    // Nur nachfragen, wenn wirklich eigener Code verloren gehen würde
    const eigenerCode = gemerkterCode !== null && gemerkterCode.trim() !== '' &&
      gemerkterCode !== ausLink.code && gemerkterCode !== DEMO_TRACK;
    const ersetzen = !eigenerCode || confirm(
      `Du öffnest ${ausLink.beschreibung}. Dabei wird dein bisheriger Code ersetzt.\n\n` +
      'OK: Vorlage öffnen\n' +
      'Abbrechen: bisherigen Code behalten (du kannst ihn speichern und den Link danach noch einmal öffnen)');
    if (ersetzen) {
      startCode = ausLink.code;
      codeMerken(startCode);
      startMeldung = [`Du hast ${ausLink.beschreibung} geöffnet. Drücke Play zum Anhören.`, 'ok'];
    } else {
      startMeldung = ['Dein bisheriger Code ist geblieben.', 'hinweis'];
    }
  }
}
editor.value = startCode;
let fehlerZeile = null;

// ─── Zeilennummern ───────────────────────────────────────

function zeilennummernZeichnen() {
  const anzahl = editor.value.split('\n').length;
  let html = '';
  for (let i = 1; i <= anzahl; i++) {
    html += i === fehlerZeile ? `<div class="fehler">${i}</div>` : `<div>${i}</div>`;
  }
  zeilennummern.innerHTML = html;
  zeilennummern.scrollTop = editor.scrollTop;
}

editor.addEventListener('input', zeilennummernZeichnen);
editor.addEventListener('scroll', () => { zeilennummern.scrollTop = editor.scrollTop; });

// ─── Meldungen ───────────────────────────────────────────

function zeigeMeldung(text, art) {
  meldung.textContent = text;
  meldung.className = art;
}

// ─── Code ausführen ──────────────────────────────────────

/** Prüft den Code. Gibt das Programm zurück oder null (dann steht der Fehler in der Meldung). */
function codePruefen() {
  try {
    const programm = programmAusfuehren(editor.value);
    fehlerZeile = null;
    zeilennummernZeichnen();
    return programm;
  } catch (e) {
    if (!(e instanceof CodeFehler)) throw e;
    fehlerZeile = e.zeile;
    zeilennummernZeichnen();
    const hinweis = engine.isPlaying ? ' Die Musik läuft mit dem alten Code weiter.' : '';
    zeigeMeldung(e.message + hinweis, 'fehler');
    return null;
  }
}

/** Führt den Code aus. Gibt true zurück, wenn er fehlerfrei war. */
function codeAusfuehren() {
  const programm = codePruefen();
  if (!programm) return false;

  if (programm.hinweise.length > 0) {
    // Hinweise (z. B. 3-Takt-Muster) sind wichtiger als „Alles in Ordnung“
    zeigeMeldung(programm.hinweise[0], 'hinweis');
  } else if (programm.spuren.size === 0) {
    zeigeMeldung('Dein Code ist in Ordnung, aber noch auf keiner Spur. Lege einen Beat auf eine Spur, zum Beispiel spur(1, kick).', 'hinweis');
  } else if (engine.isPlaying) {
    zeigeMeldung('Verstanden! Dein neuer Code startet am Anfang des nächsten Takts.', 'wartet');
  } else {
    zeigeMeldung('Alles in Ordnung.', 'ok');
  }
  engine.setProgramm(programm);
  return true;
}

engine.onProgrammUebernommen = (bar) => {
  tempoDisplay.textContent = `${engine.bpm} BPM`;
  tonartDisplay.textContent = engine.tonart.name;
  if (engine.isPlaying && meldung.className === 'wartet') {
    zeigeMeldung(`Läuft! Dein neuer Code spielt seit Takt ${bar + 1}.`, 'ok');
  }
};

// Schritt-Anzeige aktualisieren
engine.onStep = (step, bar) => {
  if (engine.modus === 'song') {
    const teil = Math.floor(bar / TAKTE_PRO_TEIL);
    posDisplay.textContent = `Teil ${teil + 1} von ${engine.ablauf.length} · Takt ${(bar % TAKTE_PRO_TEIL) + 1} von ${TAKTE_PRO_TEIL}`;
    if (step === 0) ablaufZeichnen(teil);
  } else {
    posDisplay.textContent = `Takt ${bar + 1} · Schritt ${step + 1}`;
  }
};

// ─── Spur- und Szenenfelder ──────────────────────────────

function feld(gross, klein, klassen, beiKlick) {
  const knopf = document.createElement('button');
  knopf.className = ['feld', ...klassen].join(' ');
  knopf.innerHTML = `<span class="gross"></span><span class="klein"></span>`;
  knopf.querySelector('.gross').textContent = gross;
  knopf.querySelector('.klein').textContent = klein;
  knopf.tabIndex = -1; // Felder sollen der Tastatur nicht den Fokus wegnehmen
  knopf.addEventListener('click', beiKlick);
  return knopf;
}

function felderZeichnen() {
  const ziel = engine.ziel ?? engine.aktiv;
  ablaufZeichnen();
  document.querySelector('.grid-panel').classList.toggle('live-aus', engine.modus === 'song');

  spurFelder.replaceChildren();
  for (let nr = 1; nr <= 8; nr++) {
    const spur = engine.spuren.get(nr);
    if (!spur) {
      spurFelder.append(feld(nr, 'leer', ['leer'], () => spurUmschalten(nr)));
      continue;
    }
    const istAn = engine.aktiv.has(nr);
    const klassen = [istAn ? 'an' : 'aus'];
    if (istAn !== ziel.has(nr)) klassen.push('blinkt');
    spurFelder.append(feld(nr, spur.klang, klassen, () => spurUmschalten(nr)));
  }

  szenenFelder.replaceChildren();
  for (const taste of SZENEN_TASTEN) {
    const spuren = engine.szenen.get(taste);
    if (!spuren) {
      szenenFelder.append(feld(taste.toUpperCase(), 'leer', ['leer'], () => szeneStarten(taste)));
      continue;
    }
    const klassen = [];
    if (gleicheSpuren(spuren, engine.aktiv)) klassen.push('szene-aktiv');
    if (engine.ziel && gleicheSpuren(spuren, engine.ziel)) klassen.push('blinkt');
    const text = spuren.length > 0 ? spuren.join(' ') : 'Stille';
    szenenFelder.append(feld(taste.toUpperCase(), text, klassen, () => szeneStarten(taste)));
  }
}

/** Ablauf als Reihe von Szenen. Im Song-Modus ist der laufende Teil hervorgehoben. */
function ablaufZeichnen(teil = engine.isPlaying ? engine.songTeil : -1) {
  ablaufAnzeige.replaceChildren();
  if (engine.ablauf.length === 0) {
    const text = document.createElement('span');
    text.className = 'leer-text';
    text.textContent = 'Noch kein Ablauf. Beispiel: ablauf("q", "w", "e")';
    ablaufAnzeige.append(text);
    return;
  }
  const imSong = engine.modus === 'song' && engine.isPlaying;
  engine.ablauf.forEach((taste, i) => {
    const el = document.createElement('span');
    el.className = 'teil';
    if (imSong && i === teil) el.classList.add('jetzt');
    if (imSong && i < teil) el.classList.add('gespielt');
    el.textContent = taste.toUpperCase();
    ablaufAnzeige.append(el);
  });
}

function gleicheSpuren(liste, menge) {
  const vorhanden = liste.filter((nr) => engine.spuren.has(nr));
  return vorhanden.length === menge.size && vorhanden.every((nr) => menge.has(nr));
}

const SONG_HINWEIS = 'Im Song-Modus spielt der Ablauf von selbst. Schalte oben auf Live, um selbst zu spielen.';

function spurUmschalten(nr) {
  if (engine.modus === 'song') {
    zeigeMeldung(SONG_HINWEIS, 'hinweis');
  } else if (!engine.umschalten(nr)) {
    zeigeMeldung(`Auf Spur ${nr} liegt noch nichts. Lege im Code einen Baustein darauf, zum Beispiel spur(${nr}, kick).`, 'hinweis');
  }
}

function szeneStarten(taste) {
  if (engine.modus === 'song') {
    zeigeMeldung(SONG_HINWEIS, 'hinweis');
  } else if (!engine.szeneStarten(taste)) {
    zeigeMeldung(`Die Szene ${taste.toUpperCase()} gibt es noch nicht. Lege sie im Code an, zum Beispiel szene("${taste}", 1, 2).`, 'hinweis');
  }
}

engine.onLiveZustand = felderZeichnen;

// Zeigt an, ob die Tasten gerade die Musik steuern oder im Textfeld tippen
function tastenStatusZeigen() {
  if (document.activeElement === editor) {
    tastenStatus.textContent = 'Du schreibst gerade Code. Drücke Esc, um mit den Tasten zu spielen.';
    tastenStatus.className = 'im-textfeld';
  } else if (engine.modus === 'song') {
    tastenStatus.textContent = 'Song-Modus: Dein Ablauf spielt von vorne bis zum Ende. Leertaste Start/Stopp.';
    tastenStatus.className = '';
  } else {
    tastenStatus.textContent = 'Tasten bereit: Leertaste Start/Stopp, 1–8 Spuren, Q W E R T Szenen. Klick ins Textfeld, um Code zu schreiben.';
    tastenStatus.className = '';
  }
}

editor.addEventListener('focus', tastenStatusZeigen);
editor.addEventListener('blur', tastenStatusZeigen);

// ─── Play/Stop ───────────────────────────────────────────

function playKnopfZeigen() {
  playBtn.textContent = engine.isPlaying ? '\u25A0 Stop' : '\u25B6 Play';
  playBtn.classList.toggle('playing', engine.isPlaying);
}

function togglePlay() {
  if (engine.isPlaying) {
    engine.stop();
  } else {
    // Vor dem Start immer den aktuellen Code übernehmen
    if (!codeAusfuehren()) return;
    if (engine.modus === 'song' && engine.ablauf.length === 0) {
      zeigeMeldung('Im Song-Modus braucht dein Code einen Ablauf, zum Beispiel ablauf("q", "w", "e").', 'hinweis');
      return;
    }
    engine.start();
    if (engine.modus === 'song') zeigeMeldung('Dein Song läuft.', 'ok');
  }
  playKnopfZeigen();
  felderZeichnen();
}

engine.onEnde = () => {
  playKnopfZeigen();
  felderZeichnen();
  zeigeMeldung('Dein Song ist zu Ende. Drücke Play, um ihn noch einmal zu hören.', 'ok');
};

// ─── Code merken, speichern, öffnen ──────────────────────

// Beim Tippen automatisch im Browser merken (kurz nach der letzten Taste)
let merkenTimer = null;
let merkenHinweisGezeigt = false;
function codeSpaeterMerken() {
  clearTimeout(merkenTimer);
  merkenTimer = setTimeout(() => {
    if (!codeMerken(editor.value) && !merkenHinweisGezeigt) {
      merkenHinweisGezeigt = true;
      zeigeMeldung('Dein Browser erlaubt hier kein automatisches Merken. Sichere deinen Code mit „Code speichern“.', 'hinweis');
    }
  }, 500);
}
editor.addEventListener('input', codeSpaeterMerken);

/** Neuen Code ins Textfeld setzen, merken und prüfen */
function codeErsetzen(code, meldungText) {
  editor.value = code;
  editor.scrollTop = 0;
  codeMerken(code);
  if (codeAusfuehren()) zeigeMeldung(meldungText, 'ok');
}

function ersetzenErlaubt() {
  return confirm('Dein jetziger Code wird dabei ersetzt. Wenn du ihn behalten willst, klicke auf „Abbrechen“ und dann auf „Code speichern“.');
}

document.getElementById('speichern-btn').addEventListener('click', () => {
  const name = dateiname(editor.value, 'txt');
  herunterladen(codeAlsDatei(editor.value), name);
  zeigeMeldung(`Gespeichert: ${name}. Du findest die Datei in deinem Download-Ordner.`, 'ok');
});

const dateiAuswahl = document.getElementById('datei-auswahl');
document.getElementById('oeffnen-btn').addEventListener('click', () => {
  if (!ersetzenErlaubt()) return;
  dateiAuswahl.value = ''; // damit dieselbe Datei auch zweimal hintereinander geht
  dateiAuswahl.click();
});
dateiAuswahl.addEventListener('change', async () => {
  const datei = dateiAuswahl.files[0];
  if (!datei) return;
  try {
    codeErsetzen(await dateiLesen(datei), `Geöffnet: ${datei.name}. Drücke Play zum Anhören.`);
  } catch (e) {
    zeigeMeldung(e.message, 'fehler');
  }
});

// Link, in dem der ganze Code steckt – zum Weitergeben, z. B. in Moodle
document.getElementById('link-btn').addEventListener('click', async () => {
  const link = linkFuerCode(editor.value);
  try {
    await navigator.clipboard.writeText(link);
    zeigeMeldung('Link kopiert. Wer ihn öffnet, bekommt genau diesen Code. Füge ihn mit Strg+V ein, zum Beispiel in Moodle.', 'ok');
  } catch {
    // Manche Browser erlauben das Kopieren nicht – dann zum Selbstkopieren anzeigen
    prompt('Kopiere diesen Link (Strg+C):', link);
  }
});

document.getElementById('demo-btn').addEventListener('click', () => {
  if (!ersetzenErlaubt()) return;
  codeErsetzen(DEMO_TRACK, 'Der Demo-Track ist wieder da.');
});

// ─── Song als WAV speichern ──────────────────────────────

const exportBtn = document.getElementById('export-btn');

async function songSpeichern() {
  const programm = codePruefen();
  if (!programm) return;
  if (programm.ablauf.length === 0) {
    zeigeMeldung('Zum Speichern braucht dein Code einen Ablauf, zum Beispiel ablauf("q", "w", "e").', 'hinweis');
    return;
  }
  exportBtn.disabled = true;
  zeigeMeldung('Dein Song wird berechnet …', 'wartet');
  try {
    const buffer = await songBerechnen(programm, (prozent) => {
      zeigeMeldung(`Dein Song wird berechnet … ${prozent} %`, 'wartet');
    });
    const name = dateiname(editor.value);
    herunterladen(wavErzeugen(buffer), name);
    zeigeMeldung(`Gespeichert: ${name} (${Math.round(buffer.duration)} Sekunden). Du findest die Datei in deinem Download-Ordner.`, 'ok');
  } catch (e) {
    zeigeMeldung(e.message, 'fehler');
  } finally {
    exportBtn.disabled = false;
  }
}

exportBtn.addEventListener('click', songSpeichern);

// ─── Live- und Song-Modus ────────────────────────────────

function modusSetzen(modus) {
  if (engine.modus === modus) return;
  // Ein Wechsel stoppt die Musik. Danach startet Play im neuen Modus von vorne.
  if (engine.isPlaying) engine.stop();
  engine.modus = modus;
  modusLiveBtn.classList.toggle('gewaehlt', modus === 'live');
  modusSongBtn.classList.toggle('gewaehlt', modus === 'song');
  posDisplay.textContent = modus === 'song' ? `Teil 1 · Takt 1` : 'Takt 1 · Schritt 1';
  playKnopfZeigen();
  felderZeichnen();
  tastenStatusZeigen();
  zeigeMeldung(modus === 'song'
    ? 'Song-Modus: Drücke Play, dann spielt dein Ablauf von vorne bis zum Ende.'
    : 'Live-Modus: Du spielst selbst mit den Tasten 1–8 und Q W E R T.', 'hinweis');
}

modusLiveBtn.addEventListener('click', () => modusSetzen('live'));
modusSongBtn.addEventListener('click', () => modusSetzen('song'));

playBtn.addEventListener('click', togglePlay);
ausfuehrenBtn.addEventListener('click', codeAusfuehren);

document.addEventListener('keydown', (e) => {
  // Strg+Enter (Mac: Cmd+Enter): Code ausführen, auch im Textfeld
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    codeAusfuehren();
    return;
  }

  // Im Textfeld wird getippt. Nur Esc verlässt es.
  if (e.target === editor) {
    if (e.key === 'Escape') editor.blur();
    return;
  }

  // Tastenkürzel des Browsers (z. B. Strg+R) nicht abfangen
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  // Gedrückt gehaltene Taste nicht immer wieder auslösen
  if (e.repeat) return;

  if (e.code === 'Space') {
    e.preventDefault();
    togglePlay();
    return;
  }

  const taste = e.key.toLowerCase();
  if (taste >= '1' && taste <= '8' && taste.length === 1) {
    e.preventDefault();
    spurUmschalten(Number(taste));
  } else if (SZENEN_TASTEN.includes(taste)) {
    e.preventDefault();
    szeneStarten(taste);
  }
});

zeilennummernZeichnen();

// Beim Laden einmal ausführen, damit Tempo, Tonart und Felder stimmen
const startCodeOk = codeAusfuehren();
if (startMeldung[1] === 'fehler' || (startCodeOk && startMeldung[0] !== '')) {
  zeigeMeldung(...startMeldung);
} else if (startCodeOk && meldung.className === 'ok') {
  // „Alles in Ordnung.“ beim ersten Öffnen weglassen; Hinweise (z. B. 3-Takt-Muster) bleiben stehen
  zeigeMeldung('', '');
}
felderZeichnen();
tastenStatusZeigen();
