// Deterministic logo design engine — no network, no LLM, no I/O.
//
// The app asks the user for their full name, company name, date of birth,
// birth time and location. Those inputs are turned into the Chaldean numbers
// the app already trusts (Mulank, Bhagyank, name number) plus a birth-time
// "muhurat" number. Each number maps to a planet, a motif and a colour family,
// which together produce three ready-to-render logo variants.
//
// The output is a *design spec*: the Flutter client draws the logo from it, so
// the same spec can later drive an SVG/PNG exporter without changing the API.
// Text (concept, tagline, personality) is generated here as a safe fallback and
// can be upgraded by the AI enrichment service when a model is configured.

const {
  parseDateInput,
  calculateMulank,
  calculateBhagyank,
  calculateNameNumber,
  normalizeFullName,
} = require("../numerology/numerologyService");

// Chaldean / Vedic planet themes. Colours are chosen to stay readable as a
// small app icon (dark ink, one strong colour, one soft support colour).
const NUMBER_THEMES = {
  1: {
    ruler: "Sun",
    motif: "sun",
    font: "sans",
    primary: "#E8850C",
    secondary: "#F6C453",
    accent: "#7C2D12",
    ink: "#3B1E07",
    values: ["leadership", "clarity", "confidence"],
  },
  2: {
    ruler: "Moon",
    motif: "moon",
    font: "serif",
    primary: "#4C6C8F",
    secondary: "#9CC0DC",
    accent: "#0EA5E9",
    ink: "#14283B",
    values: ["calm", "intuition", "partnership"],
  },
  3: {
    ruler: "Jupiter",
    motif: "star",
    font: "serif",
    primary: "#C9860B",
    secondary: "#F2C14E",
    accent: "#7C3AED",
    ink: "#2B1B04",
    values: ["wisdom", "growth", "optimism"],
  },
  4: {
    ruler: "Rahu",
    motif: "hex",
    font: "sans",
    primary: "#4F46E5",
    secondary: "#A5B4FC",
    accent: "#0F172A",
    ink: "#111033",
    values: ["structure", "innovation", "focus"],
  },
  5: {
    ruler: "Mercury",
    motif: "arrow",
    font: "sans",
    primary: "#0E9F6E",
    secondary: "#6EE7B7",
    accent: "#065F46",
    ink: "#052E22",
    values: ["speed", "communication", "adaptability"],
  },
  6: {
    ruler: "Venus",
    motif: "blossom",
    font: "serif",
    primary: "#D6417F",
    secondary: "#F9A8D4",
    accent: "#9D174D",
    ink: "#3B0A22",
    values: ["beauty", "care", "harmony"],
  },
  7: {
    ruler: "Ketu",
    motif: "spiral",
    font: "serif",
    primary: "#0E7490",
    secondary: "#67E8F9",
    accent: "#6D28D9",
    ink: "#083344",
    values: ["depth", "research", "mystery"],
  },
  8: {
    ruler: "Saturn",
    motif: "ring",
    font: "sans",
    primary: "#334155",
    secondary: "#94A3B8",
    accent: "#0F172A",
    ink: "#0B1220",
    values: ["discipline", "trust", "endurance"],
  },
  9: {
    ruler: "Mars",
    motif: "flame",
    font: "sans",
    primary: "#DC2626",
    secondary: "#FB923C",
    accent: "#7F1D1D",
    ink: "#3B0A0A",
    values: ["courage", "energy", "drive"],
  },
  11: {
    ruler: "Master 11",
    motif: "lotus",
    font: "serif",
    primary: "#6D28D9",
    secondary: "#C4B5FD",
    accent: "#DB2777",
    ink: "#2A0A4A",
    values: ["inspiration", "vision", "intuition"],
  },
  22: {
    ruler: "Master 22",
    motif: "lotus",
    font: "sans",
    primary: "#1D4ED8",
    secondary: "#93C5FD",
    accent: "#0F766E",
    ink: "#0B1B3B",
    values: ["mastery", "scale", "legacy"],
  },
};

const DEFAULT_THEME = NUMBER_THEMES[5];

const titleCase = (value) =>
  String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

const themeFor = (value) => {
  if (value == null) return DEFAULT_THEME;
  return NUMBER_THEMES[value] || NUMBER_THEMES[String(value).slice(0, 1)] || DEFAULT_THEME;
};

const digitsOf = (value) =>
  [...String(value || "")].reduce(
    (total, char) => (char >= "0" && char <= "9" ? total + Number(char) : total),
    0,
  );

const reduceToDigit = (value) => {
  let current = Math.abs(Number(value) || 0);
  while (current > 9) current = digitsOf(current);
  return current;
};

// "HH:MM" -> 1..9. The birth hour is used as a "muhurat" accent, never as a
// replacement for the date-based numbers.
const muhuratNumber = (birthTime) => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(birthTime || "").trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  const value = reduceToDigit(digitsOf(hour) + digitsOf(minute));
  return value === 0 ? 9 : value;
};

