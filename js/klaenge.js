// klaenge.js – alle Klänge, per Synthese erzeugt (keine Samples).
// Der Name in SCHLAGZEUG bzw. INSTRUMENTE ist das, was Kinder bei klang= schreiben.

// ─── Hilfen ──────────────────────────────────────────────

/** Grundlautstärke je Zeichen: X betont, x normal, o leise */
function anschlag(symbol) {
  return symbol === 'X' ? 1.0 : symbol === 'o' ? 0.3 : 0.7;
}

/** Rauschen für Snare und Hi-Hat (einmal erzeugen, dann wiederverwenden) */
let rauschPuffer = null;
function rauschen(ctx) {
  if (!rauschPuffer || rauschPuffer.sampleRate !== ctx.sampleRate) {
    rauschPuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const daten = rauschPuffer.getChannelData(0);
    for (let i = 0; i < daten.length; i++) daten[i] = Math.random() * 2 - 1;
  }
  const quelle = ctx.createBufferSource();
  quelle.buffer = rauschPuffer;
  return quelle;
}

/**
 * Lautstärke-Hüllkurve für gehaltene Töne:
 * kurz einschwingen, halten, am Ende sanft ausklingen (kein Knacken)
 */
function huellkurve(ctx, time, dauer, volume, einschwingen, ausklingen) {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, time);
  gain.gain.linearRampToValueAtTime(volume, time + einschwingen);
  gain.gain.setValueAtTime(volume, time + Math.max(einschwingen, dauer));
  gain.gain.linearRampToValueAtTime(0, time + Math.max(einschwingen, dauer) + ausklingen);
  return gain;
}

// ─── Schlagzeug ──────────────────────────────────────────
// Jeder Klang: (ctx, zeit, symbol, ausgang, lautstaerke 0–1)

/** Synthetische Kick-Drum */
function kick(ctx, time, symbol, ausgang, lautstaerke) {
  const volume = anschlag(symbol) * lautstaerke;

  // Oszillator: Frequenz-Sweep von 150Hz nach 40Hz
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(150, time);
  osc.frequency.exponentialRampToValueAtTime(40, time + 0.08);

  // Lautstärke-Hüllkurve
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);

  osc.connect(gain);
  gain.connect(ausgang);

  osc.start(time);
  osc.stop(time + 0.3);
}

/** Synthetische Snare: Rauschen (Schnarren) + kurzer Ton (Fell) */
function snare(ctx, time, symbol, ausgang, lautstaerke) {
  const volume = anschlag(symbol) * lautstaerke;

  // Rauschen, tiefe Anteile weggefiltert
  const noise = rauschen(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 1200;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(volume * 0.8, time);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
  noise.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(ausgang);
  noise.start(time);
  noise.stop(time + 0.2);

  // Ton des Fells
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(220, time);
  osc.frequency.exponentialRampToValueAtTime(160, time + 0.1);
  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(volume * 0.6, time);
  oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
  osc.connect(oscGain);
  oscGain.connect(ausgang);
  osc.start(time);
  osc.stop(time + 0.1);
}

// Die offene Hi-Hat, die gerade klingt – eine geschlossene Hi-Hat stoppt sie (wie beim echten Schlagzeug).
// Getrennt je Audio-Umgebung, damit Abspielen und WAV-Export sich nicht gegenseitig stören.
const offeneHihats = new WeakMap();

/** Synthetische geschlossene Hi-Hat: kurzes, helles Rauschen */
function hihat(ctx, time, symbol, ausgang, lautstaerke) {
  const volume = anschlag(symbol) * lautstaerke * 0.4;
  const offen = offeneHihats.get(ctx);
  if (offen && offen.ende > time) {
    offen.gain.gain.cancelScheduledValues(time);
    offen.gain.gain.setTargetAtTime(0, time, 0.01);
    offeneHihats.delete(ctx);
  }

  const noise = rauschen(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 7000;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ausgang);
  noise.start(time);
  noise.stop(time + 0.06);
}

/** Offene Hi-Hat: wie die geschlossene, aber klingt lange nach */
function openhat(ctx, time, symbol, ausgang, lautstaerke) {
  const volume = anschlag(symbol) * lautstaerke * 0.35;
  const ende = time + 0.45;
  const noise = rauschen(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 6500;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, time);
  gain.gain.exponentialRampToValueAtTime(0.001, ende);
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ausgang);
  noise.start(time);
  noise.stop(ende);
  offeneHihats.set(ctx, { gain, ende });
}

