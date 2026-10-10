// befehle.js – die Funktionen, die Kinder in ihrem Code benutzen können.
// Jeder Befehl prüft seine Angaben und meldet Fehler auf Deutsch mit Zeilenangabe.

import { ausfuehren, fehler, aehnlichstes, Funktion } from './interpreter.js?v=c67231f';
import { SCHLAGZEUG, INSTRUMENTE } from './klaenge.js?v=c67231f';
import { leseTonart, STANDARD_TONART } from './tonart.js?v=c67231f';

const SCHRITTE_PRO_TAKT = 16;
const MAX_TAKTE = 4;
const HOECHSTE_STUFE = 14;
export const SZENEN_TASTEN = ['q', 'w', 'e', 'r', 't'];
/** Buchstaben, die schon fest belegt sind (Szenen und Fill) und nicht mit taste() belegt werden dürfen */
export const FESTE_TASTEN = [...SZENEN_TASTEN, 'f'];

/**
 * Welche Nummer der erste Takt in jeder_takt(takt) hat. KONZEPT.md (Lektion 9) zählt ab 0:
 * `if takt % 4 == 3: fill()` trifft dann den 4. Takt jeder Gruppe. Offene Frage: ab 1 zählen?
 */
export const ERSTER_TAKT = 0;

// Befehle, die nur beim Tastendruck wirken (in einer Funktion, die mit taste() auf einer Taste liegt)
const LIVE_BEFEHLE = ['szene_starten', 'filter', 'fill'];
// Befehle, die das Programm aufbauen und deshalb beim Tastendruck nicht gehen
const AUFBAU_BEFEHLE = ['tempo', 'tonart', 'szene', 'ablauf', 'taste'];

/** Ein Baustein ist das, was beat() und melodie() zurückgeben */
class Baustein {
  constructor(art, muster, klang, oktave) {
    this.art = art;         // 'beat' oder 'melodie' (auch Akkorde sind Melodien mit mehreren Tönen)
    this.muster = muster;   // beat: Text, melodie: Liste mit null oder { stufen, dauer } je Schritt
    this.klang = klang;
    this.oktave = oktave;
  }
}

/** Liest die Angaben eines Befehls: erst nach Position, dann nach Name */
function angaben(befehl, namen, positionell, benannt, zeile) {
  if (positionell.length > namen.length) {
    throw fehler(zeile, `hat ${befehl} zu viele Angaben. Erlaubt sind: ${namen.join(', ')}.`);
  }
  const werte = {};
  namen.forEach((name, i) => { werte[name] = positionell[i]; });
  for (const [name, { wert, zeile: z }] of Object.entries(benannt)) {
    if (!namen.includes(name)) {
      const vorschlag = aehnlichstes(name, namen);
      throw fehler(z, `kennt ${befehl} die Angabe ${name} nicht.` +
        (vorschlag ? ` Meintest du ${vorschlag}?` : ` Erlaubt sind: ${namen.join(', ')}.`));
    }
    if (werte[name] !== undefined) {
      throw fehler(z, `steht die Angabe ${name} bei ${befehl} doppelt.`);
    }
    werte[name] = wert;
  }
  return werte;
}

/**
 * Taktgruppen: Musik ist in Gruppen von 4 Takten gebaut. Muster mit 1, 2 oder 4 Takten passen hinein.
 * Ein 3-Takt-Muster würde sich gegen die anderen Spuren verschieben und schief klingen.
 * Deshalb wird es mit einem Pausentakt auf 4 Takte ergänzt, und es gibt einen Hinweis.
 * Gibt den Hinweistext zurück oder null.
 */
function dreiTakteHinweis(anzahlSchritte, was, extra = '') {
  if (anzahlSchritte !== 3 * SCHRITTE_PRO_TAKT) return null;
  return `ist ${was} 3 Takte lang. Musik denkt in Gruppen von 4 Takten, deshalb ist der 4. Takt still.${extra}`;
}

/** Wert für eine Fehlermeldung lesbar machen (Bausteine und Listen nicht als „[object Object]“) */
function lesbar(wert) {
  if (wert instanceof Baustein) return 'ein Baustein';
  if (Array.isArray(wert)) return `die Liste [${wert.join(', ')}]`;
  if (wert instanceof Funktion) return `die Funktion ${wert.name}`;
  if (typeof wert === 'string') return `"${wert}"`;
  return String(wert);
}