// Two initials for the badge. Multi-word companies use the first letters of the
// first two words; a single word uses its first two letters.
const buildMonogram = (companyName, fullName) => {
  const cleanCompany = String(companyName || "").trim();
  const words = cleanCompany.split(/[\s\-_.&]+/).filter(Boolean);
  let letters = "";

  if (words.length >= 2) {
    letters = `${words[0][0]}${words[1][0]}`;
  } else if (words.length === 1) {
    const word = words[0].replace(/[^A-Za-z0-9]/g, "");
    letters = word.slice(0, 2);
  }

  if (!letters) {
    const nameWords = String(fullName || "").trim().split(/\s+/).filter(Boolean);
    letters =
      nameWords.length >= 2
        ? `${nameWords[0][0]}${nameWords[nameWords.length - 1][0]}`
        : String(fullName || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 2);
  }

  const monogram = letters.toUpperCase();
  return monogram || "AB";
};

const paletteFor = (theme, muhuratTheme) => ({
  primary: theme.primary,
  secondary: theme.secondary,
  accent: muhuratTheme ? muhuratTheme.accent : theme.accent,
  ink: theme.ink,
  surface: "#FFFFFF",
});

const buildVariants = ({
  theme,
  muhuratTheme,
  monogram,
  companyName,
  companyType,
  tagline,
}) => {
  const base = paletteFor(theme, muhuratTheme);
  const support = muhuratTheme || theme;

  return [
    {
      id: "monogram",
      name: "Modern monogram",
      style: "monogram",
      motif: theme.motif,
      font: theme.font,
      colors: { ...base },
      monogram,
      companyName,
      companyType,
      tagline,
      note: `${theme.ruler} colour family, built to stay sharp as an app icon.`,
    },
    {
      id: "emblem",
      name: "Classic emblem",
      style: "emblem",
      motif: support.motif,
      font: theme.font,
      colors: {
        ...base,
        primary: theme.secondary,
        secondary: theme.primary,
        accent: support.primary,
      },
      monogram,
      companyName,
      companyType,
      tagline,
      note: `An emblem sealed with ${support.ruler} geometry — ideal for packaging and signage.`,
    },
    {
      id: "wordmark",
      name: "Clean wordmark",
      style: "wordmark",
      motif: theme.motif,
      font: theme.font,
      colors: {
        ...base,
        primary: theme.ink,
        secondary: theme.primary,
        accent: support.accent,
        ink: theme.ink,
      },
      monogram,
      companyName,
      companyType,
      tagline,
      note: "A quiet wordmark that lets the company name lead and the symbol support it.",
    },
  ];
};

const fallbackTagline = (theme, supportTheme) =>
  `${titleCase(theme.values[0])} · ${titleCase(supportTheme.values[1] || supportTheme.values[0])}`;

const fallbackConcept = ({
  companyName,
  companyType,
  fullName,
  location,
  theme,
  supportTheme,
  numbers,
}) => {
  const owner = fullName ? `${fullName}'s` : "your";
  const place = location ? ` Rooted in ${location}, the mark stays warm rather than corporate.` : "";
  return (
    `${companyName} is drawn for the ${companyType} category as a ${theme.motif}-led mark in the ${theme.ruler.toLowerCase()} colour family, ` +
    `using ${owner} Mulank ${numbers.mulank.value ?? "—"} and name number ${numbers.nameNumber.value ?? "—"}. ` +
    `The ${supportTheme.ruler.toLowerCase()} accent keeps the identity distinctive without losing legibility.${place}`
  );
};

const fallbackWhyItFits = ({ theme, supportTheme, numbers, monogram, birthTime }) => {
  const points = [
    `Mulank ${numbers.mulank.value ?? "—"} (${theme.ruler}) sets the ${theme.values[0]} tone of the palette.`,
    `Name number ${numbers.nameNumber.value ?? "—"} supports ${theme.values[1]} and ${theme.values[2]}.`,
    `Bhagyank ${numbers.bhagyank.value ?? "—"} balances the mark with ${supportTheme.values[0]} energy.`,
    `The "${monogram}" monogram keeps the logo readable when it is only 48 px wide.`,
  ];
  if (birthTime) {
    points.push(
      `Your ${birthTime} birth time adds a ${supportTheme.ruler} accent (muhurat ${numbers.muhurat.value}).`,
    );
  }
  return points;
};

