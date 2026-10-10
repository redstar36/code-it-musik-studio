// raster.js – Raster zum Anklicken unter dem Textfeld (KONZEPT.md 3.8).
// Steht der Cursor in einer Zeile mit beat("…") oder melodie("…"), zeigt das Raster genau dieses Muster.
//   Beat:    eine Reihe Kästchen pro Takt, ein Klick ändert ein Zeichen: . → x → X → o → .
//   Melodie: Zeilen = Tonstufen, Spalten = 16 Schritte eines Takts (wie eine „Piano-Roll“).
//            Klick setzt oder löscht einen Ton, Ziehen nach rechts macht ihn länger.
// Der Code bleibt die Hauptsache; das Raster schreibt nur in ihn hinein.

const REIHUM = ['.', 'x', 'X', 'o'];
const BEAT_ERLAUBT = /^[.xXo ]*$/;
const HOECHSTE_STUFE = 14;

/**
 * editor:        das Textfeld
 * bereich:       das Element unter dem Textfeld, in das das Raster gezeichnet wird
 * stufe:         Kursstufe (KONZEPT.md 3.7): Beats ab 2, Melodien ab 3
 * nachAenderung: wird nach jeder Änderung aufgerufen (z. B. Code neu ausführen)
 */
export function rasterEinrichten(editor, bereich, stufe, nachAenderung) {
  let spalten = [];        // pro Schritt die Kästchen, die beim Abspielen markiert werden
  let musterTakte = 0;     // Länge des gezeigten Musters in Takten
  let gezeigterTakt = 0;   // Melodie: welcher Takt gerade zu sehen ist (bei Beats alle)
  let hoheToene = false;   // Melodie: Stufen 9 bis 14 anzeigen
  let letzteZeile = null;  // Zeilennummer beim letzten Zeichnen (Takt zurücksetzen bei Wechsel)
  let ziehen = null;       // Melodie: laufende Maus-Aktion

  // ─── Muster in der Cursorzeile finden ──────────────────

  function musterAmCursor() {
    const text = editor.value;
    const cursor = editor.selectionStart;
    const zeilenStart = text.lastIndexOf('\n', cursor - 1) + 1;
    let zeilenEnde = text.indexOf('\n', cursor);
    if (zeilenEnde === -1) zeilenEnde = text.length;
    const code = text.slice(zeilenStart, zeilenEnde).replace(/#.*$/, '');

    const erlaubt = stufe >= 3 ? /(beat|melodie)\(\s*"([^"\n]*)"/g : /(beat)\(\s*"([^"\n]*)"/g;
    const treffer = [...code.matchAll(erlaubt)];
    if (treffer.length === 0) return null;
    // Mehrere Muster in einer Zeile: das nehmen, in dem der Cursor steht, sonst das erste
    const spalte = cursor - zeilenStart;
    const t = treffer.find((m) => spalte >= m.index && spalte <= m.index + m[0].length + 1) ?? treffer[0];
    const start = zeilenStart + t.index + t[0].length - t[2].length - 1;
    const klang = /klang\s*=\s*"([^"]*)"/.exec(code.slice(t.index));
    const name = /^\s*([A-Za-z_äöüÄÖÜß][\wäöüÄÖÜß]*)\s*=/.exec(code);
    return {
      art: t[1],
      start,
      ende: start + t[2].length,
      text: t[2],
      zeilenNummer: text.slice(0, zeilenStart).split('\n').length,
      titel: name ? name[1] : (klang ? klang[1] : t[1]),
      klang: klang ? klang[1] : null,
    };
  }

  // ─── Code ändern ───────────────────────────────────────

  /** Text im Code ersetzen, so dass Rückgängig (Strg+Z) weiter funktioniert */
  function codeErsetzen(start, ende, neu) {
    const cursorStart = editor.selectionStart;
    const cursorEnde = editor.selectionEnd;
    const verschiebung = neu.length - (ende - start);
    if (document.activeElement === editor) {
      editor.setSelectionRange(start, ende);
      if (!document.execCommand('insertText', false, neu)) {
        editor.setRangeText(neu, start, ende, 'end');
        editor.dispatchEvent(new Event('input'));
      }
    } else {
      // Außerhalb des Textfelds (Live-Tasten aktiv): Fokus nicht ins Textfeld holen
      editor.setRangeText(neu, start, ende, 'preserve');
      editor.dispatchEvent(new Event('input'));
    }
    // Cursor bleibt in der Zeile; steht er hinter dem Muster, wandert er mit
    const neuePos = (p) => (p > ende ? p + verschiebung : Math.min(p, start + neu.length));
    editor.setSelectionRange(neuePos(cursorStart), neuePos(cursorEnde));
    zeichnen();
    nachAenderung();
  }

  // ─── Zeichnen ──────────────────────────────────────────

  function element(tag, klasse, text) {
    const e = document.createElement(tag);
    if (klasse) e.className = klasse;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function hinweisZeigen(text) {
    bereich.append(element('p', 'raster-hinweis', text));
  }

  function zeichnen() {
    if (ziehen) return;   // während des Ziehens zeichnet ziehenZeigen()
    const m = musterAmCursor();
    spalten = [];
    musterTakte = 0;
    bereich.innerHTML = '';
    if (!m) {
      bereich.hidden = true;
      letzteZeile = null;
      return;
    }
    bereich.hidden = false;
    if (m.zeilenNummer !== letzteZeile) gezeigterTakt = 0;
    letzteZeile = m.zeilenNummer;

    const kopf = element('div', 'raster-kopf');
    kopf.append(element('b', null, m.titel), ` · Zeile ${m.zeilenNummer}`);
    if (m.klang && m.klang !== m.titel) kopf.append(` · Klang ${m.klang}`);
    kopf.append(element('span', 'raster-hilfe', m.art === 'beat'
      ? 'Klick: Pause → x → X → o'
      : 'Klick: Ton setzen oder löschen · Ziehen: Ton länger machen'));
    bereich.append(kopf);

    if (m.art === 'beat') beatZeichnen(m);
    else melodieZeichnen(m);
  }

  // ─── Beat ──────────────────────────────────────────────

  function beatZeichnen(m) {
    const zeichen = m.text.replace(/ /g, '');
    if (!BEAT_ERLAUBT.test(m.text)) {
      const fremd = [...m.text].find((z) => !BEAT_ERLAUBT.test(z));
      hinweisZeigen(`Im Muster steht „${fremd}“. Erlaubt sind . x X o und Leerzeichen. Repariere es im Code, dann erscheint das Raster.`);
      return;
    }
    if (zeichen.length === 0 || zeichen.length % 16 !== 0 || zeichen.length > 64) {
      hinweisZeigen(`Das Muster hat ${zeichen.length} Zeichen. Für das Raster braucht es 16 Zeichen pro Takt (16, 32, 48 oder 64).`);
      return;
    }

    // Ein Takt pro Reihe, 16 Kästchen in Vierergruppen
    musterTakte = zeichen.length / 16;
    let position = m.start;   // Stelle im Code
    let reihe = null;
    for (const z of m.text) {
      if (z === ' ') { position++; continue; }
      const nr = spalten.length;
      if (nr % 16 === 0) {
        reihe = element('div', 'raster-reihe');
        if (musterTakte > 1) reihe.append(element('span', 'raster-takt', `Takt ${nr / 16 + 1}`));
        bereich.append(reihe);
      }
      const knopf = element('button', 'raster-zelle' + (nr % 4 === 0 && nr % 16 !== 0 ? ' gruppe' : ''), z === '.' ? '' : z);
      knopf.type = 'button';
      knopf.tabIndex = -1;
      knopf.dataset.zeichen = z;
      knopf.title = `Schritt ${(nr % 16) + 1}`;
      // Fokus im Textfeld lassen, damit der Cursor in der Zeile bleibt
      knopf.addEventListener('mousedown', (e) => e.preventDefault());
      const stelle = position;
      knopf.addEventListener('click', () => {
        const neu = REIHUM[(REIHUM.indexOf(z) + 1) % REIHUM.length];
        codeErsetzen(stelle, stelle + 1, neu);
      });
      reihe.append(knopf);
      spalten.push([knopf]);
      position++;
    }
  }

  // ─── Melodie ───────────────────────────────────────────

  /**
   * Melodie-Text → Schritte. Jeder Schritt ist null (Pause) oder { s: Stufe, start: true/false }.
   * Gibt { schritte } zurück oder { hinweis } bei Fehlern (gleiche Regeln wie im Interpreter).
   */
  function melodieLesen(text) {
    const schritte = [];
    let i = 0;
    while (i < text.length) {
      const c = text[i];
      if (c === ' ') { i++; continue; }
      if (/[0-9]/.test(c)) {
        let j = i;
        while (j < text.length && /[0-9]/.test(text[j])) j++;
        const ziffern = text.slice(i, j);
        const s = Number(ziffern);
        if (ziffern.length > 1 && (s < 10 || s > HOECHSTE_STUFE)) {
          return { hinweis: `In der Melodie steht ${ziffern}. Trenne mehrere Töne mit Leerzeichen, zum Beispiel ${ziffern.split('').join(' ')}. Dann erscheint das Raster.` };
        }
        if (s < 1 || s > HOECHSTE_STUFE) {
          return { hinweis: `In der Melodie steht der Ton ${s}. Töne gehen von 1 bis ${HOECHSTE_STUFE}. Repariere es im Code, dann erscheint das Raster.` };
        }
        schritte.push({ s, start: true });
        i = j;
        continue;
      }
      if (c === '-') {
        const davor = schritte[schritte.length - 1];
        if (!davor) {
          return { hinweis: 'Vor einem Bindestrich muss ein Ton stehen. Repariere es im Code, dann erscheint das Raster.' };
        }
        schritte.push({ s: davor.s, start: false });
        i++;
        continue;
      }
      if (c === '.') {
        schritte.push(null);
        i++;
        continue;
      }
      return { hinweis: `In der Melodie steht „${c}“. Erlaubt sind Zahlen, Bindestriche - und Punkte. Repariere es im Code, dann erscheint das Raster.` };
    }
    if (schritte.length === 0 || schritte.length % 16 !== 0 || schritte.length > 64) {
      return { hinweis: `Die Melodie hat ${schritte.length} Schritte. Für das Raster braucht es 16 Schritte pro Takt (16, 32, 48 oder 64).` };
    }
    return { schritte };
  }

  /** Schritte → Melodie-Text, in Vierergruppen; zwischen zwei Zahlen steht immer ein Leerzeichen */
  function melodieSchreiben(schritte) {
    let text = '';
    let davorZahl = false;
    schritte.forEach((x, i) => {
      const zeichen = x === null ? '.' : x.start ? String(x.s) : '-';
      const istZahl = x !== null && x.start;
      if (i > 0 && (i % 4 === 0 || (davorZahl && istZahl))) text += ' ';
      text += zeichen;
      davorZahl = istZahl;
    });
    return text;
  }

  /** Ton von a bis b (Stufe s) setzen; ein Rest eines überschriebenen Tons wird ein eigener Ton */
  function tonSetzen(alt, a, b, s) {
    const neu = alt.slice();
    for (let j = a; j <= b; j++) neu[j] = { s, start: j === a };
    if (neu[b + 1] && !neu[b + 1].start) neu[b + 1] = { s: neu[b + 1].s, start: true };
    return neu;
  }

  /** Ab Schritt a bis zum Ende des Tons Pause setzen (löschen oder kürzen) */
  function tonEntfernenAb(alt, a) {
    const neu = alt.slice();
    neu[a] = null;
    for (let j = a + 1; j < neu.length && neu[j] && !neu[j].start; j++) neu[j] = null;
    return neu;
  }

  function melodieZeichnen(m) {
    const gelesen = melodieLesen(m.text);
    if (gelesen.hinweis) {
      hinweisZeigen(gelesen.hinweis);
      return;
    }
    const schritte = gelesen.schritte;
    musterTakte = schritte.length / 16;
    if (gezeigterTakt >= musterTakte) gezeigterTakt = 0;
    const hoechste = Math.max(0, ...schritte.filter(Boolean).map((x) => x.s));
    const oben = hoheToene || hoechste > 8 ? HOECHSTE_STUFE : 8;

    // Leiste: Takt wählen, höhere Töne ein- und ausblenden
    const leiste = element('div', 'raster-leiste');
    if (musterTakte > 1) {
      for (let t = 0; t < musterTakte; t++) {
        const k = element('button', 'raster-taktknopf' + (t === gezeigterTakt ? ' gewaehlt' : ''), `Takt ${t + 1}`);
        k.type = 'button';
        k.tabIndex = -1;
        k.addEventListener('mousedown', (e) => e.preventDefault());
        k.addEventListener('click', () => { gezeigterTakt = t; zeichnen(); });
        leiste.append(k);
      }
    }
    if (hoechste <= 8) {
      const k = element('button', 'raster-taktknopf raster-hoehe', hoheToene ? 'Nur Töne 1 bis 8' : 'Höhere Töne (9 bis 14)');
      k.type = 'button';
      k.tabIndex = -1;
      k.addEventListener('mousedown', (e) => e.preventDefault());
      k.addEventListener('click', () => { hoheToene = !hoheToene; zeichnen(); });
      leiste.append(k);
    }
    if (leiste.childElementCount > 0) bereich.append(leiste);

    const feld = element('div', 'piano-roll');
    feld.addEventListener('mousedown', (e) => e.preventDefault());
    feld.addEventListener('pointerdown', (e) => ziehenBeginnen(e, m, schritte));
    bereich.append(feld);
    spalten = Array.from({ length: 16 }, () => []);
    pianoRollFuellen(feld, schritte, oben);
  }

  function pianoRollFuellen(feld, schritte, oben) {
    feld.innerHTML = '';
    for (let s = oben; s >= 1; s--) {
      const reihe = element('div', 'raster-reihe' + (s === 1 || s === 8 ? ' grundton' : ''));
      reihe.append(element('span', 'raster-stufe', String(s)));
      for (let i = 0; i < 16; i++) {
        const nr = gezeigterTakt * 16 + i;
        const x = schritte[nr];
        let klasse = 'roll-zelle' + (i % 4 === 0 && i > 0 ? ' gruppe' : '');
        if (x && x.s === s) klasse += x.start ? ' ton' : ' halten';
        const zelle = element('div', klasse, x && x.s === s && x.start ? String(s) : '');
        zelle.dataset.schritt = nr;
        zelle.dataset.stufe = s;
        zelle.title = `Ton ${s}, Schritt ${i + 1}`;
        reihe.append(zelle);
        if (spalten[i]) spalten[i].push(zelle);
      }
      feld.append(reihe);
    }
  }

  // ─── Melodie: Klicken und Ziehen ───────────────────────

  function zelleUnter(e) {
    const ziel = document.elementFromPoint(e.clientX, e.clientY);
    return ziel && ziel.closest ? ziel.closest('.roll-zelle') : null;
  }

  function ziehenBeginnen(e, m, schritte) {
    const zelle = zelleUnter(e);
    if (!zelle || e.button !== 0) return;
    e.preventDefault();
    const nr = Number(zelle.dataset.schritt);
    const s = Number(zelle.dataset.stufe);
    const x = schritte[nr];

    let art;
    let anfang = nr;
    if (x && x.s === s && x.start) {
      art = 'tonAngeklickt';            // Klick: löschen, Ziehen: neue Länge
    } else if (x && x.s === s) {
      art = 'mitteAngeklickt';          // Klick: ab hier kürzen, Ziehen: neue Länge
      while (anfang > 0 && !schritte[anfang].start) anfang--;
    } else {
      art = 'neu';                      // neuer Ton, Ziehen macht ihn länger
    }
    ziehen = {
      m, alt: schritte, art, anfang, s, startSchritt: nr, bewegt: false,
      jetzt: art === 'neu' ? tonSetzen(schritte, nr, nr, s) : schritte,
      oben: bereich.querySelectorAll('.piano-roll .raster-reihe').length,
    };
    ziehenZeigen();
    document.addEventListener('pointermove', ziehenBewegen);
    document.addEventListener('pointerup', ziehenBeenden);
    document.addEventListener('pointercancel', ziehenBeenden);
  }

  function ziehenBewegen(e) {
    const zelle = zelleUnter(e);
    if (!ziehen || !zelle) return;
    const nr = Number(zelle.dataset.schritt);
    if (nr === ziehen.startSchritt && !ziehen.bewegt) return;
    ziehen.bewegt = true;
    // Nur nach rechts, nur im gezeigten Takt
    const ende = Math.max(nr, ziehen.anfang);
    ziehen.jetzt = tonSetzen(ziehen.alt, ziehen.anfang, ende, ziehen.s);
    // Teile des alten Tons hinter dem neuen Ende werden Pause
    if (ziehen.art !== 'neu') {
      let j = ende + 1;
      while (j < ziehen.jetzt.length && ziehen.alt[j] && !ziehen.alt[j].start && ziehen.alt[j].s === ziehen.s) {
        ziehen.jetzt[j] = null;
        j++;
      }
    }
    ziehenZeigen();
  }

  function ziehenZeigen() {
    const feld = bereich.querySelector('.piano-roll');
    if (!feld) return;
    spalten = Array.from({ length: 16 }, () => []);
    pianoRollFuellen(feld, ziehen.jetzt, ziehen.oben === HOECHSTE_STUFE ? HOECHSTE_STUFE : 8);
  }

  function ziehenBeenden() {
    document.removeEventListener('pointermove', ziehenBewegen);
    document.removeEventListener('pointerup', ziehenBeenden);
    document.removeEventListener('pointercancel', ziehenBeenden);
    const z = ziehen;
    ziehen = null;
    if (!z) return;
    let ergebnis = z.jetzt;
    if (!z.bewegt && z.art === 'tonAngeklickt') ergebnis = tonEntfernenAb(z.alt, z.startSchritt);
    if (!z.bewegt && z.art === 'mitteAngeklickt') ergebnis = tonEntfernenAb(z.alt, z.startSchritt);
    const neu = melodieSchreiben(ergebnis);
    if (neu === z.m.text) { zeichnen(); return; }
    codeErsetzen(z.m.start, z.m.ende, neu);
  }

  // ─── Start ─────────────────────────────────────────────

  for (const ereignis of ['input', 'click', 'keyup', 'focus']) {
    editor.addEventListener(ereignis, zeichnen);
  }
  zeichnen();

  return {
    zeichnen,
    /** Laufenden Schritt markieren (step 0–15, bar ab 0) */
    schritt(step, bar) {
      if (musterTakte === 0) return;
      // 3 Takte werden auf 4 ergänzt (REFERENZ.md 4.4); im 4. Takt nichts markieren
      const takt = musterTakte === 3 ? bar % 4 : bar % musterTakte;
      const melodie = spalten.length === 16 && bereich.querySelector('.piano-roll');
      const nr = melodie ? (takt === gezeigterTakt ? step : -1) : (takt < musterTakte ? takt * 16 + step : -1);
      spalten.forEach((zellen, i) => zellen.forEach((z) => z.classList.toggle('jetzt', i === nr)));
    },
    /** Markierung entfernen, wenn die Musik stoppt */
    stopp() {
      spalten.forEach((zellen) => zellen.forEach((z) => z.classList.remove('jetzt')));
    },
  };
}
