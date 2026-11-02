// Nadi services — the two nadi readings exposed by the Kundli AI report:
//
// 1. Nakshatra Nadi (Naadi based on the Moon's nakshatra) — the classic
//    Adi / Madhya / Antya grouping used by Avakhada Chakra and Guna Milan,
//    expanded here into a full per-nakshatra reading (prakriti, traits,
//    health, compatibility and remedies for each of the three nadis).
//
// 2. Chandra Kala Nadi (Deva Keralam tradition) — a rashi-based reading.
//    Each 30° rashi is divided into 150 nadi amshas of 0.2° (the Deva
//    Keralam / Chandra Kala Nadi division), and every nadi amsha is further
//    split into Poorvabhaga and Uttarbhaga. The report locates the Moon's
//    nadi amsha inside its rashi and interprets it through the three nadis.
//
// Pure functions — no ephemeris, no network, no chart recomputation. The
// caller (kundliCalculationService) supplies the already-computed Moon
// position so this module never has to import it back (CommonJS cycles).

const { RASHIS, RASHI_LORDS, NAKSHATRAS } = require("./vedicAstrologyService");
const { NAKSHATRA_LORDS, DASHA_ORDER } = require("./dashaService");

// --- The 27-nakshatra nadi rotation -------------------------------------
// Same order as Avakhada Chakra / Guna Milan (NADI_BY_NAKSHATRA), kept in
// title case here because these payloads are rendered directly as text.
const NAKSHATRA_NADI = [
  "Adi", "Madhya", "Antya", "Antya", "Madhya", "Adi", "Adi", "Madhya", "Antya",
  "Antya", "Madhya", "Adi", "Adi", "Madhya", "Antya", "Antya", "Madhya", "Adi",
  "Adi", "Madhya", "Antya", "Antya", "Madhya", "Adi", "Adi", "Madhya", "Antya",
];

// --- What each nadi means -------------------------------------------------
const NADI_INFO = {
  Adi: {
    name: "Adi Nadi",
    prakriti: "Vata (Air)",
    description:
      "Adi is the first nadi — the vata constitution. It governs movement, nerves and imagination, so its natives think fast, start many things and need routine, warmth and grounding to stay balanced.",
    traits: ["Creative", "Restless", "Quick thinker", "Independent", "Nervous energy", "Idealistic"],
    health:
      "Vata-dominant: watch digestion, sleep, dryness and anxiety. Warm, oily, regular meals and steady routine settle this nadi.",
    compatibility:
      "Traditionally matches best with Madhya or Antya partners; two Adi nadis form Nadi Dosha in Ashtakoot matching.",
    remedies: [
      "Chant the Maha Mrityunjaya Mantra 108 times on Mondays.",
      "Keep a regular sleep and meal routine; avoid excessive cold and dry food.",
      "Serve elders and offer mustard oil on Saturdays to steady vata.",
    ],
  },
  Madhya: {
    name: "Madhya Nadi",
    prakriti: "Pitta (Fire)",
    description:
      "Madhya is the middle nadi — the pitta constitution. It governs digestion, bile and transformation, giving sharp judgement, leadership and a warm, decisive temperament.",
    traits: ["Decisive", "Leader", "Focused", "Short-tempered", "Ambitious", "Clear-headed"],
    health:
      "Pitta-dominant: watch acidity, inflammation, liver and anger. Cooling food, less spice and calm surroundings help.",
    compatibility:
      "Traditionally matches best with Adi or Antya partners; two Madhya nadis form Nadi Dosha in Ashtakoot matching.",
    remedies: [
      "Offer water to the Sun every morning and respect authority figures.",
      "Donate yellow items (turmeric, chana, clothes) on Thursdays.",
      "Practise cooling practices — walking, moonlight, and avoiding hot tempers.",
    ],
  },
  Antya: {
    name: "Antya Nadi",
    prakriti: "Kapha (Earth)",
    description:
      "Antya is the last nadi — the kapha constitution. It governs structure, fluids and stability, giving patience, loyalty, strong memory and a steady, practical nature.",
    traits: ["Stable", "Loyal", "Patient", "Traditional", "Good memory", "Possessive"],
    health:
      "Kapha-dominant: watch weight, congestion, sugar and lethargy. Light, warm food and regular exercise keep it moving.",
    compatibility:
      "Traditionally matches best with Adi or Madhya partners; two Antya nadis form Nadi Dosha in Ashtakoot matching.",
    remedies: [
      "Feed stray dogs and serve the needy on Saturdays.",
      "Donate black sesame and mustard on Saturdays for Saturn's steadiness.",
      "Keep the home clean and clutter-free; avoid excessive sleep in the day.",
    ],
  },
};

