// interpreter.js – liest eine kleine Python-Teilmenge und führt sie aus.
// Unterstützt bisher: Kommentare, Zahlen, Zeichenketten, Listen, Variablen,
// Grundrechenarten und Funktionsaufrufe mit benannten Argumenten.
// Die Funktionen selbst (tempo, beat, spur …) kommen von außen (befehle.js).

/** Fehler im Code des Kindes – immer mit Zeilenangabe */
export class CodeFehler extends Error {
  constructor(text, zeile) {
    super(text);
    this.zeile = zeile;
  }
}

/** Fehler mit dem üblichen Satzanfang „In Zeile N …“ */
export function fehler(zeile, text) {
  return new CodeFehler(`In Zeile ${zeile} ${text}`, zeile);
}

// Python-Wörter, die das Werkzeug erst in späteren Lektionen versteht
const SPAETER = ['for', 'in', 'if', 'else', 'elif', 'while', 'def', 'return',
  'import', 'from', 'class', 'and', 'or', 'not', 'True', 'False', 'None'];

// ─── Zerlegen in Wörter (Tokens) ─────────────────────────

function zerlege(code) {
  const tokens = [];
  let zeile = 1;
  let i = 0;
  let zeilenAnfang = true;

  const push = (typ, wert) => tokens.push({ typ, wert, zeile });

  while (i < code.length) {
    const c = code[i];

    // Einrückung am Zeilenanfang (später für for/if/def wichtig)
    if (zeilenAnfang && (c === ' ' || c === '\t')) {
      let j = i;
      while (j < code.length && (code[j] === ' ' || code[j] === '\t')) j++;
      const rest = code[j];
      if (rest !== undefined && rest !== '\n' && rest !== '\r' && rest !== '#') {
        throw fehler(zeile, 'steht am Anfang ein Leerzeichen zu viel. Lösche die Leerzeichen vor dem ersten Wort.');
      }
      i = j;
      continue;
    }
    zeilenAnfang = false;

    if (c === '\n') {
      push('ZEILENENDE');
      zeile++;
      zeilenAnfang = true;
      i++;
      continue;
    }
    if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }

    // Kommentar bis Zeilenende
    if (c === '#') {
      while (i < code.length && code[i] !== '\n') i++;
      continue;
    }

    // Zeichenkette
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < code.length && code[j] !== c && code[j] !== '\n') j++;
      if (code[j] !== c) {
        throw fehler(zeile, `fehlt das schließende Anführungszeichen ${c}.`);
      }
      push('TEXT', code.slice(i + 1, j));
      i = j + 1;
      continue;
    }

    // Typografische Anführungszeichen (kommen beim Kopieren aus Textprogrammen)
    if ('„“”‚‘’'.includes(c)) {
      throw fehler(zeile, `steht das Anführungszeichen ${c}. Benutze stattdessen die geraden Anführungszeichen " von der Tastatur.`);
    }

    // Zahl
    if (/[0-9]/.test(c)) {
      let j = i;
      while (j < code.length && /[0-9.]/.test(code[j])) j++;
      const text = code.slice(i, j);
      // Buchstabe direkt hinter der Zahl, z. B. 17O (O statt Null) oder 1l (l statt Eins)
      if (j < code.length && /\p{L}/u.test(code[j])) {
        let k = j;
        while (k < code.length && /[\p{L}\p{N}]/u.test(code[k])) k++;
        const wort = code.slice(i, k);
        const korrigiert = wort.replace(/[oO]/g, '0').replace(/[lI]/g, '1');
        if (/^[0-9.]+$/.test(korrigiert)) {
          throw fehler(zeile, `steht ${wort}. Darin ist ein Buchstabe statt einer Ziffer. Meintest du ${korrigiert}?`);
        }
        throw fehler(zeile, `steht direkt hinter der Zahl ${text} ein Buchstabe (${wort}). Zahlen und Namen müssen getrennt sein.`);
      }
      const zahl = Number(text);
      if (Number.isNaN(zahl)) throw fehler(zeile, `verstehe ich die Zahl ${text} nicht.`);
      push('ZAHL', zahl);
      i = j;
      continue;
    }

    // Name (Buchstaben, Ziffern, Unterstrich – auch Umlaute, damit wir sie erkennen)
    if (/[\p{L}_]/u.test(c)) {
      let j = i;
      while (j < code.length && /[\p{L}\p{N}_]/u.test(code[j])) j++;
      const name = code.slice(i, j);
      if (SPAETER.includes(name)) {
        throw fehler(zeile, `steht ${name}. Das kann das Werkzeug noch nicht.`);
      }
      push('NAME', name);
      i = j;
      continue;
    }

    // Satzzeichen
    if ('()[],=+-*/%'.includes(c)) {
      push('ZEICHEN', c);
      i++;
      continue;
    }

    // Punkte gehören in Muster, also zwischen Anführungszeichen
    if (c === '.') {
      throw fehler(zeile, 'steht ein Punkt außerhalb der Anführungszeichen. Punkte gehören in ein Muster, zum Beispiel "x... x... x... x...".');
    }

    throw fehler(zeile, `verstehe ich das Zeichen ${c} nicht.`);
  }

  push('ZEILENENDE');
  push('ENDE');
  return tokens;
}