/** Clap: mehrere schnell hintereinander klatschende Hände */
function clap(ctx, time, symbol, ausgang, lautstaerke) {
  const volume = anschlag(symbol) * lautstaerke * 2.0;
  const noise = rauschen(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 1200;
  filter.Q.value = 1;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, time);
  // drei kurze Klatscher, dann der Nachhall
  for (const versatz of [0, 0.011, 0.022]) {
    gain.gain.setValueAtTime(volume, time + versatz);
    gain.gain.exponentialRampToValueAtTime(Math.max(volume * 0.2, 0.0001), time + versatz + 0.009);
  }
  gain.gain.setValueAtTime(volume * 0.8, time + 0.031);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ausgang);
  noise.start(time);
  noise.stop(time + 0.21);
}

/** Rimshot: kurzer, harter Klick auf den Trommelrand */
function rim(ctx, time, symbol, ausgang, lautstaerke) {
  const volume = anschlag(symbol) * lautstaerke * 0.75;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 1700;
  filter.Q.value = 2;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
  filter.connect(gain);
  gain.connect(ausgang);
  for (const f of [1700, 820]) {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    o.connect(filter);
    o.start(time);
    o.stop(time + 0.05);
  }
}

/** Tom: Trommel mit Tonhöhe, die nach unten gleitet – gut für Fills */
function tom(ctx, time, symbol, ausgang, lautstaerke) {
  const volume = anschlag(symbol) * lautstaerke * 0.9;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(190, time);
  osc.frequency.exponentialRampToValueAtTime(100, time + 0.25);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.4);
  osc.connect(gain);
  gain.connect(ausgang);
  osc.start(time);
  osc.stop(time + 0.4);
}

/** Becken (Crash): metallisch, klingt lange aus */
function becken(ctx, time, symbol, ausgang, lautstaerke) {
  const volume = anschlag(symbol) * lautstaerke * 0.3;
  const ende = time + 1.8;
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 5000;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, time);
  gain.gain.exponentialRampToValueAtTime(0.001, ende);
  filter.connect(gain);
  gain.connect(ausgang);

  // Rauschen für das Zischen
  const noise = rauschen(ctx);
  noise.connect(filter);
  noise.start(time);
  noise.stop(ende);
  // Metallischer Anteil: Rechteckwellen mit „schiefen“ Frequenzen (wie beim Drumcomputer TR-808)
  const metallGain = ctx.createGain();
  metallGain.gain.value = 0.25;
  metallGain.connect(filter);
  for (const f of [205.3, 304.4, 369.6, 522.7, 540, 800]) {
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = f;
    o.connect(metallGain);
    o.start(time);
    o.stop(ende);
  }
}

/** Shaker: kurzes, weiches Rasseln */
function shaker(ctx, time, symbol, ausgang, lautstaerke) {
  const volume = anschlag(symbol) * lautstaerke * 0.3;
  const noise = rauschen(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 5000;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, time);
  gain.gain.linearRampToValueAtTime(volume, time + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ausgang);
  noise.start(time);
  noise.stop(time + 0.11);
}