// GET/POST body -> validated input. Returns { value } or { error }.
const normalizeLogoInput = (body) => {
  const raw = body && typeof body === "object" ? body : {};

  const fullName = normalizeFullName(raw.fullName);
  if (fullName.length < 2 || fullName.length > 100) {
    return { error: "fullName is required (2-100 characters)" };
  }

  const companyName = normalizeFullName(raw.companyName);
  if (companyName.length < 1 || companyName.length > 80) {
    return { error: "companyName is required (1-80 characters)" };
  }

  const companyType = normalizeFullName(raw.companyType);
  if (companyType.length < 2 || companyType.length > 120) {
    return { error: "companyType is required (2-120 characters)" };
  }

  const dateOfBirth = parseDateInput(raw.dateOfBirth);
  if (!dateOfBirth) {
    return { error: "dateOfBirth must be a valid past date (YYYY-MM-DD or DD/MM/YYYY)" };
  }
  if (dateOfBirth.getUTCFullYear() < 1900) {
    return { error: "dateOfBirth must be after 1900" };
  }

  const birthTimeRaw = String(raw.birthTime || "").trim();
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(birthTimeRaw);
  if (
    !timeMatch ||
    Number(timeMatch[1]) > 23 ||
    Number(timeMatch[2]) > 59
  ) {
    return { error: "birthTime is required in 24-hour HH:MM format" };
  }
  const birthTime = `${String(Number(timeMatch[1])).padStart(2, "0")}:${timeMatch[2]}`;

  const location = normalizeFullName(raw.location);
  if (location.length < 2 || location.length > 100) {
    return { error: "location is required (2-100 characters)" };
  }

  return {
    value: {
      fullName,
      companyName,
      companyType,
      dateOfBirth,
      birthTime,
      location,
    },
  };
};

// Build the complete design spec synchronously.
const buildLogoDesign = (input) => {
  const dob = parseDateInput(input.dateOfBirth);
  const mulank = calculateMulank(dob);
  const bhagyank = calculateBhagyank(dob);
  // Company names in non-Latin scripts have no Chaldean value; fall back to the
  // owner's name, then to a neutral Mercury theme.
  const nameNumber =
    calculateNameNumber(input.companyName) ||
    calculateNameNumber(input.fullName) ||
    calculateNameNumber("Brand");

  const mulankTheme = themeFor(mulank ? mulank.value : null);
  const bhagyankTheme = themeFor(bhagyank ? bhagyank.value : null);
  const muhurat = muhuratNumber(input.birthTime);
  const muhuratTheme = themeFor(muhurat);
  const monogram = buildMonogram(input.companyName, input.fullName);
  const companyType = input.companyType;

  const numbers = {
    mulank: {
      value: mulank ? mulank.value : null,
      reduced: mulank ? mulank.reduced : null,
      isMaster: mulank ? mulank.isMaster : false,
      ruler: mulankTheme.ruler,
      meaning: mulankTheme.values,
    },
    bhagyank: {
      value: bhagyank ? bhagyank.value : null,
      reduced: bhagyank ? bhagyank.reduced : null,
      isMaster: bhagyank ? bhagyank.isMaster : false,
      ruler: bhagyankTheme.ruler,
      meaning: bhagyankTheme.values,
    },
    nameNumber: {
      value: nameNumber ? nameNumber.value : null,
      reduced: nameNumber ? nameNumber.reduced : null,
      isMaster: nameNumber ? nameNumber.isMaster : false,
      ruler: themeFor(nameNumber ? nameNumber.value : null).ruler,
      meaning: themeFor(nameNumber ? nameNumber.value : null).values,
    },
    muhurat: {
      value: muhurat,
      ruler: muhuratTheme.ruler,
      meaning: muhuratTheme.values,
    },
  };

  // The Mulank (who they are) leads; Bhagyank softens it; the birth-time
  // muhurat theme supplies the accent colour.
  const theme = mulankTheme;
  const supportTheme = muhuratTheme || bhagyankTheme;
  const tagline = fallbackTagline(theme, supportTheme);

  const design = {
    companyName: input.companyName,
    companyType,
    fullName: input.fullName,
    location: input.location,
    birthTime: input.birthTime,
    dateOfBirth: new Date(dob).toISOString().slice(0, 10),
    monogram,
    numbers,
    tagline,
    concept: fallbackConcept({
      companyName: input.companyName,
      companyType,
      fullName: input.fullName,
      location: input.location,
      theme,
      supportTheme,
      numbers,
    }),
    personality: [...new Set([...theme.values, ...supportTheme.values])].slice(0, 3).map(titleCase),
    whyItFits: fallbackWhyItFits({
      theme,
      supportTheme,
      numbers,
      monogram,
      birthTime: input.birthTime,
    }),
    variants: buildVariants({
      theme,
      muhuratTheme: supportTheme,
      monogram,
      companyName: input.companyName,
      companyType,
      tagline,
    }),
    disclaimer:
      "Logo direction blends traditional numerology with design guidance. It is creative input, not a guarantee of business results.",
  };

  return design;
};

module.exports = {
  NUMBER_THEMES,
  buildLogoDesign,
  buildMonogram,
  muhuratNumber,
  normalizeLogoInput,
  themeFor,
};