const MAX_AUSGABEN = 20;

/** Wert für zeige() so darstellen, wie man ihn im Code schreiben würde */
function alsText(wert) {
  if (wert instanceof Baustein) {
    return wert.art === 'beat' ? `ein Beat (${wert.klang})` : `eine Melodie (${wert.klang})`;
  }
  if (Array.isArray(wert)) return `[${wert.map(alsText).join(', ')}]`;
  if (typeof wert === 'string') return `"${wert}"`;
  if (wert === undefined) return 'nichts';
  if (wert instanceof Funktion) return `die Funktion ${wert.name}`;
  if (typeof wert === 'boolean') return wert ? 'True' : 'False';
  return String(wert);
}

/** spur(nummer, baustein, lautstaerke=…) prüfen; gibt { nummer, daten } zurück. Auch für spur in jeder_takt. */
function spurLesen(positionell, benannt, zeile) {
  const { nummer, baustein, lautstaerke } =
    angaben('spur', ['nummer', 'baustein', 'lautstaerke'], positionell, benannt, zeile);
  if (nummer === undefined || baustein === undefined) {
    throw fehler(zeile, 'braucht spur eine Nummer und einen Baustein, zum Beispiel spur(1, kick).');
  }
  if (nummer instanceof Baustein) {
    throw fehler(zeile, 'steht bei spur der Baustein vorne. Zuerst kommt die Spurnummer, dann der Baustein, zum Beispiel spur(4, bass).');
  }
  if (!istGanzeZahl(nummer) || nummer < 1 || nummer > 8) {
    throw fehler(zeile, `ist ${lesbar(nummer)} keine gültige Spur. Es gibt die Spuren 1 bis 8.`);
  }
  if (!(baustein instanceof Baustein)) {
    throw fehler(zeile, 'braucht spur als zweite Angabe einen Baustein, zum Beispiel einen Beat: spur(1, kick).');
  }
  let lautstaerkeWert = 100;
  if (lautstaerke !== undefined) {
    if (typeof lautstaerke !== 'number' || lautstaerke < 0 || lautstaerke > 100) {
      throw fehler(zeile, 'muss die Lautstärke eine Zahl von 0 bis 100 sein.');
    }
    lautstaerkeWert = lautstaerke;
  }
  return {
    nummer,
    daten: {
      art: baustein.art,
      muster: baustein.muster,
      klang: baustein.klang,
      oktave: baustein.oktave,
      lautstaerke: lautstaerkeWert / 100,
    },
  };
}

function istGanzeZahl(x) {
  return typeof x === 'number' && Number.isInteger(x);
}

/**
 * Prüft den Klang. eigene: erlaubte Klänge für diesen Befehl,
 * fremde: Klänge, die zu einem anderen Befehl gehören (für einen Hinweis).
 */
function pruefeKlang(klang, eigene, fremde, befehl, andererBefehl, zeile, beispiel = Object.keys(eigene)[0]) {
  const namen = Object.keys(eigene);
  if (klang === undefined) {
    throw fehler(zeile, `fehlt bei ${befehl} der Klang, zum Beispiel klang="${beispiel}". Es gibt: ${namen.join(', ')}.`);
  }
  if (typeof klang === 'string' && eigene[klang]) return;
  if (typeof klang !== 'string') {
    throw fehler(zeile, `fehlen beim Klang die Anführungszeichen. Schreibe zum Beispiel klang="${beispiel}".`);
  }
  if (typeof klang === 'string' && fremde[klang]) {
    throw fehler(zeile, `ist ${klang} ein Klang für ${andererBefehl}, nicht für ${befehl}. Bei ${befehl} gibt es: ${namen.join(', ')}.`);
  }
  const vorschlag = typeof klang === 'string' ? aehnlichstes(klang, namen) : null;
  throw fehler(zeile, `kenne ich den Klang ${lesbar(klang)} nicht.` +
    (vorschlag ? ` Meintest du "${vorschlag}"?` : ` Es gibt: ${namen.join(', ')}.`));
}