/** Kuhglocke: zwei Töne, die zusammen blechern klingen (wie beim TR-808) */
function cowbell(ctx, time, symbol, ausgang, lautstaerke) {
  const volume = anschlag(symbol) * lautstaerke * 0.35;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 800;
  filter.Q.value = 1.5;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, time);
  gain.gain.exponentialRampToValueAtTime(Math.max(volume * 0.3, 0.0001), time + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.35);
  filter.connect(gain);
  gain.connect(ausgang);
  for (const f of [540, 800]) {
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = f;
    o.connect(filter);
    o.start(time);
    o.stop(time + 0.36);
  }
}

export const SCHLAGZEUG = { kick, snare, hihat, openhat, clap, rim, tom, becken, shaker, cowbell };

// ─── Melodie-Instrumente ─────────────────────────────────
// Jeder Klang: (ctx, zeit, frequenz, dauer in Sekunden, ausgang, lautstaerke 0–1)

/** Synth-Bass: zwei leicht verstimmte Oszillatoren durch ein Tiefpassfilter, das sich schließt */
function synbass(ctx, time, freq, dauer, ausgang, lautstaerke) {
  const volume = 0.45 * lautstaerke;
  const ende = time + dauer + 0.06;

  const osc1 = ctx.createOscillator();
  osc1.type = 'sawtooth';
  osc1.frequency.value = freq;
  const osc2 = ctx.createOscillator();
  osc2.type = 'square';
  osc2.frequency.value = freq * 1.004;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 6;
  filter.frequency.setValueAtTime(1800, time);
  filter.frequency.exponentialRampToValueAtTime(250, time + 0.25);

  const gain = huellkurve(ctx, time, dauer, volume, 0.005, 0.05);

  osc1.connect(filter);
  osc2.connect(filter);
  filter.connect(gain);
  gain.connect(ausgang);
  osc1.start(time); osc2.start(time);
  osc1.stop(ende); osc2.stop(ende);
}

/** Marimba: weicher Grundton mit einem kurzen hellen Oberton, klingt von selbst aus */
function marimba(ctx, time, freq, dauer, ausgang, lautstaerke) {
  const volume = 1.0 * lautstaerke;
  const ausklang = 0.8;

  const grund = ctx.createOscillator();
  grund.type = 'sine';
  grund.frequency.value = freq;
  const grundGain = ctx.createGain();
  grundGain.gain.setValueAtTime(0, time);
  grundGain.gain.linearRampToValueAtTime(volume, time + 0.003);
  grundGain.gain.exponentialRampToValueAtTime(0.001, time + ausklang);

  const ober = ctx.createOscillator();
  ober.type = 'sine';
  ober.frequency.value = freq * 4;
  const oberGain = ctx.createGain();
  oberGain.gain.setValueAtTime(0, time);
  oberGain.gain.linearRampToValueAtTime(volume * 0.4, time + 0.002);
  oberGain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);

  grund.connect(grundGain); grundGain.connect(ausgang);
  ober.connect(oberGain); oberGain.connect(ausgang);
  grund.start(time); ober.start(time);
  grund.stop(time + ausklang); ober.stop(time + 0.12);
}

/** Lead: Rechteck-Klang wie in alten Videospielen, etwas abgerundet */
function lead(ctx, time, freq, dauer, ausgang, lautstaerke) {
  const volume = 0.2 * lautstaerke;
  const ende = time + dauer + 0.1;

  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.value = freq;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 3000;

  const gain = huellkurve(ctx, time, dauer, volume, 0.01, 0.08);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ausgang);
  osc.start(time);
  osc.stop(ende);
}

/** Oszillator anlegen, starten und zum richtigen Zeitpunkt wieder stoppen */
function osz(ctx, typ, freq, start, ende, ziel, verstimmung = 0) {
  const o = ctx.createOscillator();
  o.type = typ;
  o.frequency.value = freq;
  o.detune.value = verstimmung; // in Cent (100 Cent = 1 Halbton)
  o.connect(ziel);
  o.start(start);
  o.stop(ende);
  return o;
}

function tiefpass(ctx, frequenz, q = 1) {
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = frequenz;
  f.Q.value = q;
  return f;
}