const NADI_ORDER = ["Adi", "Madhya", "Antya"];

const nadiOfIndex = (nakshatraIndex) =>
  NAKSHATRA_NADI[((nakshatraIndex % 27) + 27) % 27] || "Adi";

const formatDegrees = (value) => {
  const deg = Math.floor(value);
  const minutes = Math.round((value - deg) * 60);
  if (minutes === 60) return `${deg + 1}° 00'`;
  return `${deg}° ${String(minutes).padStart(2, "0")}'`;
};

/**
 * Nakshatra Nadi report.
 *
 * @param {object} params
 * @param {{name: string, index: number, pada: number}} params.moonNakshatra
 * @param {string} params.moonRashi
 * @param {string} [params.ascRashi]
 * @returns {object} payload for categories.nakshatra_nadi
 */
const getNakshatraNadiReport = ({ moonNakshatra, moonRashi, ascRashi } = {}) => {
  const index = Number.isFinite(moonNakshatra?.index) ? moonNakshatra.index : 0;
  const nakshatra = moonNakshatra?.name || NAKSHATRAS[index] || NAKSHATRAS[0];
  const pada = moonNakshatra?.pada || 1;
  const nativeNadi = nadiOfIndex(index);

  const nadis = NADI_ORDER.map((key) => {
    const info = NADI_INFO[key];
    const nakshatras = NAKSHATRAS.filter((_, i) => nadiOfIndex(i) === key);
    return {
      nadi: info.name,
      prakriti: info.prakriti,
      description: info.description,
      traits: info.traits,
      health: info.health,
      compatibility: info.compatibility,
      remedies: info.remedies,
      nakshatraCount: nakshatras.length,
      nakshatras,
    };
  });

  const nakshatraTable = NAKSHATRAS.map((name, i) => ({
    nakshatra: name,
    nadi: nadiOfIndex(i),
    nakshatraLord: NAKSHATRA_LORDS[i] || DASHA_ORDER[i % 9],
    startingRashi: RASHIS[Math.floor(((i * 360) / 27) / 30) % 12],
    isMoonNakshatra: i === index,
  }));

  const info = NADI_INFO[nativeNadi];

  return {
    title: "Nakshatra Nadi",
    method:
      "Nakshatra Nadi assigns each of the 27 nakshatras to one of three nadis — Adi, Madhya and Antya — in a repeating rotation from Ashwini. The Moon's nakshatra decides the native's nadi.",
    moon: {
      nakshatra,
      pada,
      rashi: moonRashi || "",
      lagna: ascRashi || "",
      nadi: nativeNadi,
      nadiFull: info.name,
      prakriti: info.prakriti,
    },
    native: {
      nadi: info.name,
      prakriti: info.prakriti,
      description: info.description,
      traits: info.traits,
      health: info.health,
      compatibility: info.compatibility,
      remedies: info.remedies,
    },
    nadis,
    nakshatraTable,
    notes: [
      "Same nadi for both partners is called Nadi Dosha in Ashtakoot matching (8 points); it is traditionally checked for cancellation before being treated as disqualifying.",
      "No nadi is better than another — each is a prakriti (body constitution) with its own strengths and care routine.",
      "Avakhada Chakra and Guna Milan use this same 27-nakshatra rotation.",
    ],
  };
};

/**
 * Chandra Kala Nadi report — the rashi / nadi-amsha reading.
 *
 * @param {object} params
 * @param {number} params.moonLon - Moon sidereal longitude (0-360)
 * @param {string} [params.moonRashi]
 * @param {{name: string, index: number, pada: number}} [params.moonNakshatra]
 * @param {string} [params.ascRashi]
 * @returns {object} payload for categories.chandra_kala_nadi
 */
