// export.js – Song als WAV-Datei speichern.
// Der Ablauf wird nicht in Echtzeit abgespielt, sondern im Hintergrund in wenigen Sekunden
// berechnet (OfflineAudioContext). Dabei laufen genau dieselben Klänge und dieselbe Gesamtsumme
// wie beim Abspielen.

import { AudioEngine, summeAufbauen, TAKTE_PRO_TEIL } from './audio-engine.js?v=8d8df3a';

const ABTASTRATE = 44100;
const NACHKLANG = 2;          // Sekunden nach dem letzten Takt, damit Becken & Co. ausklingen
const MAX_SEKUNDEN = 10 * 60; // längere Songs würden zu viel Speicher brauchen

/** Länge des Songs in Sekunden (ohne Nachklang) */
export function songDauer(programm) {
  const takte = programm.ablauf.length * TAKTE_PRO_TEIL;
  return (takte * 16 * 60) / programm.tempo / 4;
}

/**
 * Berechnet den Song (Ablauf) und gibt einen AudioBuffer zurück.
 * beiFortschritt(prozent) wird zwischendurch aufgerufen (10, 20, … 90).
 * Wirft einen Fehler mit Text, wenn der Song zu lang ist.
 */
export async function songBerechnen(programm, beiFortschritt = () => {}) {
  const dauer = songDauer(programm);
  if (dauer > MAX_SEKUNDEN) {
    throw new Error(`Dein Song ist ${Math.round(dauer / 60)} Minuten lang. Speichern geht bis ${MAX_SEKUNDEN / 60} Minuten.`);
  }

  const ctx = new OfflineAudioContext(2, Math.ceil((dauer + NACHKLANG) * ABTASTRATE), ABTASTRATE);
  const engine = new AudioEngine();
  engine.audioCtx = ctx;
  engine.ausgang = summeAufbauen(ctx);
  engine.setProgramm(programm);

  const start = 0.05;
  const takte = programm.ablauf.length * TAKTE_PRO_TEIL;
  for (let takt = 0; takt < takte; takt++) {
    // Zu Beginn jedes Teils die Szene aus dem Ablauf einschalten (wie im Song-Modus)
    if (takt % TAKTE_PRO_TEIL === 0) {
      const szene = programm.szenen.get(programm.ablauf[takt / TAKTE_PRO_TEIL]) ?? [];
      engine.aktiv = new Set(szene.filter((nr) => programm.spuren.has(nr)));
    }
    engine.currentBar = takt;
    for (let schritt = 0; schritt < 16; schritt++) {
      engine._playStep(schritt, start + (takt * 16 + schritt) * engine.stepDuration);
    }
  }

  // Fortschritt: Berechnung bei jedem Zehntel kurz anhalten, melden und weiterlaufen lassen.
  // Nicht jeder Browser kann das (Firefox nicht) – dann ohne Prozentanzeige.
  const gesamt = ctx.length / ABTASTRATE;
  const kannAnhalten = typeof ctx.suspend === 'function';
  for (let zehntel = 1; kannAnhalten && zehntel < 10; zehntel++) {
    ctx.suspend((gesamt * zehntel) / 10).then(() => {
      beiFortschritt(zehntel * 10);
      ctx.resume();
    });
  }

  return ctx.startRendering();
}

/** AudioBuffer → WAV-Datei (16 Bit, Stereo) */
export function wavErzeugen(buffer) {
  const kanaele = buffer.numberOfChannels;
  const laenge = buffer.length;
  const bytesProProbe = 2;
  const datenGroesse = laenge * kanaele * bytesProProbe;
  const ansicht = new DataView(new ArrayBuffer(44 + datenGroesse));

  const text = (pos, s) => { for (let i = 0; i < s.length; i++) ansicht.setUint8(pos + i, s.charCodeAt(i)); };
  // Kopf der WAV-Datei (RIFF-Format)
  text(0, 'RIFF');
  ansicht.setUint32(4, 36 + datenGroesse, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  ansicht.setUint32(16, 16, true);                       // Länge des fmt-Abschnitts
  ansicht.setUint16(20, 1, true);                        // PCM
  ansicht.setUint16(22, kanaele, true);
  ansicht.setUint32(24, buffer.sampleRate, true);
  ansicht.setUint32(28, buffer.sampleRate * kanaele * bytesProProbe, true);
  ansicht.setUint16(32, kanaele * bytesProProbe, true);
  ansicht.setUint16(34, 16, true);                       // Bit pro Probe
  text(36, 'data');
  ansicht.setUint32(40, datenGroesse, true);

  // Proben abwechselnd links/rechts, von -1…1 auf 16-Bit-Ganzzahlen
  const daten = [];
  for (let k = 0; k < kanaele; k++) daten.push(buffer.getChannelData(k));
  let pos = 44;
  for (let i = 0; i < laenge; i++) {
    for (let k = 0; k < kanaele; k++) {
      const v = Math.max(-1, Math.min(1, daten[k][i]));
      ansicht.setInt16(pos, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      pos += 2;
    }
  }
  return new Blob([ansicht], { type: 'audio/wav' });
}

/** Dateiname aus der ersten Kommentarzeile, z. B. "# Die Schatzinsel bei Nacht" → die-schatzinsel-bei-nacht.wav */
export function dateiname(code, endung = 'wav') {
  const erste = code.split('\n').find((z) => z.trim() !== '');
  let name = erste && erste.trim().startsWith('#') ? erste.trim().slice(1).trim() : '';
  name = name.toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 50);
  return `${name || 'mein-song'}.${endung}`;
}

/** Datei im Browser herunterladen */
export function herunterladen(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