/** Leichtes Vibrato (Tonhöhe schwingt), setzt erst nach kurzer Zeit ein */
function vibrato(ctx, oszillatoren, time, ende, tiefe = 6) {
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 5;
  const staerke = ctx.createGain();
  staerke.gain.setValueAtTime(0, time);
  staerke.gain.linearRampToValueAtTime(tiefe, time + 0.4);
  lfo.connect(staerke);
  for (const o of oszillatoren) staerke.connect(o.detune);
  lfo.start(time);
  lfo.stop(ende);
}

/** Pad: drei verstimmte Sägezähne, weich ein- und ausblendend – für Akkordflächen */
function pad(ctx, time, freq, dauer, ausgang, lautstaerke) {
  const ende = time + dauer + 0.6;
  const gain = huellkurve(ctx, time, dauer, 0.12 * lautstaerke, 0.25, 0.5);
  const filter = tiefpass(ctx, 1400);
  filter.connect(gain);
  gain.connect(ausgang);
  for (const cent of [-9, 0, 9]) osz(ctx, 'sawtooth', freq, time, ende, filter, cent);
}

/** E-Piano: glockiger Anschlag, der weicher wird (FM-Synthese) */
function epiano(ctx, time, freq, dauer, ausgang, lautstaerke) {
  const volume = 0.8 * lautstaerke;
  const halten = Math.max(dauer, 0.05);
  const ende = time + halten + 0.2;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, time);
  gain.gain.linearRampToValueAtTime(volume, time + 0.005);
  // exponentielle Rampen dürfen nicht bei 0 enden (z. B. bei lautstaerke=0)
  gain.gain.exponentialRampToValueAtTime(Math.max(volume * 0.3, 0.0001), time + halten + 0.001);
  gain.gain.linearRampToValueAtTime(0, ende);
  gain.connect(ausgang);

  const traeger = osz(ctx, 'sine', freq, time, ende, gain);
  const mod = ctx.createOscillator();
  mod.frequency.value = freq;
  const modStaerke = ctx.createGain();
  modStaerke.gain.setValueAtTime(freq * 1.8, time);
  modStaerke.gain.exponentialRampToValueAtTime(freq * 0.35, time + 0.6);
  mod.connect(modStaerke);
  modStaerke.connect(traeger.frequency);
  mod.start(time);
  mod.stop(ende);
}

/** Orgel: Grundton mit Obertönen, sofort voll da */
function orgel(ctx, time, freq, dauer, ausgang, lautstaerke) {
  const ende = time + dauer + 0.06;
  const gain = huellkurve(ctx, time, dauer, 0.2 * lautstaerke, 0.01, 0.05);
  gain.connect(ausgang);
  for (const [faktor, anteil] of [[1, 1], [2, 0.7], [3, 0.5], [4, 0.3], [6, 0.2], [8, 0.15]]) {
    const teil = ctx.createGain();
    teil.gain.value = anteil;
    teil.connect(gain);
    osz(ctx, 'sine', freq * faktor, time, ende, teil);
  }
}

/** Pluck: gezupfter Klang, der schnell dunkler wird */
function pluck(ctx, time, freq, dauer, ausgang, lautstaerke) {
  const ausklang = Math.min(Math.max(dauer, 0.15) + 0.3, 1.2);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.3 * lautstaerke, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + ausklang);
  const filter = tiefpass(ctx, 4000, 2);
  filter.frequency.setValueAtTime(5000, time);
  filter.frequency.exponentialRampToValueAtTime(freq * 1.5, time + 0.25);
  filter.connect(gain);
  gain.connect(ausgang);
  osz(ctx, 'sawtooth', freq, time, time + ausklang, filter);
}