/** Prüft, ob ein Muster ganze Takte füllt (16, 32, 48 oder 64 Schritte) */
function pruefeTakte(n, was, einheit, erklaerung, zeile) {
  if (n % SCHRITTE_PRO_TAKT !== 0) {
    const kleiner = Math.floor(n / SCHRITTE_PRO_TAKT) * SCHRITTE_PRO_TAKT;
    const groesser = kleiner + SCHRITTE_PRO_TAKT;
    const soll = kleiner === 0 ? `${groesser}` : `${kleiner} oder ${groesser}`;
    throw fehler(zeile, `hat ${was} ${n} statt ${soll} ${einheit}. ${erklaerung}`);
  }
  if (n > SCHRITTE_PRO_TAKT * MAX_TAKTE) {
    throw fehler(zeile, `ist ${was} ${n / SCHRITTE_PRO_TAKT} Takte lang. Erlaubt sind höchstens ${MAX_TAKTE} Takte (64 Schritte).`);
  }
}

/** Prüft ein Beat-Muster und gibt es ohne Leerzeichen zurück */
function leseBeat(muster, zeile) {
  if (typeof muster !== 'string') {
    throw fehler(zeile, 'braucht beat ein Muster in Anführungszeichen, zum Beispiel beat("x... x... x... x...", klang="kick").');
  }
  const ohneLeer = muster.replace(/ /g, '');
  for (const zeichen of ohneLeer) {
    if (!'xXo.'.includes(zeichen)) {
      throw fehler(zeile, `steht im Beat das Zeichen ${zeichen}. Erlaubt sind x, X, o und der Punkt.`);
    }
  }
  if (ohneLeer.length === 0) {
    throw fehler(zeile, 'ist dein Beat leer. Ein Takt hat 16 Zeichen, zum Beispiel "x... x... x... x...".');
  }
  pruefeTakte(ohneLeer.length, 'dein Beat', 'Zeichen',
    'Ein Takt hat 16 Zeichen (Leerzeichen zählen nicht mit).', zeile);
  return ohneLeer;
}

/** Prüft eine einzelne Stufe (Zahl von 1 bis 14) */
function pruefeStufe(stufe, zeile) {
  if (!istGanzeZahl(stufe)) {
    throw fehler(zeile, `steht in der Melodie ${lesbar(stufe)}. Töne sind ganze Zahlen von 1 bis ${HOECHSTE_STUFE}.`);
  }
  if (stufe < 1 || stufe > HOECHSTE_STUFE) {
    throw fehler(zeile, `steht in der Melodie der Ton ${stufe}. Töne gehen von 1 bis ${HOECHSTE_STUFE}.`);
  }
}

/**
 * Melodie als Text: "1--- . 1-- 3--"
 * Zahl = Ton (ein Schritt), jeder Bindestrich verlängert um einen Schritt, Punkt = Pause.
 */
function leseMelodieText(text, zeile) {
  const schritte = [];
  let letzterTon = null;      // der Ton, den ein Bindestrich verlängern würde
  let letztesWarPause = false;
  let i = 0;

  while (i < text.length) {
    const c = text[i];
    if (c === ' ') { i++; continue; }

    if (/[0-9]/.test(c)) {
      let j = i;
      while (j < text.length && /[0-9]/.test(text[j])) j++;
      const ziffern = text.slice(i, j);
      const stufe = Number(ziffern);
      if (ziffern.length > 1 && (stufe < 10 || stufe > HOECHSTE_STUFE)) {
        throw fehler(zeile, `steht in der Melodie die Zahl ${ziffern}. Töne gehen von 1 bis ${HOECHSTE_STUFE}. ` +
          `Wenn du mehrere Töne meinst, trenne sie mit Leerzeichen, zum Beispiel ${ziffern.split('').join(' ')}.`);
      }
      pruefeStufe(stufe, zeile);
      letzterTon = { stufen: [stufe], dauer: 1 };
      schritte.push(letzterTon);
      letztesWarPause = false;
      i = j;
      continue;
    }

    if (c === '-') {
      if (letztesWarPause) {
        throw fehler(zeile, 'steht in der Melodie ein Bindestrich hinter einem Punkt. Ein Bindestrich verlängert nur Töne. Für eine längere Pause schreibe mehrere Punkte.');
      }
      if (!letzterTon) {
        throw fehler(zeile, 'beginnt die Melodie mit einem Bindestrich. Vor einem Bindestrich muss ein Ton stehen, zum Beispiel 1---.');
      }
      letzterTon.dauer++;
      schritte.push(null);
      i++;
      continue;
    }

    if (c === '.') {
      schritte.push(null);
      letzterTon = null;
      letztesWarPause = true;
      i++;
      continue;
    }

    throw fehler(zeile, `steht in der Melodie das Zeichen ${c}. Erlaubt sind Zahlen, Bindestriche - und Punkte.`);
  }

  if (schritte.length === 0) {
    throw fehler(zeile, 'ist deine Melodie leer. Schreibe Töne als Zahlen, zum Beispiel "1--- 3--- 5--- 3---".');
  }
  pruefeTakte(schritte.length, 'deine Melodie', 'Schritte',
    'Ein Takt hat 16 Schritte. Jede Zahl, jeder Bindestrich und jeder Punkt ist ein Schritt.', zeile);
  return schritte;
}

