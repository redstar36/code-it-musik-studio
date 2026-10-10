// app.js – UI-Logik: Code ausführen, Play/Stop, Meldungen, Live-Steuerung

import { AudioEngine, TAKTE_PRO_TEIL } from './audio-engine.js?v=f646818';
import { programmAusfuehren, liveBefehle, SZENEN_TASTEN, ERSTER_TAKT } from './befehle.js?v=f646818';
import { CodeFehler } from './interpreter.js?v=f646818';
import { DEMO_TRACK } from './vorlagen.js?v=f646818';
import { songBerechnen, takteBerechnen, wavErzeugen, dateiname, herunterladen } from './export.js?v=f646818';
import { codeLaden, codeMerken, codeAlsDatei, dateiLesen } from './speicher.js?v=f646818';
import { linkAuslesen, linkEntfernen, linkFuerCode, stufeAuslesen } from './links.js?v=f646818';
import { rasterEinrichten } from './raster.js?v=f646818';

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
let raster = null;  // Beat-Raster unter dem Textfeld (ab Stufe 2), siehe unten

// ─── Start-Code bestimmen ────────────────────────────────
// Reihenfolge: Code aus dem Link (Vorlage) → Code vom letzten Mal → Demo-Track

const gemerkterCode = codeLaden();
let startCode = gemerkterCode ?? DEMO_TRACK;
let startMeldung = gemerkterCode !== null ? ['Dein Code vom letzten Mal ist wieder da.', 'hinweis'] : ['', ''];

// Stufe (KONZEPT.md 3.7): Elemente mit data-ab="N" erscheinen erst ab Lektion N
const stufe = stufeAuslesen();
for (const element of document.querySelectorAll('[data-ab]')) {
  if (Number(element.dataset.ab) > stufe) element.classList.add('stufe-aus');
}

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

// ─── Einrücken im Textfeld (für Schleifen) ───────────────

const EINRUECKUNG = '    '; // 4 Leerzeichen, wie in Python üblich

/** Text an der Cursorposition einfügen, so dass Rückgängig (Strg+Z) weiter funktioniert */
function textEinfuegen(text) {
  if (!document.execCommand('insertText', false, text)) {
    editor.setRangeText(text, editor.selectionStart, editor.selectionEnd, 'end');
    editor.dispatchEvent(new Event('input'));
  }
}

/** Tab: einrücken, Shift+Tab: ausrücken – für die aktuelle Zeile oder alle markierten Zeilen */
function einruecken(aus) {
  const text = editor.value;
  const start = editor.selectionStart;
  const ende = editor.selectionEnd;
  const mehrereZeilen = text.slice(start, ende).includes('\n');

  if (!aus && !mehrereZeilen) {
    textEinfuegen(EINRUECKUNG);
    return;
  }
  // Ganze Zeilen markieren und jede Zeile ein- oder ausrücken
  const zeilenStart = text.lastIndexOf('\n', start - 1) + 1;
  let zeilenEnde = text.indexOf('\n', ende - (ende > start && text[ende - 1] === '\n' ? 1 : 0));
  if (zeilenEnde === -1) zeilenEnde = text.length;
  const zeilen = text.slice(zeilenStart, zeilenEnde).split('\n');
  const neu = zeilen.map((z) => aus ? z.replace(/^( {1,4}|\t)/, '') : (z.trim() === '' ? z : EINRUECKUNG + z)).join('\n');
  editor.setSelectionRange(zeilenStart, zeilenEnde);
  textEinfuegen(neu);
  editor.setSelectionRange(zeilenStart, zeilenStart + neu.length);
}