/** Glocke: heller, metallischer Klang mit langem Ausklang (FM-Synthese) */
function glocke(ctx, time, freq, dauer, ausgang, lautstaerke) {
  const ausklang = 2.0;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, time);
  gain.gain.linearRampToValueAtTime(0.6 * lautstaerke, time + 0.003);
  gain.gain.exponentialRampToValueAtTime(0.001, time + ausklang);
  gain.connect(ausgang);

  const traeger = osz(ctx, 'sine', freq, time, time + ausklang, gain);
  const mod = ctx.createOscillator();
  mod.frequency.value = freq * 3.5;
  const modStaerke = ctx.createGain();
  modStaerke.gain.setValueAtTime(freq * 2, time);
  modStaerke.gain.exponentialRampToValueAtTime(freq * 0.05, time + ausklang);
  mod.connect(modStaerke);
  modStaerke.connect(traeger.frequency);
  mod.start(time);
  mod.stop(time + ausklang);
}

/** Pulswelle mit 25 % Breite – der typische Klang alter Spielkonsolen */
const pulsWellen = new WeakMap();
function pulsWelle(ctx) {
  if (!pulsWellen.has(ctx)) {
    const n = 64;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    for (let k = 1; k < n; k++) imag[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * 0.25);
    pulsWellen.set(ctx, ctx.createPeriodicWave(real, imag));
  }
  return pulsWellen.get(ctx);
}

/** Chip: 8-Bit-Klang wie in alten Videospielen */
function chip(ctx, time, freq, dauer, ausgang, lautstaerke) {
  const ende = time + dauer + 0.03;
  const gain = huellkurve(ctx, time, dauer, 0.28 * lautstaerke, 0.002, 0.02);
  gain.connect(ausgang);
  const o = ctx.createOscillator();
  o.setPeriodicWave(pulsWelle(ctx));
  o.frequency.value = freq;
  o.connect(gain);
  o.start(time);
  o.stop(ende);
}

/** Streicher: weich einsetzend, mit Vibrato */
function streicher(ctx, time, freq, dauer, ausgang, lautstaerke) {
  const ende = time + dauer + 0.4;
  const gain = huellkurve(ctx, time, dauer, 0.13 * lautstaerke, 0.15, 0.35);
  const filter = tiefpass(ctx, 2500);
  filter.connect(gain);
  gain.connect(ausgang);
  const oszillatoren = [-6, 6].map((cent) => osz(ctx, 'sawtooth', freq, time, ende, filter, cent));
  vibrato(ctx, oszillatoren, time, ende);
}

/** Flöte: fast reiner Ton mit einem kurzen Luftstoß beim Anblasen */
function floete(ctx, time, freq, dauer, ausgang, lautstaerke) {
  const ende = time + dauer + 0.1;
  const gain = huellkurve(ctx, time, dauer, 0.32 * lautstaerke, 0.05, 0.08);
  gain.connect(ausgang);
  const grund = osz(ctx, 'sine', freq, time, ende, gain);
  const oberGain = ctx.createGain();
  oberGain.gain.value = 0.3;
  oberGain.connect(gain);
  const ober = osz(ctx, 'sine', freq * 2, time, ende, oberGain);
  const ober3Gain = ctx.createGain();
  ober3Gain.gain.value = 0.05;
  ober3Gain.connect(gain);
  const ober3 = osz(ctx, 'sine', freq * 3, time, ende, ober3Gain);
  vibrato(ctx, [grund, ober, ober3], time, ende, 8);

  // Anblasen: kurzer, leiser Luftstoß nur am Tonanfang (kein Dauerrauschen)
  const atem = rauschen(ctx);
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = freq * 2;
  band.Q.value = 4;
  const atemGain = ctx.createGain();
  atemGain.gain.setValueAtTime(0.06, time);
  atemGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.08);
  atem.connect(band);
  band.connect(atemGain);
  atemGain.connect(gain);
  atem.start(time);
  atem.stop(time + 0.09);
}

