// vorlagen.js – fertige Code-Beispiele, mit denen das Werkzeug startet.
// Die Vorlagen der Lektionen lassen sich per Link öffnen (KONZEPT.md 3.5), z. B. …/?vorlage=lektion-1-schritt-4

/**
 * Demo-Track für Lektion 1 „Dein erster Remix“:
 * Piraten-Game-Musik mit Drum & Bass-Beat (eigene Komposition, KONZEPT.md 6).
 * Bausteine: Dm – Gm – C – Am (Stufen 1, 4, 7, 5 in d-moll), jede Spur 4 Takte.
 */
export const DEMO_TRACK = `# Die Schatzinsel bei Nacht
# Piraten-Musik mit Drum & Bass-Beat

tempo(170)
tonart("d-moll")

# Schlagzeug
kick   = beat("x... .... ..x. ....", klang="kick")
snare  = beat(".... x... .... x...", klang="snare")
shaker = beat("xoxo xoxo xoxo xoxo", klang="shaker")

# Bass, Akkorde und Melodie
bass    = melodie("1--. ..1- ..1. 1-.. 4--. ..4- ..4. 4-.. 7--. ..7- ..7. 7-.. 5--. ..5- ..5. 5-..", klang="synbass")
flaeche = akkorde([1, 4, 7, 5], klang="streicher")
thema   = melodie("5-.5 8--- 7-6- 5--- 4-3- 4-5- 3--- 1--- 5-.5 8--- 9-8- 7--- 5-4- 3-4- 2--- 1---", klang="floete")

spur(1, kick)
spur(2, snare)
spur(3, shaker, lautstaerke=70)
spur(4, bass)
spur(5, flaeche, lautstaerke=70)
spur(6, thema)

# Szenen für das Live-Spiel
szene("q", 5, 6)             # Intro: nur Streicher und Flöte
szene("w", 1, 2, 3, 4)       # Beat und Bass
szene("e", 1, 2, 3, 4, 5, 6) # alles
szene("r", 3, 5)             # Pause zum Luftholen

# Reihenfolge im Song-Modus
ablauf("q", "w", "e", "r", "e")
`;

/**
 * Lektion 2 „Bau deinen Beat“: Startcode ohne Variablen –
 * Variablen kommen laut KONZEPT.md 4 erst in Lektion 3.
 */
const LEKTION_2 = `# Mein Beat

tempo(120)

# Kick auf 1 und 3, Snare auf 2 und 4
spur(1, beat("x... .... x... ....", klang="kick"))
spur(2, beat(".... x... .... x...", klang="snare"))
spur(3, beat("x.x. x.x. x.x. x.x.", klang="hihat"))
`;

/**
 * Lektion 1, Schritt 4 „Werde Tontechniker“: absichtlich verstellter Mix.
 * Der Bass ist viel zu laut, die Flöte kaum zu hören. Die Kinder reparieren das mit lautstaerke=.
 */
const LEKTION_1_MIX = DEMO_TRACK
  .replace('spur(1, kick)\n', '# Lautstärke von 0 (stumm) bis 100 (volle Lautstärke)\nspur(1, kick, lautstaerke=40)\n')
  .replace('spur(2, snare)\n', 'spur(2, snare, lautstaerke=40)\n')
  .replace('spur(4, bass)\n', 'spur(4, bass, lautstaerke=100)\n')
  .replace('spur(6, thema)\n', 'spur(6, thema, lautstaerke=5)\n');

/** Lektion 1, Schritt 5 „Bau deine eigene Szene“: zusätzliche Szene T zum Verändern */
const LEKTION_1_SZENE = DEMO_TRACK
  .replace('szene("r", 3, 5)             # Pause zum Luftholen\n',
           'szene("r", 3, 5)             # Pause zum Luftholen\nszene("t", 1, 4)             # deine Szene\n');

// ─── Lektion 2 „Bau deinen Beat“ (noch ohne Variablen) ───

const LEKTION_2_SCHRITT_1 = `# Mein Beat

tempo(120)

spur(1, beat("x... x... x... x...", klang="kick"))
`;

const LEKTION_2_SCHRITT_2 = `# Mein Beat

tempo(120)

spur(1, beat("x... .... x... ....", klang="kick"))
`;

const LEKTION_2_SCHRITT_3 = `# Mein Beat

tempo(120)

spur(1, beat("x... .... x... ....", klang="kick"))
spur(2, beat(".... x... .... x...", klang="snare"))
`;

/** Schritt 4: Spur 1 steht absichtlich zweimal – die untere Zeile gewinnt */
const LEKTION_2_SCHRITT_4 = `# Mein Beat

tempo(120)

spur(1, beat("x... .... x... ....", klang="kick"))
spur(2, beat(".... x... .... x...", klang="snare"))
spur(3, beat("x.x. x.x. x.x. x.x.", klang="hihat"))
spur(1, beat("x... x... x... x...", klang="kick"))
`;

const LEKTION_2_SCHRITT_5 = `# Mein eigener Beat

tempo(120)

# Kick
spur(1, beat(".... .... .... ....", klang="kick"))
# Snare
spur(2, beat(".... .... .... ....", klang="snare"))
# Hi-Hat
spur(3, beat(".... .... .... ....", klang="hihat"))
`;

// ─── Lektion 3 „Der Bass bringt den Groove“ (Variablen, Tonart) ───