/**
 * Melodie als Liste: [1, 3, 5, 3], jeder Ton laenge Schritte lang.
 * Ist die Melodie kürzer als ein Takt und passt genau hinein, wiederholt sie sich.
 * Sonst wird bis zum Taktende mit Pause aufgefüllt.
 * akkorde: aus jeder Stufe wird ein Dreiklang (Stufe, Stufe + 2, Stufe + 4)
 */
function leseMelodieListe(liste, laenge, zeile, akkorde = false) {
  const was = akkorde ? 'Akkordfolge' : 'Melodie';
  if (liste.length === 0) {
    throw fehler(zeile, `ist die Liste leer. Schreibe ${akkorde ? 'Akkorde' : 'Töne'} hinein, zum Beispiel [1, ${akkorde ? '6, 4, 5' : '3, 5, 3'}].`);
  }
  const schritte = [];
  for (const stufe of liste) {
    pruefeStufe(stufe, zeile);
    const stufen = akkorde ? [stufe, stufe + 2, stufe + 4] : [stufe];
    schritte.push({ stufen, dauer: laenge });
    for (let k = 1; k < laenge; k++) schritte.push(null);
  }
  const n = schritte.length;
  if (n > SCHRITTE_PRO_TAKT * MAX_TAKTE) {
    throw fehler(zeile, `ist deine ${was} ${n} Schritte lang (${liste.length} ${akkorde ? 'Akkorde' : 'Töne'} mal laenge ${laenge}). Erlaubt sind höchstens ${MAX_TAKTE} Takte (64 Schritte).`);
  }
  const passtGenau = n <= SCHRITTE_PRO_TAKT && SCHRITTE_PRO_TAKT % n === 0;
  if (!passtGenau) {
    const ziel = Math.ceil(n / SCHRITTE_PRO_TAKT) * SCHRITTE_PRO_TAKT;
    while (schritte.length < ziel) schritte.push(null);
  }
  return schritte;
}

/** Oktave prüfen; ohne Angabe gilt die Standard-Oktave des Instruments (bei Akkorden ggf. eine eigene) */
function pruefeOktave(oktave, klang, zeile, akkord = false) {
  if (oktave === undefined) return (akkord && INSTRUMENTE[klang].akkordOktave) || INSTRUMENTE[klang].oktave;
  if (!istGanzeZahl(oktave) || oktave < 1 || oktave > 7) {
    throw fehler(zeile, 'muss oktave eine ganze Zahl von 1 bis 7 sein. Kleine Zahlen klingen tief, große hoch.');
  }
  return oktave;
}

/**
 * Führt den Code aus und liefert das Ergebnis:
 * { tempo, tonart, spuren: Map(nummer → { art, muster, klang, oktave, lautstaerke }),
 *   szenen: Map(taste → Liste von Spurnummern), ablauf: Liste von Szenen-Tasten,
 *   hinweise: Liste von Texten (kein Fehler, nur zur Info),
 *   ausgaben: Liste von Texten aus zeige(),
 *   tasten: Map(buchstabe → Funktion), jederTakt: Funktion oder null,
 *   aufrufen: Funktionen später aufrufen (siehe interpreter.js) }
 * Bei einem Fehler wird ein CodeFehler geworfen.
 */
