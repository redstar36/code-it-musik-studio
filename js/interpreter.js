// interpreter.js – liest eine kleine Python-Teilmenge und führt sie aus.
// Unterstützt bisher: Kommentare, Zahlen, Zeichenketten, Listen, Variablen,
// Grundrechenarten, Funktionsaufrufe mit benannten Argumenten,
// Schleifen (for … in, range) mit eingerückten Blöcken, += und -=,
// eigene Funktionen (def, Parameter, return), die auch später beim Tastendruck aufgerufen werden können.
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
const SPAETER = ['while', 'import', 'from', 'class', 'None', 'global', 'lambda', 'try', 'except', 'with'];

// ─── Zerlegen in Wörter (Tokens) ─────────────────────────

const EINRUECKUNG_TAB = 4; // ein Tabulator zählt wie 4 Leerzeichen
const BLOCK_WOERTER = ['for', 'def', 'if', 'elif', 'else']; // Zeilen, die mit „:“ enden und einen eingerückten Block haben

function zerlege(code) {
  const tokens = [];
  let zeile = 1;
  let i = 0;
  let zeilenAnfang = true;

  // Einrückung wie in Python: Nach einer Zeile mit Doppelpunkt beginnt ein eingerückter Block
  const stufen = [0];            // Einrückungen der offenen Blöcke
  let doppelpunktZeile = null;   // Zeile, die mit „:“ endete und einen Block erwartet
  let tokensInZeile = 0;
  let forOhneDoppelpunkt = null; // Zeile mit for/def, der der Doppelpunkt fehlt (für eine bessere Meldung)

  // Am Zeilenende: Endet die Zeile mit „:“? Steht der Doppelpunkt an der richtigen Stelle?
  const zeilenende = () => {
    forOhneDoppelpunkt = null;
    if (tokensInZeile === 0) return;
    const erstes = tokens[tokens.length - tokensInZeile];
    const letztes = tokens[tokens.length - 1];
    const mitDoppelpunkt = letztes.typ === 'ZEICHEN' && letztes.wert === ':';
    const istFor = erstes.typ === 'NAME' && BLOCK_WOERTER.includes(erstes.wert);
    if (mitDoppelpunkt && !istFor) {
      throw fehler(zeile, 'steht ein Doppelpunkt, der hier nicht hingehört. Ein Doppelpunkt steht nur am Ende einer Zeile mit for, def, if, elif oder else.');
    }
    if (mitDoppelpunkt) doppelpunktZeile = zeile;
    if (istFor && !mitDoppelpunkt) forOhneDoppelpunkt = zeile;
  };

  const push = (typ, wert) => { tokens.push({ typ, wert, zeile }); tokensInZeile++; };

  while (i < code.length) {
    const c = code[i];

    // Zeilenanfang: Einrückung messen (leere Zeilen und Kommentarzeilen zählen nicht)
    if (zeilenAnfang) {
      let j = i;
      let breite = 0;
      while (j < code.length && (code[j] === ' ' || code[j] === '\t')) {
        breite += code[j] === '\t' ? EINRUECKUNG_TAB : 1;
        j++;
      }
      const rest = code[j];
      zeilenAnfang = false;
      i = j;
      if (rest === undefined || rest === '\n' || rest === '\r' || rest === '#') continue;

      const oben = stufen[stufen.length - 1];
      if (doppelpunktZeile !== null) {
        if (breite <= oben) {
          throw fehler(zeile, `muss die Zeile eingerückt sein, weil Zeile ${doppelpunktZeile} mit einem Doppelpunkt endet. Setze 4 Leerzeichen an den Anfang.`);
        }
        stufen.push(breite);
        tokens.push({ typ: 'EINRUECKEN', zeile });
        doppelpunktZeile = null;
      } else if (breite > oben) {
        if (forOhneDoppelpunkt !== null) {
          throw fehler(forOhneDoppelpunkt, 'fehlt am Ende der Zeile der Doppelpunkt :');
        }
        throw fehler(zeile, 'steht am Anfang ein Leerzeichen zu viel. Lösche die Leerzeichen vor dem ersten Wort.');
      } else {
        while (breite < stufen[stufen.length - 1]) {
          stufen.pop();
          tokens.push({ typ: 'AUSRUECKEN', zeile });
        }
        if (breite !== stufen[stufen.length - 1]) {
          throw fehler(zeile, 'passt die Einrückung nicht zu den Zeilen darüber. Rücke die Zeile genauso weit ein wie die Zeilen im selben Block.');
        }
      }
      continue;
    }

    if (c === '\n') {
      zeilenende();
      push('ZEILENENDE');
      zeile++;
      zeilenAnfang = true;
      tokensInZeile = 0;
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

    // Vergleiche: == != < > <= >=
    if ((c === '=' || c === '!' || c === '<' || c === '>') && code[i + 1] === '=') {
      push('ZEICHEN', c + '=');
      i += 2;
      continue;
    }
    if (c === '<' || c === '>') {
      push('ZEICHEN', c);
      i++;
      continue;
    }
    if (c === '!') {
      throw fehler(zeile, 'steht ein Ausrufezeichen. Für „ungleich“ schreibst du != und für „nicht“ das Wort not.');
    }

    // += und -= (Kurzform für x = x + …)
    if ((c === '+' || c === '-') && code[i + 1] === '=') {
      push('ZEICHEN', c + '=');
      i += 2;
      continue;
    }

    // Satzzeichen
    if ('()[],=+-*/%:'.includes(c)) {
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

  zeilenende();
  push('ZEILENENDE');
  if (doppelpunktZeile !== null) {
    throw fehler(doppelpunktZeile, 'fehlt nach dem Doppelpunkt der eingerückte Teil. Schreibe in die nächste Zeile 4 Leerzeichen und dann einen Befehl.');
  }
  while (stufen.length > 1) {
    stufen.pop();
    tokens.push({ typ: 'AUSRUECKEN', zeile });
  }
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

  /** Eingerückter Block nach einer Zeile mit Doppelpunkt */
  block() {
    const anweisungen = [];
    while (this.ist('ZEILENENDE')) this.weiter();
    this.weiter(); // EINRUECKEN (vom Zerlegen garantiert)
    while (!this.ist('AUSRUECKEN') && !this.ist('ENDE')) {
      if (this.ist('ZEILENENDE')) { this.weiter(); continue; }
      anweisungen.push(this.anweisung());
    }
    if (this.ist('AUSRUECKEN')) this.weiter();
    return anweisungen;
  }

  /** for name in ausdruck: */
  schleife() {
    const zeile = this.weiter().zeile; // 'for'
    if (!this.ist('NAME') || this.ist('NAME', 'in')) {
      throw fehler(zeile, 'fehlt hinter for ein Name, zum Beispiel: for stufe in folge:');
    }
    const name = this.weiter().wert;
    if (!this.ist('NAME', 'in')) {
      throw fehler(zeile, `fehlt das Wort in. Schreibe zum Beispiel: for ${name} in folge:`);
    }
    this.weiter(); // 'in'
    if (this.ist('ZEICHEN', ':') || this.ist('ZEILENENDE')) {
      throw fehler(zeile, `fehlt hinter in die Liste, zum Beispiel: for ${name} in [1, 6, 4, 5]:`);
    }
    const liste = this.ausdruck();
    if (!this.ist('ZEICHEN', ':')) {
      if (this.ist('ZEILENENDE')) throw fehler(zeile, 'fehlt am Ende der Zeile der Doppelpunkt :');
      throw fehler(zeile, `steht hinter der Liste noch ${this.aktuell.wert ?? 'etwas'}. Am Ende der Zeile steht nur ein Doppelpunkt :`);
    }
    this.weiter(); // ':'
    if (!this.ist('ZEILENENDE')) {
      throw fehler(zeile, 'steht hinter dem Doppelpunkt noch etwas. Schreibe die Befehle eingerückt in die nächsten Zeilen.');
    }
    return { art: 'schleife', name, liste, block: this.block(), zeile };
  }

  /** def name(parameter, …): */
  funktionDefinition() {
    const zeile = this.weiter().zeile; // 'def'
    if (!this.ist('NAME')) throw fehler(zeile, 'fehlt hinter def ein Name, zum Beispiel: def drop():');
    const name = this.weiter().wert;
    if (!this.ist('ZEICHEN', '(')) {
      throw fehler(zeile, `fehlen hinter ${name} die Klammern. Schreibe: def ${name}():`);
    }
    this.weiter(); // '('
    const parameter = [];
    while (!this.ist('ZEICHEN', ')')) {
      if (!this.ist('NAME')) {
        if (this.ist('ZEILENENDE') || this.ist('ZEICHEN', ':')) throw fehler(zeile, 'fehlt eine schließende Klammer ).');
        throw fehler(zeile, `stehen in den Klammern hinter def nur Namen, zum Beispiel: def ${name}(stufe):`);
      }
      const p = this.weiter().wert;
      if (parameter.includes(p)) throw fehler(zeile, `steht der Name ${p} zweimal in den Klammern.`);
      parameter.push(p);
      if (!this.ist('ZEICHEN', ')')) this.erwarte(',', 'fehlt ein Komma zwischen zwei Namen.');
    }
    this.weiter(); // ')'
    if (!this.ist('ZEICHEN', ':')) {
      if (this.ist('ZEILENENDE')) throw fehler(zeile, 'fehlt am Ende der Zeile der Doppelpunkt :');
      throw fehler(zeile, `steht hinter def ${name}(…) noch etwas. Am Ende der Zeile steht nur ein Doppelpunkt :`);
    }
    this.weiter(); // ':'
    if (!this.ist('ZEILENENDE')) {
      throw fehler(zeile, 'steht hinter dem Doppelpunkt noch etwas. Schreibe die Befehle eingerückt in die nächsten Zeilen.');
    }
    return { art: 'funktion', name, parameter, block: this.block(), zeile };
  }

  /** if bedingung: … elif bedingung: … else: … */
  bedingung() {
    const zweige = [];
    let sonst = null;
    let wort = 'if';
    while (true) {
      const zeile = this.weiter().zeile; // 'if' oder 'elif'
      if (this.ist('ZEICHEN', ':') || this.ist('ZEILENENDE')) {
        throw fehler(zeile, `fehlt hinter ${wort} die Bedingung, zum Beispiel: ${wort} takt % 4 == 3:`);
      }
      const test = this.ausdruck();
      if (this.ist('ZEICHEN', '=')) {
        throw fehler(zeile, 'steht in der Bedingung nur ein Gleichheitszeichen. Zum Vergleichen schreibst du zwei: ==');
      }
      this.doppelpunktUndBlockanfang(zeile);
      zweige.push({ test, block: this.block(), zeile });
      if (this.ist('NAME', 'elif')) { wort = 'elif'; continue; }
      if (this.ist('NAME', 'else')) {
        const z = this.weiter().zeile;
        if (!this.ist('ZEICHEN', ':')) {
          throw fehler(z, this.ist('ZEILENENDE') ? 'fehlt hinter else der Doppelpunkt: else:' : 'steht hinter else eine Bedingung. else gilt für alle anderen Fälle; für eine weitere Bedingung schreibst du elif.');
        }
        this.doppelpunktUndBlockanfang(z);
        sonst = this.block();
      }
      break;
    }
    return { art: 'wenn', zweige, sonst, zeile: zweige[0].zeile };
  }

  doppelpunktUndBlockanfang(zeile) {
    if (!this.ist('ZEICHEN', ':')) {
      if (this.ist('ZEILENENDE')) throw fehler(zeile, 'fehlt am Ende der Zeile der Doppelpunkt :');
      throw fehler(zeile, `steht in der Zeile noch ${this.aktuell.wert ?? 'etwas'}, wo der Doppelpunkt hingehört.`);
    }
    this.weiter(); // ':'
    if (!this.ist('ZEILENENDE')) {
      throw fehler(zeile, 'steht hinter dem Doppelpunkt noch etwas. Schreibe die Befehle eingerückt in die nächsten Zeilen.');
    }
  }

  anweisung() {
    const zeile = this.aktuell.zeile;
    let knoten;

    if (this.ist('NAME', 'if')) return this.bedingung();
    if (this.ist('NAME', 'elif') || this.ist('NAME', 'else')) {
      throw fehler(zeile, `steht ${this.aktuell.wert} ohne passendes if davor. ${this.aktuell.wert} muss genauso weit eingerückt sein wie das if, zu dem es gehört.`);
    }

    if (this.ist('NAME', 'for')) return this.schleife();
    if (this.ist('NAME', 'def')) return this.funktionDefinition();
    if (this.ist('NAME', 'in')) {
      throw fehler(zeile, 'steht in am Anfang der Zeile. Das Wort in gehört in eine Schleife, zum Beispiel: for stufe in folge:');
    }

    const naechstes = this.tokens[this.pos + 1];
    if (this.ist('NAME', 'return')) {
      this.weiter();
      knoten = { art: 'rueckgabe', wert: this.ist('ZEILENENDE') ? null : this.ausdruck(), zeile };
    } else if (this.ist('NAME') && naechstes.typ === 'ZEICHEN' && naechstes.wert === '=') {
      // Zuweisung: name = ausdruck
      const name = this.weiter().wert;
      this.weiter(); // '='
      if (this.ist('ZEILENENDE')) throw fehler(zeile, `fehlt hinter ${name} = noch etwas.`);
      knoten = { art: 'zuweisung', name, wert: this.ausdruck(), zeile };
    } else if (this.ist('NAME') && naechstes.typ === 'ZEICHEN' && (naechstes.wert === '+=' || naechstes.wert === '-=')) {
      // Kurzform: arp += [1, 3]  bedeutet  arp = arp + [1, 3]
      const nameToken = this.weiter();
      const op = this.weiter().wert[0];
      if (this.ist('ZEILENENDE')) throw fehler(zeile, `fehlt hinter ${nameToken.wert} ${op}= noch etwas.`);
      const rechts = this.ausdruck();
      knoten = { art: 'zuweisung', name: nameToken.wert, zeile,
        wert: { art: 'rechnung', op, links: { art: 'name', name: nameToken.wert, zeile }, rechts, zeile } };
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
      if (t.typ === 'ZEICHEN' && t.wert === ':') {
        throw fehler(t.zeile, 'steht ein Doppelpunkt, der hier nicht hingehört. Ein Doppelpunkt steht nur am Ende einer Zeile mit for, def, if, elif oder else.');
      }
      throw fehler(t.zeile, 'steht mehr als ein Befehl. Schreibe jeden Befehl in eine eigene Zeile.');
    }
    this.weiter();
    return knoten;
  }

  // Rangfolge: or, and, not, Vergleiche, Strichrechnung, Punktrechnung
  ausdruck() {
    let links = this.und();
    while (this.ist('NAME', 'or')) {
      const op = this.weiter();
      links = { art: 'logik', op: 'or', links, rechts: this.und(), zeile: op.zeile };
    }
    return links;
  }

  und() {
    let links = this.nicht();
    while (this.ist('NAME', 'and')) {
      const op = this.weiter();
      links = { art: 'logik', op: 'and', links, rechts: this.nicht(), zeile: op.zeile };
    }
    return links;
  }

  nicht() {
    if (this.ist('NAME', 'not')) {
      const op = this.weiter();
      return { art: 'nicht', wert: this.nicht(), zeile: op.zeile };
    }
    return this.vergleich();
  }

  vergleich() {
    const links = this.summe();
    const t = this.aktuell;
    if (t.typ === 'ZEICHEN' && ['==', '!=', '<', '>', '<=', '>='].includes(t.wert)) {
      this.weiter();
      const knoten = { art: 'vergleich', op: t.wert, links, rechts: this.summe(), zeile: t.zeile };
      const n = this.aktuell;
      if (n.typ === 'ZEICHEN' && ['==', '!=', '<', '>', '<=', '>='].includes(n.wert)) {
        throw fehler(n.zeile, 'stehen zwei Vergleiche hintereinander. Verbinde sie mit and, zum Beispiel: takt > 4 and takt < 8');
      }
      return knoten;
    }
    return links;
  }

  // Punktrechnung vor Strichrechnung
  summe() {
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
    if (this.ist('NAME', 'True') || this.ist('NAME', 'False')) {
      this.weiter();
      return { art: 'wert', wert: t.wert === 'True' };
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

/** Tippfehler-Abstand: einfügen, löschen, ersetzen und zwei vertauschte Buchstaben zählen je 1 */
function abstand(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

function meintestDu(wort, kandidaten) {
  const vorschlag = aehnlichstes(wort, kandidaten);
  return vorschlag ? ` Meintest du ${vorschlag}?` : '';
}

// Sicherungen gegen Schleifen, die (fast) nie aufhören
const MAX_SCHRITTE = 5000;   // ausgeführte Anweisungen insgesamt
const MAX_RANGE = 1000;      // Zahlen in einem range()

/** Python-Funktionen, die zur Sprache gehören (nicht zum Musik Studio) */
function eingebaut(name, positionell, benannt, zeile) {
  if (name === 'range') {
    if (Object.keys(benannt).length > 0 || positionell.length < 1 || positionell.length > 3) {
      throw fehler(zeile, 'braucht range eine bis drei Zahlen, zum Beispiel range(4).');
    }
    for (const z of positionell) {
      if (!Number.isInteger(z)) throw fehler(zeile, `braucht range ganze Zahlen. ${typeof z === 'number' ? z : 'Das'} ist keine ganze Zahl.`);
    }
    const [start, ende, schritt] = positionell.length === 1 ? [0, positionell[0], 1]
      : [positionell[0], positionell[1], positionell[2] ?? 1];
    if (schritt === 0) throw fehler(zeile, 'darf der Schritt bei range nicht 0 sein.');
    const anzahl = Math.max(0, Math.ceil((ende - start) / schritt));
    if (anzahl > MAX_RANGE) {
      throw fehler(zeile, `ergibt range ${anzahl} Zahlen. Erlaubt sind höchstens ${MAX_RANGE}.`);
    }
    return Array.from({ length: anzahl }, (_, k) => start + k * schritt);
  }
  return undefined;
}
const EINGEBAUT = ['range'];

/** Wahrheitswert wie in Python: False, 0, "", [] und nichts gelten als falsch */
function wahr(wert) {
  if (Array.isArray(wert)) return wert.length > 0;
  return Boolean(wert);
}

/** Gleichheit wie in Python (Listen werden Element für Element verglichen) */
function gleich(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, k) => gleich(x, b[k]));
  return a === b;
}

// Sicherung gegen Funktionen, die sich endlos selbst aufrufen
const MAX_TIEFE = 50;

/** Eine eigene Funktion (def) als Wert, z. B. für taste("d", drop) */
export class Funktion {
  constructor(name, parameter, block, zeile) {
    this.name = name;
    this.parameter = parameter;
    this.block = block;
    this.zeile = zeile;
  }
}

/**
 * Führt den Code aus.
 * befehle: { name: function(positionell, benannt, zeile) }
 *   benannt ist ein Objekt { name: { wert, zeile } }
 * Gibt { aufrufen(funktion, argumente, zusatzBefehle) } zurück: damit lassen sich eigene Funktionen
 * später aufrufen (z. B. beim Tastendruck), mit zusätzlichen Befehlen wie szene_starten.
 */
export function ausfuehren(code, befehle) {
  const anweisungen = new Parser(zerlege(code)).programm();
  const globale = new Map();     // Variablen außerhalb von Funktionen
  let aktiveBefehle = befehle;
  let schritte = 0;
  let tiefe = 0;

  // lokal: Variablen der gerade laufenden Funktion (oder null außerhalb von Funktionen)
  const hat = (name, lokal) => (lokal && lokal.has(name)) || globale.has(name);
  const lies = (name, lokal) => (lokal && lokal.has(name) ? lokal.get(name) : globale.get(name));
  const namen = (lokal) => [...(lokal ? lokal.keys() : []), ...globale.keys()];

  function auswerten(k, lokal) {
    switch (k.art) {
      case 'wert':
        return k.wert;

      case 'liste':
        return k.elemente.map((e) => auswerten(e, lokal));

      case 'name':
        if (hat(k.name, lokal)) return lies(k.name, lokal);
        if (k.name in aktiveBefehle) {
          throw fehler(k.zeile, `fehlen hinter ${k.name} die Klammern ( ).`);
        }
        // Einzelner Buchstabe: meist eine Taste ohne Anführungszeichen, z. B. szene(q, 1)
        if (k.name.length === 1 && !aehnlichstes(k.name, namen(lokal))) {
          throw fehler(k.zeile, `kenne ich ${k.name} noch nicht. Wenn du die Taste meinst, setze sie in Anführungszeichen: "${k.name}".`);
        }
        throw fehler(k.zeile, `kenne ich ${k.name} noch nicht.` + (
          meintestDu(k.name, namen(lokal)) ||
          ` Wenn das eine Variable sein soll, muss sie weiter oben stehen, zum Beispiel ${k.name} = ...`));

      case 'vergleich': {
        const a = auswerten(k.links, lokal);
        const b = auswerten(k.rechts, lokal);
        if (k.op === '==') return gleich(a, b);
        if (k.op === '!=') return !gleich(a, b);
        if (typeof a !== 'number' || typeof b !== 'number') {
          throw fehler(k.zeile, `kann ich mit ${k.op} nur Zahlen vergleichen.`);
        }
        switch (k.op) {
          case '<': return a < b;
          case '>': return a > b;
          case '<=': return a <= b;
          case '>=': return a >= b;
        }
        break;
      }

      case 'logik': {
        // wie in Python: or/and liefern einen der beiden Werte
        const a = auswerten(k.links, lokal);
        if (k.op === 'or') return wahr(a) ? a : auswerten(k.rechts, lokal);
        return wahr(a) ? auswerten(k.rechts, lokal) : a;
      }

      case 'nicht':
        return !wahr(auswerten(k.wert, lokal));

      case 'rechnung': {
        // Häufiger Fehler: tonart(a-moll) ohne Anführungszeichen
        if (k.op === '-' && k.links.art === 'name' && k.rechts.art === 'name' &&
            ['dur', 'moll'].includes(k.rechts.name.toLowerCase()) && !hat(k.links.name, lokal)) {
          throw fehler(k.zeile, `fehlen die Anführungszeichen. Schreibe "${k.links.name}-${k.rechts.name}".`);
        }
        const a = auswerten(k.links, lokal);
        const b = auswerten(k.rechts, lokal);
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
        // Eigene Funktion (def)?
        const eigene = hat(k.name, lokal) ? lies(k.name, lokal) : undefined;
        if (eigene instanceof Funktion) {
          if (Object.keys(k.benannt).length > 0) {
            throw fehler(k.zeile, `kennt ${k.name} keine Angaben mit =. Schreibe die Werte einfach in die Klammern.`);
          }
          return funktionAufrufen(eigene, k.positionell.map((e) => auswerten(e, lokal)), k.zeile);
        }
        const fn = aktiveBefehle[k.name];
        if (!fn && EINGEBAUT.includes(k.name)) {
          const positionell = k.positionell.map((e) => auswerten(e, lokal));
          const benannt = {};
          for (const [name, { wert, zeile }] of Object.entries(k.benannt)) benannt[name] = { wert: auswerten(wert, lokal), zeile };
          return eingebaut(k.name, positionell, benannt, k.zeile);
        }
        if (!fn && hat(k.name, lokal)) {
          throw fehler(k.zeile, `ist ${k.name} der Name eines Bausteins. Einen Baustein legst du mit spur auf eine Spur, zum Beispiel spur(1, ${k.name}).`);
        }
        if (!fn) {
          const eigeneNamen = namen(lokal).filter((n) => lies(n, lokal) instanceof Funktion);
          throw fehler(k.zeile, `kenne ich den Befehl ${k.name} nicht.` +
            meintestDu(k.name, [...Object.keys(aktiveBefehle), ...EINGEBAUT, ...eigeneNamen]));
        }
        const positionell = k.positionell.map((e) => auswerten(e, lokal));
        const benannt = {};
        for (const [name, { wert, zeile }] of Object.entries(k.benannt)) {
          benannt[name] = { wert: auswerten(wert, lokal), zeile };
        }
        return fn(positionell, benannt, k.zeile);
      }
    }
  }

  function funktionAufrufen(funktion, argumente, zeile) {
    const n = funktion.parameter.length;
    if (argumente.length !== n) {
      const soll = n === 0 ? 'keine Angaben' : n === 1 ? '1 Angabe' : `${n} Angaben`;
      const beispiel = `${funktion.name}(${funktion.parameter.join(', ')})`;
      throw fehler(zeile, `braucht ${funktion.name} ${soll}. Schreibe ${beispiel}.`);
    }
    if (++tiefe > MAX_TIEFE) {
      throw fehler(zeile, `ruft sich ${funktion.name} zu oft selbst auf (mehr als ${MAX_TIEFE}-mal).`);
    }
    const lokal = new Map(funktion.parameter.map((p, k) => [p, argumente[k]]));
    try {
      const ergebnis = ausfuehrenBlock(funktion.block, lokal);
      return ergebnis ? ergebnis.wert : undefined;
    } finally {
      tiefe--;
    }
  }

  /** Führt Anweisungen aus. Gibt { wert } zurück, wenn ein return erreicht wurde. */
  function ausfuehrenBlock(liste, lokal) {
    const ziel = lokal ?? globale; // hierhin schreiben Zuweisungen
    for (const a of liste) {
      if (++schritte > MAX_SCHRITTE) {
        throw fehler(a.zeile, `läuft dein Programm sehr lange (mehr als ${MAX_SCHRITTE} Schritte). Läuft eine Schleife zu oft?`);
      }
      if (a.art === 'schleife') {
        const werte = auswerten(a.liste, lokal);
        if (!Array.isArray(werte)) {
          const tipp = typeof werte === 'number' && Number.isInteger(werte)
            ? ` Für eine feste Anzahl schreibe range(${werte}).` : ' Zum Beispiel: for stufe in [1, 6, 4, 5]:';
          throw fehler(a.zeile, `braucht for eine Liste.${tipp}`);
        }
        for (const wert of werte) {
          ziel.set(a.name, wert);
          const r = ausfuehrenBlock(a.block, lokal);
          if (r) return r;
        }
        continue;
      }
      if (a.art === 'wenn') {
        const zweig = a.zweige.find((z) => wahr(auswerten(z.test, lokal)));
        const block = zweig ? zweig.block : a.sonst;
        if (block) {
          const r = ausfuehrenBlock(block, lokal);
          if (r) return r;
        }
        continue;
      }
      if (a.art === 'funktion') {
        ziel.set(a.name, new Funktion(a.name, a.parameter, a.block, a.zeile));
        continue;
      }
      if (a.art === 'rueckgabe') {
        if (!lokal) throw fehler(a.zeile, 'steht return außerhalb einer Funktion. return gehört in eine Funktion mit def.');
        return { wert: a.wert ? auswerten(a.wert, lokal) : undefined };
      }
      const wert = auswerten(a.wert, lokal);
      if (a.art === 'zuweisung') ziel.set(a.name, wert);
    }
    return undefined;
  }

  ausfuehrenBlock(anweisungen, null);

  return {
    /** Globale Variable lesen, z. B. die Funktion jeder_takt */
    globale: (name) => globale.get(name),

    /** Eigene Funktion später aufrufen (z. B. beim Tastendruck), mit zusätzlichen Befehlen */
    aufrufen(funktion, argumente = [], zusatzBefehle = {}) {
      const vorher = aktiveBefehle;
      aktiveBefehle = { ...befehle, ...zusatzBefehle };
      schritte = 0;
      tiefe = 0;
      try {
        return funktionAufrufen(funktion, argumente, funktion.zeile);
      } finally {
        aktiveBefehle = vorher;
      }
    },
  };
}
