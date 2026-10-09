// tonart.js – Tonarten und Umrechnung von Tonleiterstufen in Frequenzen.
// Melodien werden als Stufen gespeichert (1 = Grundton). Erst beim Abspielen
// wird mit der aktuellen Tonart die Tonhöhe berechnet. Ändert man die Tonart,
// wandert so das ganze Stück mit.

// Deutsche Notennamen → Halbtöne über c
const GRUNDTOENE = {
  c: 0, cis: 1, des: 1, d: 2, dis: 3, es: 3, e: 4, f: 5, fis: 6, ges: 6,
  g: 7, gis: 8, as: 8, a: 9, ais: 10, b: 10, h: 11,
};

// Abstände der 7 Stufen vom Grundton in Halbtönen
const LEITERN = {
  dur:  [0, 2, 4, 5, 7, 9, 11],
  moll: [0, 2, 3, 5, 7, 8, 10],   // natürliches Moll
};

export const STANDARD_TONART = { name: 'c-dur', grundton: 0, leiter: 'dur' };

/**
 * Liest einen Tonartnamen wie "a-moll" oder "Es-Dur".
 * Gibt { name, grundton, leiter } zurück oder einen Hinweistext (string) bei Fehlern.
 */
export function leseTonart(text) {
  const t = text.trim().toLowerCase();
  const teile = t.split(/[\s-]+/);
  if (teile.length !== 2) {
    return 'fehlt in der Tonart der Bindestrich zwischen Grundton und dur oder moll. Schreibe zum Beispiel "a-moll" oder "c-dur".';
  }
  const [ton, leiter] = teile;
  if (!(ton in GRUNDTOENE)) {
    return `kenne ich den Grundton ${ton} nicht. Möglich sind zum Beispiel c, d, e, f, g, a, h, fis, es oder b.`;
  }
  if (!(leiter in LEITERN)) {
    return `kenne ich ${leiter} nicht. Hinter dem Bindestrich steht dur oder moll.`;
  }
  return { name: `${ton}-${leiter}`, grundton: GRUNDTOENE[ton], leiter };
}

/**
 * Frequenz einer Stufe.
 * stufe 1–7 = Grundoktave, 8–14 = eine Oktave höher.
 * oktave wie bei Notennamen: oktave 4 beginnt beim mittleren c.
 */
export function frequenz(tonart, oktave, stufe) {
  const leiter = LEITERN[tonart.leiter];
  const index = (stufe - 1) % 7;
  const extraOktaven = Math.floor((stufe - 1) / 7);
  const midi = 12 * (oktave + 1) + tonart.grundton + leiter[index] + 12 * extraOktaven;
  return 440 * Math.pow(2, (midi - 69) / 12);
}