const getChandraKalaNadiReport = ({ moonLon, moonRashi, moonNakshatra, ascRashi } = {}) => {
  const lon = ((Number(moonLon) || 0) % 360 + 360) % 360;
  const degreeInSign = lon % 30;
  const rashi = moonRashi || RASHIS[Math.floor(lon / 30) % 12];

  // 150 nadi amshas per rashi (0.2° each) — the Chandra Kala Nadi / Deva
  // Keralam division. Each amsha splits into Poorva / Uttara bhaga (0.1°).
  const AMSHAS_PER_RASHI = 150;
  const amshaSpan = 30 / AMSHAS_PER_RASHI; // 0.2°
  const amshaIndex = Math.min(AMSHAS_PER_RASHI, Math.floor(degreeInSign / amshaSpan) + 1);
  const amshaStart = (amshaIndex - 1) * amshaSpan;
  const bhagaOffset = degreeInSign - amshaStart;
  const bhaga = bhagaOffset < amshaSpan / 2 ? "Poorvabhaga" : "Uttarabhaga";

  // Three nadi bands of 50 amshas (10°) inside every rashi.
  const bandIndex = Math.min(2, Math.floor((amshaIndex - 1) / 50));
  const nadi = NADI_ORDER[bandIndex];
  const info = NADI_INFO[nadi];

  const bands = NADI_ORDER.map((key, i) => {
    const start = i * 50 + 1;
    const end = (i + 1) * 50;
    return {
      nadi: NADI_INFO[key].name,
      amshas: `${start}-${end}`,
      degrees: `${(i * 10).toFixed(1)}° - ${((i + 1) * 10).toFixed(1)}°`,
      theme:
        key === "Adi"
          ? "Beginning, initiative and vata movement"
          : key === "Madhya"
          ? "Middle, transformation and pitta fire"
          : "Completion, settlement and kapha stability",
      isActive: key === nadi,
    };
  });

  const nakshatra = moonNakshatra?.name || "";
  const pada = moonNakshatra?.pada || 1;

  return {
    title: "Chandra Kala Nadi",
    method:
      "Chandra Kala Nadi (Deva Keralam) reads the Moon's rashi as the field: each 30° rashi is divided into 150 nadi amshas of 0.2°, each split into Poorvabhaga and Uttarbhaga. The amsha the Moon occupies decides the nadi of the reading.",
    moon: {
      rashi,
      rashiLord: RASHI_LORDS[rashi] || "",
      nakshatra,
      pada,
      lagna: ascRashi || "",
      degreeInSign: formatDegrees(degreeInSign),
      longitude: lon.toFixed(4),
    },
    nadiAmsha: {
      index: amshaIndex,
      total: AMSHAS_PER_RASHI,
      name: `Nadi Amsha ${amshaIndex} of ${AMSHAS_PER_RASHI}`,
      degreeRange: `${formatDegrees(amshaStart)} - ${formatDegrees(amshaStart + amshaSpan)} within ${rashi}`,
      bhaga,
      nadi: info.name,
      prakriti: info.prakriti,
    },
    bands,
    nadis: NADI_ORDER.map((key) => ({
      nadi: NADI_INFO[key].name,
      prakriti: NADI_INFO[key].prakriti,
      description: NADI_INFO[key].description,
      traits: NADI_INFO[key].traits,
      remedies: NADI_INFO[key].remedies,
    })),
    interpretation: {
      mind:
        nadi === "Adi"
          ? `Moon in the Adi band of ${rashi} gives a quick, imaginative mind that moves between ideas; it settles with routine rather than force.`
          : nadi === "Madhya"
          ? `Moon in the Madhya band of ${rashi} gives a sharp, decisive mind driven by purpose; it settles when passion is given a clear target.`
          : `Moon in the Antya band of ${rashi} gives a steady, patient mind with strong memory; it settles through continuity and tradition.`,
      relationships:
        nadi === "Adi"
          ? "Attraction begins through ideas and conversation; partners value freedom and freshness."
          : nadi === "Madhya"
          ? "Attraction begins through ambition and respect; partners value honesty and drive."
          : "Attraction begins through care and loyalty; partners value stability and family.",
      health: info.health,
      career:
        nadi === "Adi"
          ? "Suits creative, technical and start-up work where ideas change quickly."
          : nadi === "Madhya"
          ? "Suits leadership, medicine, law and competitive fields that reward decisiveness."
          : "Suits administration, finance, teaching and long-term institution building.",
      remedy: info.remedies.join(" "),
    },
    notes: [
      `The Moon sits at ${formatDegrees(degreeInSign)} of ${rashi}, in nadi amsha ${amshaIndex} (${bhaga}).`,
      "Nadi amsha divisions follow the 150-amsha rashi table of the Chandra Kala Nadi (Deva Keralam) tradition.",
      "Read this alongside Nakshatra Nadi — the nakshatra nadi governs compatibility, the chandra kala amsha governs the running period.",
    ],
  };
};

module.exports = {
  NAKSHATRA_NADI,
  NADI_INFO,
  NADI_ORDER,
  nadiOfIndex,
  getNakshatraNadiReport,
  getChandraKalaNadiReport,
};