// ─── Satzbau verstehen (Parser) ──────────────────────────

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }

  get aktuell() { return this.tokens[this.pos]; }
  weiter() { return this.tokens[this.pos++]; }
  ist(typ, wert) {
    const t = this.aktuell;
    return t.typ === typ && (wert === undefined || t.wert === wert);
  }

  erwarte(wert, hinweis) {
    if (this.ist('ZEICHEN', wert)) return this.weiter();
    throw fehler(this.aktuell.zeile, hinweis);
  }

  programm() {
    const anweisungen = [];
    while (!this.ist('ENDE')) {
      if (this.ist('ZEILENENDE')) { this.weiter(); continue; }
      anweisungen.push(this.anweisung());
    }
    return anweisungen;
  }

  anweisung() {
    const zeile = this.aktuell.zeile;
    let knoten;

    // Zuweisung: name = ausdruck
    if (this.ist('NAME') && this.tokens[this.pos + 1].typ === 'ZEICHEN' && this.tokens[this.pos + 1].wert === '=') {
      const name = this.weiter().wert;
      this.weiter(); // '='
      if (this.ist('ZEILENENDE')) throw fehler(zeile, `fehlt hinter ${name} = noch etwas.`);
      knoten = { art: 'zuweisung', name, wert: this.ausdruck(), zeile };
    } else {
      knoten = { art: 'ausdruck', wert: this.ausdruck(), zeile };
    }

    if (!this.ist('ZEILENENDE')) {
      const t = this.aktuell;
      if (knoten.wert.art === 'name' && (t.typ === 'ZAHL' || t.typ === 'TEXT')) {
        const n = knoten.wert.name;
        throw fehler(zeile, `fehlen die Klammern. Schreibe zum Beispiel ${n}(${t.typ === 'TEXT' ? `"${t.wert}"` : t.wert}).`);
      }
      if (t.typ === 'ZEICHEN' && t.wert === ')') {
        throw fehler(t.zeile, 'ist eine Klammer ) zu viel.');
      }
      throw fehler(t.zeile, 'steht mehr als ein Befehl. Schreibe jeden Befehl in eine eigene Zeile.');
    }
    this.weiter();
    return knoten;
  }

  // Punktrechnung vor Strichrechnung
  ausdruck() {
    let links = this.term();
    while (this.ist('ZEICHEN', '+') || this.ist('ZEICHEN', '-')) {
      const op = this.weiter();
      links = { art: 'rechnung', op: op.wert, links, rechts: this.term(), zeile: op.zeile };
    }
    return links;
  }

  term() {
    let links = this.einzeln();
    while (this.ist('ZEICHEN', '*') || this.ist('ZEICHEN', '/') || this.ist('ZEICHEN', '%')) {
      const op = this.weiter();
      links = { art: 'rechnung', op: op.wert, links, rechts: this.einzeln(), zeile: op.zeile };
    }
    return links;
  }

  einzeln() {
    const t = this.aktuell;

    if (this.ist('ZEICHEN', '-')) {
      this.weiter();
      return { art: 'rechnung', op: '-', links: { art: 'wert', wert: 0 }, rechts: this.einzeln(), zeile: t.zeile };
    }
    if (t.typ === 'ZAHL' || t.typ === 'TEXT') {
      this.weiter();
      return { art: 'wert', wert: t.wert };
    }
    if (this.ist('ZEICHEN', '(')) {
      this.weiter();
      const innen = this.ausdruck();
      this.erwarte(')', 'fehlt eine schließende Klammer ).');
      return innen;
    }
    if (this.ist('ZEICHEN', '[')) {
      return this.liste();
    }
    if (t.typ === 'NAME') {
      this.weiter();
      if (this.ist('ZEICHEN', '(')) return this.aufruf(t);
      return { art: 'name', name: t.wert, zeile: t.zeile };
    }
    if (t.typ === 'ZEILENENDE' || t.typ === 'ENDE') {
      throw fehler(t.zeile, 'hört der Befehl zu früh auf. Fehlt noch etwas?');
    }
    throw fehler(t.zeile, `steht ${t.wert} an einer Stelle, wo ich es nicht erwartet habe.`);
  }

  liste() {
    const start = this.weiter(); // '['
    const elemente = [];
    while (!this.ist('ZEICHEN', ']')) {
      if (this.ist('ZEILENENDE')) throw fehler(start.zeile, 'fehlt eine schließende eckige Klammer ].');
      elemente.push(this.ausdruck());
      if (!this.ist('ZEICHEN', ']')) {
        this.erwarte(',', 'fehlt ein Komma zwischen zwei Einträgen der Liste.');
      }
    }
    this.weiter(); // ']'
    return { art: 'liste', elemente };
  }

  aufruf(nameToken) {
    this.weiter(); // '('
    const positionell = [];
    const benannt = {};

    while (!this.ist('ZEICHEN', ')')) {
      if (this.ist('ZEILENENDE')) {
        throw fehler(nameToken.zeile, 'fehlt eine schließende Klammer ).');
      }
      const t = this.aktuell;
      const naechstes = this.tokens[this.pos + 1];
      if (t.typ === 'NAME' && naechstes.typ === 'ZEICHEN' && naechstes.wert === '=') {
        // benanntes Argument: klang="kick"
        this.weiter(); this.weiter();
        benannt[t.wert] = { wert: this.ausdruck(), zeile: t.zeile };
      } else {
        if (Object.keys(benannt).length > 0) {
          throw fehler(t.zeile, 'stehen die Angaben in der falschen Reihenfolge. Angaben mit = kommen immer am Schluss.');
        }
        positionell.push(this.ausdruck());
      }
      if (!this.ist('ZEICHEN', ')')) {
        if (this.ist('ZEILENENDE') || this.ist('ENDE')) {
          throw fehler(nameToken.zeile, 'fehlt eine schließende Klammer ).');
        }
        this.erwarte(',', 'fehlt ein Komma zwischen zwei Angaben.');
      }
    }
    this.weiter(); // ')'
    return { art: 'aufruf', name: nameToken.wert, positionell, benannt, zeile: nameToken.zeile };
  }
}