/** Enter: neue Zeile mit derselben Einrückung, nach einem Doppelpunkt eine Stufe weiter */
function neueZeileMitEinrueckung() {
  const text = editor.value;
  const zeilenStart = text.lastIndexOf('\n', editor.selectionStart - 1) + 1;
  const bisCursor = text.slice(zeilenStart, editor.selectionStart);
  let einrueckung = bisCursor.match(/^[ \t]*/)[0];
  if (bisCursor.replace(/#.*$/, '').trimEnd().endsWith(':')) einrueckung += EINRUECKUNG;
  textEinfuegen('\n' + einrueckung);
}
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

// Zuletzt ausgeführter Code und sein Ergebnis. „Song als WAV“ speichert genau das, was zu hören war –
// auch wenn der Code zufall() enthält, wird dafür nicht neu gewürfelt.
let zuletztAusgefuehrt = { code: null, programm: null };

/** Führt den Code aus. Gibt true zurück, wenn er fehlerfrei war. */
function codeAusfuehren() {
  const programm = codePruefen();
  if (!programm) return false;
  zuletztAusgefuehrt = { code: editor.value, programm };
  eigeneTastenZeichnen(programm);
  jederTaktAngehalten = false;

  if (programm.ausgaben.length > 0) {
    // Ausgaben von zeige(), dazu ein eventueller Hinweis
    zeigeMeldung([...programm.ausgaben, ...programm.hinweise.slice(0, 1)].join('\n'), 'ausgabe');
  } else if (programm.hinweise.length > 0) {
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
  raster?.schritt(step, bar);
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
    tastenStatus.textContent = 'Song-Modus: Dein Ablauf spielt von vorne bis zum Ende. Leertaste Start/Stopp, Enter Aufnahme.';
    tastenStatus.className = '';
  } else {
    // Nur die Tasten nennen, die es in dieser Stufe schon gibt (KONZEPT.md 3.7)
    const tasten = ['Leertaste Start/Stopp', '1–8 Spuren', 'Q W E R T Szenen'];
    if (stufe >= 8) tasten.push('↑ ↓ Filter');
    if (stufe >= 9) tasten.push('F Fill');
    if (stufe >= 4) tasten.push('Enter Aufnahme');
    tastenStatus.textContent = `Tasten bereit: ${tasten.join(', ')}. Klick ins Textfeld, um Code zu schreiben.`;
    tastenStatus.className = '';
  }
}

editor.addEventListener('focus', tastenStatusZeigen);
editor.addEventListener('blur', tastenStatusZeigen);

// ─── Play/Stop ───────────────────────────────────────────

function playKnopfZeigen() {
  playBtn.textContent = engine.isPlaying ? '\u25A0 Stop' : '\u25B6 Play';
  playBtn.classList.toggle('playing', engine.isPlaying);
  if (!engine.isPlaying) raster?.stopp();
}

/** Musik starten. Gibt false zurück, wenn es nicht geht (Fehler im Code, kein Ablauf im Song-Modus). */
function musikStarten() {
  anhoerenStoppen();
  // Vor dem Start immer den aktuellen Code übernehmen
  if (!codeAusfuehren()) return false;
  if (engine.modus === 'song' && engine.ablauf.length === 0) {
    zeigeMeldung('Im Song-Modus braucht dein Code einen Ablauf, zum Beispiel ablauf("q", "w", "e").', 'hinweis');
    return false;
  }
  engine.start();
  if (engine.modus === 'song') zeigeMeldung('Dein Song läuft.', 'ok');
  playKnopfZeigen();
  felderZeichnen();
  return true;
}

function togglePlay() {
  if (engine.isPlaying) {
    engine.stop();
    playKnopfZeigen();
    felderZeichnen();
  } else {
    musikStarten();
  }
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

// Ideen-Werkstatt (KONZEPT.md 3.10, ab Stufe 11); der Code im Studio bleibt gemerkt
document.getElementById('werkstatt-btn').addEventListener('click', () => {
  location.href = 'werkstatt.html' + (Number.isFinite(stufe) ? `?stufe=${stufe}` : '');
});

document.getElementById('demo-btn').addEventListener('click', () => {
  if (!ersetzenErlaubt()) return;
  codeErsetzen(DEMO_TRACK, 'Der Demo-Track ist wieder da.');
});

// ─── Effekte und eigene Tasten (Lektion 8) ───────────────

const filterRegler = document.getElementById('filter-regler');
const filterWert = document.getElementById('filter-wert');
const fillBtn = document.getElementById('fill-btn');
const eigeneTastenFeld = document.getElementById('eigene-tasten');

// Was die Befehle in eigenen Funktionen beim Tastendruck tun
const aktionen = {
  szeneStarten: (taste) => engine.szeneStarten(taste),
  filter: (wert) => engine.filterSetzen(wert),
  fill: () => engine.fillPlanen(),
  zeige: (text) => zeigeMeldung(text, 'ausgabe'),
  spurSetzen: (nr, daten) => engine.spurSetzen(nr, daten),
};

// jeder_takt(takt): Das Werkzeug ruft sie zu Beginn jedes Takts auf (läuft im Scheduler).
// Bei einem Fehler wird jeder_takt angehalten, bis der Code neu ausgeführt wird.
let jederTaktAngehalten = false;
engine.onTaktBeginn = (takt) => {
  const programm = engine.programm;
  if (!programm || !programm.jederTakt || jederTaktAngehalten) return;
  try {
    programm.aufrufen(programm.jederTakt, [takt + ERSTER_TAKT], liveBefehle(programm, aktionen));
  } catch (e) {
    if (!(e instanceof CodeFehler)) throw e;
    jederTaktAngehalten = true;
    setTimeout(() => {
      fehlerZeile = e.zeile;
      zeilennummernZeichnen();
      zeigeMeldung(`${e.message} (jeder_takt ist angehalten, bis du den Code neu ausführst.)`, 'fehler');
    }, 0);
  }
};

/** Eigene Funktion ausführen, die mit taste() auf diesem Buchstaben liegt. false, wenn keine dort liegt. */
function eigeneTaste(buchstabe) {
  const programm = zuletztAusgefuehrt.programm;
  const funktion = programm && programm.tasten.get(buchstabe);
  if (!funktion) return false;
  if (engine.modus === 'song') {
    zeigeMeldung(SONG_HINWEIS, 'hinweis');
    return true;
  }
  try {
    programm.aufrufen(funktion, [], liveBefehle(programm, aktionen));
  } catch (e) {
    if (!(e instanceof CodeFehler)) throw e;
    fehlerZeile = e.zeile;
    zeilennummernZeichnen();
    zeigeMeldung(e.message, 'fehler');
  }
  return true;
}

/** Die eigenen Tasten als Knöpfe anzeigen */
function eigeneTastenZeichnen(programm) {
  eigeneTastenFeld.replaceChildren();
  for (const [buchstabe, funktion] of programm.tasten) {
    const knopf = document.createElement('button');
    knopf.tabIndex = -1;
    knopf.innerHTML = '<b></b><span></span>';
    knopf.querySelector('b').textContent = buchstabe;
    knopf.querySelector('span').textContent = funktion.name;
    knopf.addEventListener('click', () => eigeneTaste(buchstabe));
    eigeneTastenFeld.append(knopf);
  }
}

function filterVerschieben(schritt) {
  engine.filterSetzen(Math.round((engine.filterWert + schritt) * 10) / 10);
}

filterRegler.addEventListener('input', () => engine.filterSetzen(filterRegler.value / 100));
fillBtn.addEventListener('click', () => engine.fillPlanen());

engine.onEffekte = (info) => {
  filterRegler.value = Math.round(info.filter * 100);
  filterWert.textContent = info.filter >= 1 ? 'offen' : `${Math.round(info.filter * 100)} %`;
  fillBtn.classList.toggle('blinkt', info.fillGeplant);
  fillBtn.classList.toggle('an', info.fillAktiv && !info.fillGeplant);
};

// ─── Live-Aufnahme (Taste Enter) ─────────────────────────

const aufnahmeBtn = document.getElementById('aufnahme-btn');
const aufnahmeStatus = document.getElementById('aufnahme-status');
const aufnahmeErgebnis = document.getElementById('aufnahme-ergebnis');
const aufnahmeInfo = document.getElementById('aufnahme-info');
const anhoerenBtn = document.getElementById('anhoeren-btn');
const aufnahmeWavBtn = document.getElementById('aufnahme-wav-btn');

let letzteAufnahme = null;  // { takte, sekunden, code }
let aufnahmePuffer = null;  // fertig berechnete Aufnahme (beim ersten Anhören oder Speichern)
let wiedergabe = null;      // läuft gerade das Anhören?

function zeitText(sekunden) {
  const s = Math.round(sekunden);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function aufnahmeUmschalten() {
  if (engine.aufnahme) {
    engine.aufnahmeBeenden();
    return;
  }
  engine.aufnahmeStarten();
  if (!engine.isPlaying) {
    // Ohne laufende Musik: Musik und Aufnahme starten zusammen
    if (musikStarten()) {
      zeigeMeldung('Die Aufnahme läuft. Drücke Enter, um sie zu beenden.', 'ok');
    } else {
      engine.aufnahmeBeenden();
    }
  } else {
    zeigeMeldung('Die Aufnahme beginnt am Anfang des nächsten Takts.', 'hinweis');
  }
}

engine.onAufnahme = (info) => {
  aufnahmeBtn.classList.toggle('wartet', info.zustand === 'wartet');
  aufnahmeBtn.classList.toggle('laeuft', info.zustand === 'laeuft');
  if (info.zustand === 'wartet') {
    aufnahmeBtn.textContent = '● Wartet auf den Takt …';
    aufnahmeStatus.textContent = '';
  } else if (info.zustand === 'laeuft') {
    if (aufnahmeBtn.textContent.startsWith('● Wartet')) {
      zeigeMeldung('Die Aufnahme läuft. Drücke Enter, um sie zu beenden.', 'ok');
    }
    aufnahmeBtn.textContent = '■ Aufnahme beenden';
    aufnahmeStatus.textContent = `${info.takte} ${info.takte === 1 ? 'Takt' : 'Takte'} · ${zeitText(info.sekunden)}`;
  } else {
    aufnahmeBtn.textContent = '● Aufnehmen';
    aufnahmeStatus.textContent = '';
  }
  if (info.zustand === 'fertig') {
    letzteAufnahme = { takte: info.takte, sekunden: info.sekunden, code: editor.value };
    aufnahmePuffer = null;
    aufnahmeInfo.textContent = `Deine Aufnahme: ${info.takte.length} ${info.takte.length === 1 ? 'Takt' : 'Takte'}, ${zeitText(info.sekunden)}`;
    aufnahmeErgebnis.hidden = false;
    playKnopfZeigen();
    felderZeichnen();
    zeigeMeldung('Aufnahme fertig! Hör sie dir an oder speichere sie als WAV.', 'ok');
  } else if (info.zustand === 'leer') {
    playKnopfZeigen();
    if (meldung.className !== 'fehler') zeigeMeldung('Aufnahme abgebrochen. Es wurde noch kein Takt aufgenommen.', 'hinweis');
  }
};

/** Die letzte Aufnahme berechnen (nur einmal, danach aus dem Speicher) */
async function aufnahmeBerechnen() {
  if (!aufnahmePuffer) {
    aufnahmePuffer = await takteBerechnen(letzteAufnahme.takte, (prozent) => {
      zeigeMeldung(`Deine Aufnahme wird berechnet … ${prozent} %`, 'wartet');
    });
  }
  return aufnahmePuffer;
}

function anhoerenStoppen() {
  if (!wiedergabe) return;
  wiedergabe.onended = null;
  wiedergabe.stop();
  wiedergabe = null;
  anhoerenBtn.textContent = '▶ Anhören';
}

anhoerenBtn.addEventListener('click', async () => {
  if (wiedergabe) {
    anhoerenStoppen();
    return;
  }
  if (engine.isPlaying) togglePlay(); // Live-Musik und Aufnahme nicht übereinander
  engine.init();
  anhoerenBtn.disabled = aufnahmeWavBtn.disabled = true;
  zeigeMeldung('Deine Aufnahme wird berechnet …', 'wartet');
  try {
    const puffer = await aufnahmeBerechnen();
    const quelle = engine.audioCtx.createBufferSource();
    quelle.buffer = puffer;
    quelle.connect(engine.audioCtx.destination); // schon fertig abgemischt
    quelle.onended = () => {
      wiedergabe = null;
      anhoerenBtn.textContent = '▶ Anhören';
    };
    quelle.start();
    wiedergabe = quelle;
    anhoerenBtn.textContent = '■ Stopp';
    zeigeMeldung('Du hörst deine Aufnahme.', 'ok');
  } catch (e) {
    zeigeMeldung(e.message, 'fehler');
  } finally {
    anhoerenBtn.disabled = aufnahmeWavBtn.disabled = false;
  }
});

aufnahmeWavBtn.addEventListener('click', async () => {
  anhoerenBtn.disabled = aufnahmeWavBtn.disabled = true;
  zeigeMeldung('Deine Aufnahme wird berechnet …', 'wartet');
  try {
    const puffer = await aufnahmeBerechnen();
    const name = dateiname(letzteAufnahme.code, 'wav').replace(/\.wav$/, '-live.wav');
    herunterladen(wavErzeugen(puffer), name);
    zeigeMeldung(`Gespeichert: ${name} (${Math.round(puffer.duration)} Sekunden). Du findest die Datei in deinem Download-Ordner.`, 'ok');
  } catch (e) {
    zeigeMeldung(e.message, 'fehler');
  } finally {
    anhoerenBtn.disabled = aufnahmeWavBtn.disabled = false;
  }
});

aufnahmeBtn.addEventListener('click', aufnahmeUmschalten);

// ─── Song als WAV speichern ──────────────────────────────

const exportBtn = document.getElementById('export-btn');

async function songSpeichern() {
  // Unveränderter Code: genau das speichern, was zu hören war (kein neues Würfeln)
  const programm = editor.value === zuletztAusgefuehrt.code ? zuletztAusgefuehrt.programm : codePruefen();
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
    else if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      einruecken(e.shiftKey);
    } else if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      neueZeileMitEinrueckung();
    }
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

  if (e.key === 'Enter') {
    if (stufe < 4) return;
    e.preventDefault();
    aufnahmeUmschalten();
    return;
  }

  // Filter mit den Pfeiltasten, Fill mit F (auch im Song-Modus)
  if (stufe >= 8 && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    e.preventDefault();
    filterVerschieben(e.key === 'ArrowUp' ? 0.1 : -0.1);
    return;
  }
  if (stufe >= 9 && e.key.toLowerCase() === 'f') {
    e.preventDefault();
    engine.fillPlanen();
    return;
  }

  const taste = e.key.toLowerCase();
  if (taste >= '1' && taste <= '8' && taste.length === 1) {
    e.preventDefault();
    spurUmschalten(Number(taste));
  } else if (SZENEN_TASTEN.includes(taste)) {
    e.preventDefault();
    szeneStarten(taste);
  } else if (stufe >= 8 && /^[a-z]$/.test(taste) && eigeneTaste(taste)) {
    e.preventDefault();
  }
});

zeilennummernZeichnen();

// Raster für Beats (ab Stufe 2) und Melodien (ab Stufe 3), KONZEPT.md 3.8: Ein Klick ändert den Code. Läuft Musik, wird er gleich übernommen.
if (stufe >= 2) {
  raster = rasterEinrichten(editor, document.getElementById('beat-raster'), stufe, () => {
    if (engine.isPlaying) codeAusfuehren();
  });
}

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