/** Subbass: sehr tiefer, runder Bass – eher zu spüren als zu hören */
function subbass(ctx, time, freq, dauer, ausgang, lautstaerke) {
  const ende = time + dauer + 0.06;
  const gain = huellkurve(ctx, time, dauer, 0.7 * lautstaerke, 0.005, 0.05);
  gain.connect(ausgang);
  osz(ctx, 'sine', freq, time, ende, gain);
  // Obertöne, damit der Bass auch auf kleinen Lautsprechern zu hören ist
  const obertonGain = ctx.createGain();
  obertonGain.gain.value = 0.45;
  obertonGain.connect(gain);
  osz(ctx, 'triangle', freq * 2, time, ende, obertonGain);
  const ober3Gain = ctx.createGain();
  ober3Gain.gain.value = 0.15;
  ober3Gain.connect(gain);
  osz(ctx, 'sine', freq * 3, time, ende, ober3Gain);
}

/** Acid: quietschender Bass mit stark betontem Filter */
function acid(ctx, time, freq, dauer, ausgang, lautstaerke) {
  const ende = time + dauer + 0.04;
  const gain = huellkurve(ctx, time, dauer, 0.25 * lautstaerke, 0.003, 0.03);
  const filter = tiefpass(ctx, 3000, 14);
  filter.frequency.setValueAtTime(3000, time);
  filter.frequency.exponentialRampToValueAtTime(Math.max(freq * 2, 200), time + 0.18);
  filter.connect(gain);
  gain.connect(ausgang);
  osz(ctx, 'sawtooth', freq, time, ende, filter);
}

/** Brass: Blechbläser – der Klang öffnet sich beim Anblasen */
function brass(ctx, time, freq, dauer, ausgang, lautstaerke) {
  const ende = time + dauer + 0.12;
  const gain = huellkurve(ctx, time, dauer, 0.16 * lautstaerke, 0.04, 0.1);
  const filter = tiefpass(ctx, 500, 1);
  filter.frequency.setValueAtTime(500, time);
  filter.frequency.linearRampToValueAtTime(3500, time + 0.08);
  filter.frequency.linearRampToValueAtTime(2000, time + 0.3);
  filter.connect(gain);
  gain.connect(ausgang);
  for (const cent of [-5, 5]) osz(ctx, 'sawtooth', freq, time, ende, filter, cent);
}

/** Supersaw: fetter, breiter Klang aus fünf verstimmten Sägezähnen (Trance, EDM) */
function supersaw(ctx, time, freq, dauer, ausgang, lautstaerke) {
  const ende = time + dauer + 0.15;
  const gain = huellkurve(ctx, time, dauer, 0.06 * lautstaerke, 0.01, 0.12);
  const filter = tiefpass(ctx, 5000);
  filter.connect(gain);
  gain.connect(ausgang);
  for (const cent of [-22, -11, 0, 11, 22]) osz(ctx, 'sawtooth', freq, time, ende, filter, cent);
}

/** Instrumente mit ihrer Standard-Oktave (gilt, wenn im Code keine oktave= steht) */
export const INSTRUMENTE = {
  synbass:   { spielen: synbass,   oktave: 2 },
  subbass:   { spielen: subbass,   oktave: 2 },
  acid:      { spielen: acid,      oktave: 2 },
  marimba:   { spielen: marimba,   oktave: 4 },
  lead:      { spielen: lead,      oktave: 4 },
  chip:      { spielen: chip,      oktave: 4 },
  pluck:     { spielen: pluck,     oktave: 4 },
  epiano:    { spielen: epiano,    oktave: 4 },
  orgel:     { spielen: orgel,     oktave: 4 },
  pad:       { spielen: pad,       oktave: 3 },
  streicher: { spielen: streicher, oktave: 3 },
  brass:     { spielen: brass,     oktave: 4 },
  supersaw:  { spielen: supersaw,  oktave: 4 },
  floete:    { spielen: floete,    oktave: 4 },
  glocke:    { spielen: glocke,    oktave: 5 },
};