// ─── Ausführen ───────────────────────────────────────────

/** Ähnlichstes Wort finden, für „Meintest du …?“ */
export function aehnlichstes(wort, kandidaten) {
  let bestes = null;
  let besterAbstand = Infinity;
  for (const k of kandidaten) {
    const d = abstand(wort.toLowerCase(), k.toLowerCase());
    if (d < besterAbstand) { besterAbstand = d; bestes = k; }
  }
  const grenze = wort.length <= 4 ? 1 : 2;
  return besterAbstand <= grenze ? bestes : null;
}

function abstand(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[a.length][b.length];
}

function meintestDu(wort, kandidaten) {
  const vorschlag = aehnlichstes(wort, kandidaten);
  return vorschlag ? ` Meintest du ${vorschlag}?` : '';
}

/**
 * Führt den Code aus.
 * befehle: { name: function(positionell, benannt, zeile) }
 *   benannt ist ein Objekt { name: { wert, zeile } }
 */
export function ausfuehren(code, befehle) {
  const anweisungen = new Parser(zerlege(code)).programm();
  const variablen = new Map();

  function auswerten(k) {
    switch (k.art) {
      case 'wert':
        return k.wert;

      case 'liste':
        return k.elemente.map(auswerten);

      case 'name':
        if (variablen.has(k.name)) return variablen.get(k.name);
        if (k.name in befehle) {
          throw fehler(k.zeile, `fehlen hinter ${k.name} die Klammern ( ).`);
        }
        // Einzelner Buchstabe: meist eine Taste ohne Anführungszeichen, z. B. szene(q, 1)
        if (k.name.length === 1 && !aehnlichstes(k.name, [...variablen.keys()])) {
          throw fehler(k.zeile, `kenne ich ${k.name} noch nicht. Wenn du die Taste meinst, setze sie in Anführungszeichen: "${k.name}".`);
        }
        throw fehler(k.zeile, `kenne ich ${k.name} noch nicht.` + (
          meintestDu(k.name, [...variablen.keys()]) ||
          ` Wenn das eine Variable sein soll, muss sie weiter oben stehen, zum Beispiel ${k.name} = ...`));

      case 'rechnung': {
        // Häufiger Fehler: tonart(a-moll) ohne Anführungszeichen
        if (k.op === '-' && k.links.art === 'name' && k.rechts.art === 'name' &&
            ['dur', 'moll'].includes(k.rechts.name.toLowerCase()) && !variablen.has(k.links.name)) {
          throw fehler(k.zeile, `fehlen die Anführungszeichen. Schreibe "${k.links.name}-${k.rechts.name}".`);
        }
        const a = auswerten(k.links);
        const b = auswerten(k.rechts);
        if (typeof a !== 'number' || typeof b !== 'number') {
          if (k.op === '+' && typeof a === 'string' && typeof b === 'string') return a + b;
          if (k.op === '+' && Array.isArray(a) && Array.isArray(b)) return a.concat(b);
          throw fehler(k.zeile, `kann ich mit ${k.op} nur Zahlen rechnen.`);
        }
        if ((k.op === '/' || k.op === '%') && b === 0) {
          throw fehler(k.zeile, 'wird durch 0 geteilt. Das geht nicht.');
        }
        switch (k.op) {
          case '+': return a + b;
          case '-': return a - b;
          case '*': return a * b;
          case '/': return a / b;
          case '%': return ((a % b) + b) % b; // wie in Python: nie negativ
        }
        break;
      }

      case 'aufruf': {
        const fn = befehle[k.name];
        if (!fn) {
          throw fehler(k.zeile, `kenne ich den Befehl ${k.name} nicht.` +
            meintestDu(k.name, Object.keys(befehle)));
        }
        const positionell = k.positionell.map(auswerten);
        const benannt = {};
        for (const [name, { wert, zeile }] of Object.entries(k.benannt)) {
          benannt[name] = { wert: auswerten(wert), zeile };
        }
        return fn(positionell, benannt, k.zeile);
      }
    }
  }

  for (const a of anweisungen) {
    const wert = auswerten(a.wert);
    if (a.art === 'zuweisung') variablen.set(a.name, wert);
  }
}