/** Schritt 1: der Beat noch ohne Namen – die Kinder schreiben ihn mit Variablen um */
const LEKTION_3_SCHRITT_1 = `# Mein Groove

tempo(100)

spur(1, beat("x... .... x.x. ....", klang="kick"))
spur(2, beat(".... x... .... x...", klang="snare"))
spur(3, beat("x.x. x.x. x.x. x.x.", klang="hihat"))
`;

const LEKTION_3_SCHRITT_2 = `# Die Tonleiter

tempo(100)
tonart("c-dur")

leiter = melodie("1--- 2--- 3--- 4--- 5--- 6--- 7--- 8---", klang="marimba")

spur(1, leiter)
`;

const LEKTION_3_GROOVE = `# Mein Groove

tempo(100)
tonart("a-moll")

kick  = beat("x... .... x.x. ....", klang="kick")
snare = beat(".... x... .... x...", klang="snare")
hihat = beat("x.x. x.x. x.x. x.x.", klang="hihat")
bass  = melodie("1--- . 1-- 3-- 1- . 5-", klang="synbass", oktave=2)

spur(1, kick)
spur(2, snare)
spur(3, hihat)
spur(4, bass)
`;

/** Schritt 6: zusätzlich eine Glocken-Melodie, damit man hört, dass die Tonart überall wirkt */
const LEKTION_3_SCHRITT_6 = LEKTION_3_GROOVE
  .replace('bass  = melodie(', 'glitzer = melodie("8-.. 5-.. 3-.. 5-..", klang="glocke")\nbass  = melodie(')
  .replace('spur(4, bass)\n', 'spur(4, bass)\nspur(5, glitzer, lautstaerke=60)\n');

const LEER = `# Mein Song

tempo(120)
`;

/**
 * Feste Vorlagen, die sich per Link öffnen lassen: …/?vorlage=lektion-1
 * Der Name links ist Teil des Links und sollte sich nicht mehr ändern,
 * sobald er in Moodle steht. Den Code rechts kann man jederzeit verbessern.
 */
export const VORLAGEN = {
  'lektion-1': { titel: 'die Vorlage für Lektion 1', code: DEMO_TRACK },
  'lektion-1-schritt-0': { titel: 'die Aufgabe „So sieht das Musik Studio aus“ in Lektion 1', code: DEMO_TRACK },
  'lektion-1-schritt-1': { titel: 'die Aufgabe „Hör zu und spiel live“ in Lektion 1', code: DEMO_TRACK },
  'lektion-1-schritt-2': { titel: 'die Aufgabe „Lies den Code“ in Lektion 1', code: DEMO_TRACK },
  'lektion-1-schritt-3': { titel: 'die Aufgabe „Dreh am Tempo“ in Lektion 1', code: DEMO_TRACK },
  'lektion-1-schritt-4': { titel: 'die Aufgabe „Werde Tontechniker“ in Lektion 1', code: LEKTION_1_MIX },
  'lektion-1-schritt-5': { titel: 'die Aufgabe „Bau deine eigene Szene“ in Lektion 1', code: LEKTION_1_SZENE },
  'lektion-1-schritt-6': { titel: 'die Aufgabe „Dein Remix“ in Lektion 1', code: DEMO_TRACK },
  'lektion-2': { titel: 'die Vorlage für Lektion 2', code: LEKTION_2 },
  'lektion-2-schritt-1': { titel: 'die Aufgabe „Ein Takt hat 16 Schritte“ in Lektion 2', code: LEKTION_2_SCHRITT_1 },
  'lektion-2-schritt-2': { titel: 'die Aufgabe „Die Snare kommt dazu“ in Lektion 2', code: LEKTION_2_SCHRITT_2 },
  'lektion-2-schritt-3': { titel: 'die Aufgabe „Die Hi-Hat hält alles zusammen“ in Lektion 2', code: LEKTION_2_SCHRITT_3 },
  'lektion-2-schritt-4': { titel: 'die Aufgabe „Von oben nach unten“ in Lektion 2', code: LEKTION_2_SCHRITT_4 },
  'lektion-2-schritt-5': { titel: 'die Aufgabe „Dein eigener Beat“ in Lektion 2', code: LEKTION_2_SCHRITT_5 },
  'lektion-3-schritt-1': { titel: 'die Aufgabe „Bausteine bekommen Namen“ in Lektion 3', code: LEKTION_3_SCHRITT_1 },
  'lektion-3-schritt-2': { titel: 'die Aufgabe „Die Tonleiter“ in Lektion 3', code: LEKTION_3_SCHRITT_2 },
  'lektion-3-schritt-3': { titel: 'die Aufgabe „Dein erster Bass“ in Lektion 3', code: LEKTION_3_GROOVE },
  'lektion-3-schritt-4': { titel: 'die Aufgabe „Dur und Moll“ in Lektion 3', code: LEKTION_3_GROOVE },
  'lektion-3-schritt-5': { titel: 'die Aufgabe „Bau deine eigene Basslinie“ in Lektion 3', code: LEKTION_3_GROOVE },
  'lektion-3-schritt-6': { titel: 'die Aufgabe „Dein Groove“ in Lektion 3', code: LEKTION_3_SCHRITT_6 },
  'leer':      { titel: 'eine leere Vorlage', code: LEER },
};