export function programmAusfuehren(code) {
  const ergebnis = { tempo: 120, tonart: STANDARD_TONART, spuren: new Map(), szenen: new Map(), ablauf: [], hinweise: [], ausgaben: [], tasten: new Map() };

  /** 3-Takt-Muster auf 4 Takte ergänzen und Hinweis merken (Muster ist Text oder Liste) */
  function aufVierTakte(muster, was, zeile, extra) {
    const hinweis = dreiTakteHinweis(muster.length, was, extra);
    if (!hinweis) return muster;
    ergebnis.hinweise.push(`In Zeile ${zeile} ${hinweis}`);
    return typeof muster === 'string'
      ? muster + '.'.repeat(SCHRITTE_PRO_TAKT)
      : muster.concat(new Array(SCHRITTE_PRO_TAKT).fill(null));
  }
  const szenenZeilen = new Map(); // für Fehlermeldungen nach dem Ausführen
  let ablaufZeile = null;

  const befehle = {
    tempo(positionell, benannt, zeile) {
      const { zahl } = angaben('tempo', ['zahl'], positionell, benannt, zeile);
      if (zahl === undefined) throw fehler(zeile, 'fehlt bei tempo die Zahl, zum Beispiel tempo(120).');
      if (typeof zahl !== 'number') throw fehler(zeile, 'braucht tempo eine Zahl ohne Anführungszeichen, zum Beispiel tempo(120).');
      if (zahl < 40 || zahl > 300) throw fehler(zeile, `ist das Tempo ${zahl}. Es muss zwischen 40 und 300 liegen.`);
      ergebnis.tempo = zahl;
    },

    tonart(positionell, benannt, zeile) {
      const { name } = angaben('tonart', ['name'], positionell, benannt, zeile);
      if (typeof name !== 'string') {
        throw fehler(zeile, 'braucht tonart einen Namen in Anführungszeichen, zum Beispiel tonart("a-moll").');
      }
      const tonart = leseTonart(name);
      if (typeof tonart === 'string') throw fehler(zeile, tonart);
      ergebnis.tonart = tonart;
    },

    beat(positionell, benannt, zeile) {
      const { muster, klang } = angaben('beat', ['muster', 'klang'], positionell, benannt, zeile);
      if (muster === undefined) throw fehler(zeile, 'fehlt bei beat das Muster, zum Beispiel beat("x... x... x... x...", klang="kick").');
      const geprueft = leseBeat(muster, zeile);
      pruefeKlang(klang, SCHLAGZEUG, INSTRUMENTE, 'beat', 'melodie und akkorde', zeile);
      return new Baustein('beat', aufVierTakte(geprueft, 'dein Beat', zeile), klang, null);
    },

    melodie(positionell, benannt, zeile) {
      const { muster, klang, oktave, laenge } =
        angaben('melodie', ['muster', 'klang', 'oktave', 'laenge'], positionell, benannt, zeile);
      if (muster === undefined) {
        throw fehler(zeile, 'fehlen bei melodie die Töne, zum Beispiel melodie("1--- 3--- 5--- 3---", klang="marimba").');
      }
      pruefeKlang(klang, INSTRUMENTE, SCHLAGZEUG, 'melodie', 'beat', zeile);

      let schritte;
      if (typeof muster === 'string') {
        if (laenge !== undefined) {
          throw fehler(zeile, 'gilt laenge nur für Melodien als Liste, zum Beispiel melodie([1, 3, 5], ...). In einem Text machst du Töne mit Bindestrichen länger.');
        }
        schritte = leseMelodieText(muster, zeile);
      } else if (Array.isArray(muster)) {
        let laengeWert = 2; // Standard: Achtel
        if (laenge !== undefined) {
          if (!istGanzeZahl(laenge) || laenge < 1 || laenge > 16) {
            throw fehler(zeile, 'muss laenge eine ganze Zahl von 1 bis 16 sein. 1 ist ein Rasterschritt, 4 eine Viertelnote, 16 ein ganzer Takt.');
          }
          laengeWert = laenge;
        }
        schritte = leseMelodieListe(muster, laengeWert, zeile);
      } else {
        throw fehler(zeile, 'braucht melodie Töne als Text in Anführungszeichen oder als Liste in eckigen Klammern, zum Beispiel "1--- 3---" oder [1, 3, 5].');
      }

      schritte = aufVierTakte(schritte, 'deine Melodie', zeile);
      return new Baustein('melodie', schritte, klang, pruefeOktave(oktave, klang, zeile));
    },

    szene(positionell, benannt, zeile) {
      if (Object.keys(benannt).length > 0) {
        throw fehler(zeile, 'braucht szene nur eine Taste und Spurnummern, zum Beispiel szene("q", 1, 2, 3).');
      }
      const [taste, ...spuren] = positionell;
      if (typeof taste !== 'string') {
        throw fehler(zeile, 'braucht szene zuerst eine Taste in Anführungszeichen, zum Beispiel szene("q", 1, 2, 3).');
      }
      const t = taste.toLowerCase();
      if (!SZENEN_TASTEN.includes(t)) {
        throw fehler(zeile, `kann ${taste} keine Szenen-Taste sein. Es gibt die Tasten ${SZENEN_TASTEN.join(', ')}.`);
      }
      for (const nr of spuren) {
        if (!istGanzeZahl(nr) || nr < 1 || nr > 8) {
          throw fehler(zeile, `ist ${lesbar(nr)} keine gültige Spur. Schreibe Spurnummern von 1 bis 8 ohne Anführungszeichen.`);
        }
      }
      ergebnis.szenen.set(t, [...new Set(spuren)]);
      szenenZeilen.set(t, zeile);
    },

    ablauf(positionell, benannt, zeile) {
      if (Object.keys(benannt).length > 0) {
        throw fehler(zeile, 'braucht ablauf nur Szenen-Tasten, zum Beispiel ablauf("q", "q", "w", "e").');
      }
      if (positionell.length === 0) {
        throw fehler(zeile, 'ist der Ablauf leer. Schreibe die Szenen der Reihe nach hinein, zum Beispiel ablauf("q", "q", "w", "e").');
      }
      const tasten = [];
      for (const taste of positionell) {
        if (typeof taste !== 'string') {
          throw fehler(zeile, `steht im Ablauf ${lesbar(taste)}. Schreibe Szenen-Tasten in Anführungszeichen, zum Beispiel ablauf("q", "w").`);
        }
        const t = taste.toLowerCase();
        if (!SZENEN_TASTEN.includes(t)) {
          if (t.length > 1 && [...t.replace(/[\s,]/g, '')].every((z) => SZENEN_TASTEN.includes(z))) {
            throw fehler(zeile, 'stehen mehrere Szenen in einem Paar Anführungszeichen. Schreibe jede Szene einzeln, zum Beispiel ablauf("q", "w", "e").');
          }
          throw fehler(zeile, `kann "${taste}" keine Szene sein. Es gibt die Szenen-Tasten ${SZENEN_TASTEN.join(', ')}.`);
        }
        tasten.push(t);
      }
      ergebnis.ablauf = tasten;
      ablaufZeile = zeile;
    },

    akkorde(positionell, benannt, zeile) {
      const { folge, klang, oktave, laenge } =
        angaben('akkorde', ['folge', 'klang', 'oktave', 'laenge'], positionell, benannt, zeile);
      if (folge === undefined) {
        throw fehler(zeile, 'fehlt bei akkorde die Folge, zum Beispiel akkorde([1, 6, 4, 5], klang="pad").');
      }
      if (!Array.isArray(folge)) {
        throw fehler(zeile, 'braucht akkorde eine Liste in eckigen Klammern, zum Beispiel akkorde([1, 6, 4, 5], klang="pad").');
      }
      pruefeKlang(klang, INSTRUMENTE, SCHLAGZEUG, 'akkorde', 'beat', zeile, 'pad');
      let laengeWert = SCHRITTE_PRO_TAKT; // Standard: jeder Akkord einen Takt
      if (laenge !== undefined) {
        if (!istGanzeZahl(laenge) || laenge < 1 || laenge > 64) {
          throw fehler(zeile, 'muss laenge eine ganze Zahl von 1 bis 64 sein. 16 ist ein Takt, 8 ein halber Takt.');
        }
        laengeWert = laenge;
      }
      let schritte = leseMelodieListe(folge, laengeWert, zeile, true);
      // Typischer Fall: drei Akkorde zu je einem Takt
      const extra = folge.length === 3 && laengeWert === SCHRITTE_PRO_TAKT ? ' Probier einen vierten Akkord!' : '';
      schritte = aufVierTakte(schritte, 'deine Akkordfolge', zeile, extra);
      return new Baustein('melodie', schritte, klang, pruefeOktave(oktave, klang, zeile, true));
    },

    /** Zufälliges Element einer Liste (Lektion 7). Bei jedem Ausführen wird neu gewürfelt. */
    zufall(positionell, benannt, zeile) {
      if (positionell.length > 1) {
        throw fehler(zeile, `fehlen bei zufall die eckigen Klammern. Schreibe zum Beispiel zufall([${positionell.map(lesbar).join(', ')}]).`);
      }
      const { liste } = angaben('zufall', ['liste'], positionell, benannt, zeile);
      if (!Array.isArray(liste)) {
        throw fehler(zeile, `braucht zufall eine Liste, aus der es auswählt, zum Beispiel zufall([1, 3, 5]). Hier steht ${liste === undefined ? 'nichts' : lesbar(liste)}.`);
      }
      if (liste.length === 0) {
        throw fehler(zeile, 'ist die Liste bei zufall leer. Aus einer leeren Liste kann nichts gewürfelt werden.');
      }
      return liste[Math.floor(Math.random() * liste.length)];
    },

    /** Einen Wert unter dem Code anzeigen (wie print in Python) */
    zeige(positionell, benannt, zeile) {
      if (Object.keys(benannt).length > 0 || positionell.length === 0) {
        throw fehler(zeile, 'braucht zeige etwas zum Anzeigen, zum Beispiel zeige(lied).');
      }
      if (ergebnis.ausgaben.length < MAX_AUSGABEN) {
        ergebnis.ausgaben.push(`Zeile ${zeile}: ${positionell.map(alsText).join(' ')}`);
      } else if (ergebnis.ausgaben.length === MAX_AUSGABEN) {
        ergebnis.ausgaben.push(`… (mehr als ${MAX_AUSGABEN} Ausgaben, der Rest wird nicht angezeigt)`);
      }
    },

    /** Eigene Funktion auf eine Taste legen (Lektion 8) */
    taste(positionell, benannt, zeile) {
      const { buchstabe, funktion } = angaben('taste', ['buchstabe', 'funktion'], positionell, benannt, zeile);
      if (typeof buchstabe !== 'string' || !/^[a-zA-Z]$/.test(buchstabe)) {
        throw fehler(zeile, `braucht taste zuerst einen Buchstaben in Anführungszeichen, zum Beispiel taste("d", drop). Hier steht ${buchstabe === undefined ? 'nichts' : lesbar(buchstabe)}.`);
      }
      const b = buchstabe.toLowerCase();
      if (FESTE_TASTEN.includes(b)) {
        throw fehler(zeile, `ist die Taste ${b} schon belegt (${b === 'f' ? 'Fill' : 'Szenen'}). Nimm zum Beispiel a, s, d, g, h, j, k oder l.`);
      }
      if (funktion === undefined) {
        throw fehler(zeile, `fehlt bei taste die Funktion, zum Beispiel taste("${b}", drop).`);
      }
      if (!(funktion instanceof Funktion)) {
        throw fehler(zeile, `braucht taste den Namen einer Funktion ohne Klammern, zum Beispiel taste("${b}", drop). Lege die Funktion vorher mit def an.`);
      }
      if (funktion.parameter.length > 0) {
        throw fehler(zeile, `braucht die Funktion ${funktion.name} Angaben. Eine Funktion für eine Taste hat keine Angaben in den Klammern: def ${funktion.name}():`);
      }
      ergebnis.tasten.set(b, funktion);
    },

    spur(positionell, benannt, zeile) {
      const { nummer, daten } = spurLesen(positionell, benannt, zeile);
      ergebnis.spuren.set(nummer, daten);
    },
  };

  // Live-Befehle beim Ausführen des Codes: noch nicht erlaubt (sie wirken erst beim Tastendruck)
  for (const name of LIVE_BEFEHLE) {
    befehle[name] = (positionell, benannt, zeile) => {
      throw fehler(zeile, `wirkt ${name} erst, wenn eine Taste gedrückt wird. Schreibe den Befehl in eine Funktion und lege sie auf eine Taste: def drop(): … und taste("d", drop). Hinter drop stehen dabei keine Klammern.`);
    };
  }

  const laufzeit = ausfuehren(code, befehle);
  ergebnis.aufrufen = laufzeit.aufrufen;

  // jeder_takt(takt): ruft das Werkzeug zu Beginn jedes Takts auf (Lektion 9)
  const jt = laufzeit.globale('jeder_takt');
  ergebnis.jederTakt = null;
  if (jt instanceof Funktion) {
    if (jt.parameter.length !== 1) {
      throw fehler(jt.zeile, 'braucht jeder_takt genau eine Angabe für die Taktnummer: def jeder_takt(takt):');
    }
    ergebnis.jederTakt = jt;
  } else if (jt !== undefined) {
    throw fehler(1, 'ist jeder_takt ein besonderer Name für eine Funktion. Lege sie mit def jeder_takt(takt): an.');
  }

  // Erst am Ende prüfen: Szenen dürfen vor den spur()-Zeilen stehen
  for (const [taste, spuren] of ergebnis.szenen) {
    for (const nr of spuren) {
      if (!ergebnis.spuren.has(nr)) {
        throw fehler(szenenZeilen.get(taste),
          `benutzt die Szene ${taste} die Spur ${nr}. Auf Spur ${nr} liegt aber noch nichts. Lege zuerst einen Baustein darauf, zum Beispiel spur(${nr}, kick).`);
      }
    }
  }
  // Auch der Ablauf darf vor den szene()-Zeilen stehen
  for (const taste of ergebnis.ablauf) {
    if (!ergebnis.szenen.has(taste)) {
      throw fehler(ablaufZeile,
        `steht im Ablauf die Szene ${taste}. Die gibt es aber noch nicht. Lege sie an, zum Beispiel szene("${taste}", 1, 2).`);
    }
  }
  return ergebnis;
}

