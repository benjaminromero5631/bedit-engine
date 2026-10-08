// Preset predeterminado de B Edit (estilo calibrado con las capturas de referencia).
// Todo el diseño vive acá: cámbialo en un solo lugar.
// Los tamaños (sizePct) son fracción del alto del video: 0.0285 = 2,85%.
export const PRESET = {
  output: { width: 1080, height: 1920, fps: 30 },
  maxSeconds: 60,

  // Transcripción
  whisperModel: 'Xenova/whisper-base',
  fillerRegex: /^(e+h+m*|e+m+|h?m{2,}|hm+|a+h+|u+h+m*|u+m+)$/i,   // muletillas que se eliminan
  lowercase: true,                 // el texto transcrito parte todo en minúscula

  // Subtítulo normal (estilo "que sigas")
  subtitle: {
    fontFamily: 'Inter',
    fontWeight: 800,
    sizePct: 0.0285,
    tracking: -0.04,               // espaciado entre letras (em); negativo = apretado
    maxWords: 5,
    maxLines: 2,
    maxWidthPct: 0.86,
    centerYPct: 0.67,
    lineHeight: 1.18,
    fill: '#ffffff',
    shadow: { color: 'rgba(0,0,0,0.55)', blur: 0.32, offsetY: 0.06 },   // en em; sin contorno
    pauseBreakSec: 0.6,            // una pausa más larga corta la frase
  },

  // Subtítulo de apoyo: pequeño, secundario, se arrastra donde quieras (mismo tiempo que su frase)
  support: {
    fontFamily: 'Inter',
    fontWeight: 600,
    sizePct: 0.0215,
    tracking: -0.015,
    maxLines: 2,
    maxWidthPct: 0.62,
    centerYPct: 0.745,             // posición inicial (debajo de la base)
    lineHeight: 1.18,
    fill: '#ffffff',
    shadow: { color: 'rgba(0,0,0,0.55)', blur: 0.32, offsetY: 0.06 },
  },

  // Apoyo automático: DESACTIVADO (solo subtítulos principales)
  autoSupport: { enabled: false, xAlt: [0.30, 0.70] },

  // Frase destacada de 3 líneas (estilo "que quieren / HACER 10K / por mes")
  highlight: {
    centerYPct: 0.53,              // centro de la línea grande
    maxWidthPct: 0.84,
    popSec: 0.14,                  // entrada con "pop" pequeño
    popFrom: 0.86,
    offsets: { small: -0.0430, big: 0, serif: 0.0360 },   // posición vertical de cada línea (fracción del alto)
    small: { fontFamily: 'Inter', fontWeight: 600, sizePct: 0.0242, tracking: -0.01 },
    big:   { fontFamily: 'Inter', fontWeight: 900, sizePct: 0.061, tracking: -0.045 },
    serif: { fontFamily: '"Playfair Display"', fontWeight: 400, fontStyle: 'italic', sizePct: 0.0515, tracking: 0 },
    fill: '#ffffff',
    shadow: { color: 'rgba(0,0,0,0.35)', blur: 0.18, offsetY: 0.04 },
  },

  // Zooms automáticos (hacia el centro). Alterna zoom-in y zoom-out.
  zoom: {
    enabled: true,
    everySecMin: 2.0,
    everySecMax: 3.5,
    scaleMin: 1.15,                // se nota
    scaleMax: 1.25,
    fastSec: 0.18,                 // zoom rápido tipo golpe
    slowSec: 0.35,                 // zoom "lento" (igual ágil)
    snapWindowSec: 0.8,            // se pega al inicio de frase más cercano
  },
};
