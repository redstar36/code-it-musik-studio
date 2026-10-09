// links.js – Code per Link öffnen (KONZEPT.md 3.5: Vorlagen per Link).
// Zwei Arten:
//   ?vorlage=lektion-1   feste Vorlage aus vorlagen.js (kurzer Link, bleibt gültig)
//   #code=…              der Code steckt im Link selbst (mit „Link kopieren“ erzeugt)
// Der Teil hinter # wird vom Browser nie an einen Server geschickt – gut für den Datenschutz.

import { VORLAGEN } from './vorlagen.js?v=8d8df3a';

/** Text → URL-taugliches Base64 (auch Umlaute) */
function kodieren(text) {
  const bytes = new TextEncoder().encode(text);
  let binaer = '';
  for (const b of bytes) binaer += String.fromCharCode(b);
  return btoa(binaer).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function dekodieren(kette) {
  const b64 = kette.replace(/-/g, '+').replace(/_/g, '/');
  const binaer = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const bytes = Uint8Array.from(binaer, (z) => z.charCodeAt(0));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

/** Link, der genau diesen Code öffnet */
export function linkFuerCode(code) {
  return `${location.origin}${location.pathname}#code=${kodieren(code)}`;
}

/** Link zu einer festen Vorlage */
export function linkFuerVorlage(name) {
  return `${location.origin}${location.pathname}?vorlage=${encodeURIComponent(name)}`;
}

/**
 * Schaut in die Adresszeile. Ergebnis:
 *   null                                   – kein Link-Code
 *   { code, beschreibung }                 – Code gefunden
 *   { fehler }                             – Link kaputt oder Vorlage unbekannt
 */
export function linkAuslesen() {
  const hash = new URLSearchParams(location.hash.slice(1));
  if (hash.has('code')) {
    try {
      return { code: dekodieren(hash.get('code')), beschreibung: 'den Code aus dem Link' };
    } catch {
      return { fehler: 'Der Link ist leider unvollständig. Vielleicht wurde er beim Kopieren abgeschnitten.' };
    }
  }

  const name = new URLSearchParams(location.search).get('vorlage');
  if (name !== null) {
    const vorlage = VORLAGEN[name];
    if (!vorlage) {
      return { fehler: `Die Vorlage „${name}“ gibt es nicht. Es gibt: ${Object.keys(VORLAGEN).join(', ')}.` };
    }
    return { code: vorlage.code, beschreibung: vorlage.titel };
  }
  return null;
}

/** Vorlage/Code aus der Adresszeile entfernen, damit Neuladen nicht wieder überschreibt */
export function linkEntfernen() {
  history.replaceState(null, '', location.pathname);
}