/**
 * Befehle, die beim Tastendruck wirken. aktionen kommt von der Oberfläche:
 * { szeneStarten(taste), filter(wert), fill(), zeige(text) }
 * Gibt die Befehle zurück, die beim Aufruf einer eigenen Funktion zusätzlich gelten.
 */
export function liveBefehle(programm, aktionen) {
  const live = {
    szene_starten(positionell, benannt, zeile) {
      const { taste } = angaben('szene_starten', ['taste'], positionell, benannt, zeile);
      const t = typeof taste === 'string' ? taste.toLowerCase() : null;
      if (!t || !SZENEN_TASTEN.includes(t)) {
        throw fehler(zeile, `braucht szene_starten eine Szenen-Taste in Anführungszeichen: ${SZENEN_TASTEN.map((x) => `"${x}"`).join(', ')}.`);
      }
      if (!programm.szenen.has(t)) {
        throw fehler(zeile, `gibt es die Szene ${t} noch nicht. Lege sie an, zum Beispiel szene("${t}", 1, 2).`);
      }
      aktionen.szeneStarten(t);
    },
    filter(positionell, benannt, zeile) {
      const { wert } = angaben('filter', ['wert'], positionell, benannt, zeile);
      if (typeof wert !== 'number' || wert < 0 || wert > 1) {
        throw fehler(zeile, 'braucht filter eine Zahl von 0 bis 1. 0 klingt ganz dunkel, 1 ganz hell (offen), zum Beispiel filter(0.3).');
      }
      aktionen.filter(wert);
    },
    fill(positionell, benannt, zeile) {
      if (positionell.length > 0 || Object.keys(benannt).length > 0) {
        throw fehler(zeile, 'braucht fill keine Angaben. Schreibe fill().');
      }
      aktionen.fill();
    },
    zeige(positionell, benannt, zeile) {
      if (positionell.length === 0) throw fehler(zeile, 'braucht zeige etwas zum Anzeigen, zum Beispiel zeige(lied).');
      aktionen.zeige(`Zeile ${zeile}: ${positionell.map(alsText).join(' ')}`);
    },
    /** spur in jeder_takt: wirkt im selben Takt; beim Tastendruck ab dem nächsten Takt */
    spur(positionell, benannt, zeile) {
      const { nummer, daten } = spurLesen(positionell, benannt, zeile);
      aktionen.spurSetzen(nummer, daten);
    },
  };
  for (const name of AUFBAU_BEFEHLE) {
    live[name] = (positionell, benannt, zeile) => {
      throw fehler(zeile, `wirkt ${name} nur beim Ausführen des Codes, nicht beim Drücken einer Taste.`);
    };
  }
  return live;
}
