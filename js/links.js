// links.js – Code per Link öffnen (KONZEPT.md 3.5: Vorlagen per Link).
// Zwei Arten:
//   ?vorlage=lektion-1   feste Vorlage aus vorlagen.js (kurzer Link, bleibt gültig)
//   #code=…              der Code steckt im Link selbst (mit „Link kopieren“ erzeugt)
//   ?stufe=4             zeigt nur die Bedienelemente bis Lektion 4 (KONZEPT.md 3.7)
//                        Bei ?vorlage=lektion-N… ergibt sich die Stufe N von selbst.
// Der Teil hinter # wird vom Browser nie an einen Server geschickt – gut für den Datenschutz.

import { VORLAGEN } from './vorlagen.js?v=c67231f';

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

/**
 * Stufe aus der Adresszeile (KONZEPT.md 3.7): ?stufe=N, sonst die Zahl aus ?vorlage=lektion-N…
 * Ohne Angabe sind alle Bedienelemente sichtbar (Infinity).
 */
export function stufeAuslesen() {
  const para = new URLSearchParams(location.search);
  const direkt = Number(para.get('stufe'));
  if (Number.isInteger(direkt) && direkt >= 1) return direkt;
  const treffer = /^lektion-(\d+)/.exec(para.get('vorlage') ?? '');
  return treffer ? Number(treffer[1]) : Infinity;
}

/** „?stufe=N“ für Links und die Adresszeile (leer, wenn alles sichtbar ist) */
function stufeTeil() {
  const stufe = stufeAuslesen();
  return Number.isFinite(stufe) ? `?stufe=${stufe}` : '';
}

/**
 * Link zu einer Seite des Werkzeugs mit eingebautem Code, z. B. aus der Ideen-Werkstatt ins Studio.
 * stufe: Zahl oder Infinity (dann ohne ?stufe), von: woher der Code kommt (für die Meldung)
 */
export function codeLinkFuer(code, seite, stufe, von) {
  const basis = location.pathname.replace(/[^/]*$/, '') + seite;
  const stufeText = Number.isFinite(stufe) ? `?stufe=${stufe}` : '';
  return `${location.origin}${basis}${stufeText}#code=${kodieren(code)}${von ? `&von=${von}` : ''}`;
}

/** Link, der genau diesen Code öffnet */
export function linkFuerCode(code) {
  return `${location.origin}${location.pathname}${stufeTeil()}#code=${kodieren(code)}`;
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
      const beschreibung = hash.get('von') === 'werkstatt' ? 'deine Idee aus der Ideen-Werkstatt' : 'den Code aus dem Link';
      return { code: dekodieren(hash.get('code')), beschreibung };
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
  history.replaceState(null, '', location.pathname + stufeTeil());
}
