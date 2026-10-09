// speicher.js – Code im Browser merken und als Datei speichern/öffnen.
// Alles bleibt auf dem eigenen Rechner, nichts geht an einen Server (KONZEPT.md 3.5, Datenschutz).

const SCHLUESSEL = 'musik-werkzeug:code';
const MAX_DATEIGROESSE = 100 * 1024; // 100 KB – ein Track hat nur wenige KB

/**
 * Gespeicherten Code aus dem Browser holen, oder null.
 * Der Zugriff kann scheitern (z. B. privates Fenster, gesperrte Website-Daten) – dann einfach null.
 */
export function codeLaden() {
  try {
    return localStorage.getItem(SCHLUESSEL);
  } catch {
    return null;
  }
}

/** Code im Browser merken. Gibt false zurück, wenn der Browser das nicht erlaubt. */
export function codeMerken(code) {
  try {
    localStorage.setItem(SCHLUESSEL, code);
    return true;
  } catch {
    return false;
  }
}

/** Code als Textdatei */
export function codeAlsDatei(code) {
  return new Blob([code], { type: 'text/plain;charset=utf-8' });
}

/** Textdatei lesen. Wirft einen Fehler mit verständlichem Text, wenn es keine passende Datei ist. */
export async function dateiLesen(datei) {
  if (datei.size > MAX_DATEIGROESSE) {
    throw new Error(`Die Datei ${datei.name} ist zu groß. Ist das wirklich dein Musik-Code?`);
  }
  const text = await datei.text();
  // Bilder, Audiodateien u. Ä. enthalten Steuerzeichen, die in Code nicht vorkommen
  if (/[\u0000-\u0008\u000E-\u001F]/.test(text)) {
    throw new Error(`Die Datei ${datei.name} ist keine Textdatei. Öffne eine Datei, die du mit „Code speichern“ gespeichert hast.`);
  }
  return text.replace(/\r\n/g, '\n');
}
