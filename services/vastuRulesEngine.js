// Configurable, rule-based Vastu analysis.
//
// This module is deliberately dependency-free and pure: it takes a Vastu
// request's structured inputs plus the admin-managed rule documents and
// returns a deterministic draft report. No database access, no network, no
// AI. That keeps the analysis explainable and lets the same code run in the
// API, in the admin preview, and in tests.
//
// IMPORTANT: Vastu is a traditional belief-based system. Everything this
// engine emits is framed as traditional guidance, never as a scientific or
// safety finding. Rules are stored in MongoDB and can be edited or disabled
// by an admin, so the engine itself contains no hard-coded verdicts.

const { calculateVedicChart } = require("./vedicAstrologyService");

const DIRECTIONS = [
  "north",
  "north-east",
  "east",
  "south-east",
  "south",
  "south-west",
  "west",
  "north-west",
  "centre",
];

const PROPERTY_TYPES = [
  "house",
  "apartment",
  "flat",
  "land",
  "shop",
  "office",
  "commercial_building",
];

const CONCERN_LEVELS = ["low", "moderate", "high"];

const RULE_CATEGORIES = [
  "house_facing",
  "entrance",
  "zone",
  "kitchen",
  "bedroom",
  "bathroom",
  "prayer_room",
  "staircase",
  "water_tank",
  "five_elements",
  "plot",
  "surroundings",
  "horoscope",
  "general",
];

const ZONE_KEYS = [
  "house_facing",
  "entrance",
  "kitchen",
  "master_bedroom",
  "bedroom",
  "bathroom",
  "toilet",
  "prayer_room",
  "staircase",
  "water_tank",
  "overhead_tank",
  "septic_tank",
  "plot",
  "surroundings",
  "element_balance",
  "horoscope",
  "other",
];

const PLOT_SHAPES = [
  "regular",
  "square",
  "rectangular",
  "irregular",
  "triangular",
  "circular",
  "extended",
  "other",
];

const ROAD_TYPES = ["none", "straight", "t_junction", "dead_end", "corner", "multiple"];

const AREA_UNITS = ["sqft", "sqm", "sqyd", "acre", "bigha", "marla", "kanal", "other"];

const ZODIAC_SIGNS = [
  "Aries",
  "Taurus",
  "Gemini",
  "Cancer",
  "Leo",
  "Virgo",
  "Libra",
  "Scorpio",
  "Sagittarius",
  "Capricorn",
  "Aquarius",
  "Pisces",
];

const REQUEST_STATUSES = [
  "submitted",
  "pending_review",
  "under_review",
  "analysis_in_progress",
  "report_ready",
  "completed",
  "more_information_required",
  "cancelled",
];

const STATUS_TRANSITIONS = {
  submitted: ["pending_review", "cancelled"],
  pending_review: ["under_review", "more_information_required", "cancelled"],
  under_review: ["analysis_in_progress", "more_information_required", "pending_review", "cancelled"],
  analysis_in_progress: ["report_ready", "more_information_required", "under_review"],
  report_ready: ["completed", "analysis_in_progress", "more_information_required"],
  more_information_required: ["pending_review", "under_review", "cancelled"],
  completed: ["report_ready"],
  cancelled: [],
};

const canTransition = (from, to) => {
  if (!from || !to) return false;
  const allowed = STATUS_TRANSITIONS[from];
  return Array.isArray(allowed) && allowed.includes(to);
};

const DISCLAIMER =
  "Vastu and astrology are traditional belief-based systems, not scientifically established findings. This report is guidance and interpretation, not a structural, legal, medical, financial or safety assessment. Remedies are optional traditional suggestions; consult qualified professionals before any structural change.";

const DEFAULT_TEMPLATE_SECTIONS = [
  { key: "property_overview", title: "Property overview", enabled: true, order: 10 },
  { key: "directional_assessment", title: "Directional assessment", enabled: true, order: 20 },
  { key: "zone_analysis", title: "Zone-wise analysis", enabled: true, order: 30 },
  { key: "five_elements", title: "Five-element balance", enabled: true, order: 40 },
  { key: "concerns", title: "Traditional Vastu concerns", enabled: true, order: 50 },
  { key: "remedies", title: "Suggested corrections and remedies", enabled: true, order: 60 },
  { key: "missing_information", title: "Missing or unverified information", enabled: true, order: 70 },
  { key: "location_context", title: "Location and map context", enabled: true, order: 80 },
  { key: "horoscope", title: "Optional horoscope-based interpretation", enabled: true, order: 90 },
  { key: "recommendations", title: "Astrologer recommendations", enabled: true, order: 100 },
  { key: "conclusion", title: "Final conclusion", enabled: true, order: 110 },
];

const CONCERN_LABELS = {
  low: "Low Concern",
  moderate: "Moderate Concern",
  high: "High Concern",
};

const ELEMENT_DIRECTIONS = {
  water: ["north", "north-east"],
  fire: ["south-east", "south"],
  earth: ["south-west"],
  air: ["east", "west", "north-west"],
  space: ["centre"],
};

const DIRECTION_ELEMENTS = Object.entries(ELEMENT_DIRECTIONS).reduce(
  (acc, [element, directions]) => {
    for (const direction of directions) acc[direction] = element;
    return acc;
  },
  {},
);

const ELEMENT_LABELS = {
  water: "Water",
  fire: "Fire",
  earth: "Earth",
  air: "Air",
  space: "Space",
};

const DIRECTION_LABELS = {
  north: "North",
  "north-east": "North-east",
  east: "East",
  "south-east": "South-east",
  south: "South",
  "south-west": "South-west",
  west: "West",
  "north-west": "North-west",
  centre: "Centre",
};

const CONCERN_ORDER = { high: 0, moderate: 1, low: 2 };

// ---------------------------------------------------------------------------
// Field registry
// ---------------------------------------------------------------------------

const FIELD_REGISTRY = {
  propertyType: {
    label: "Property type",
    type: "enum",
    options: PROPERTY_TYPES,
  },
  houseFacing: { label: "House-facing direction", type: "direction" },
  entranceDirection: { label: "Main entrance direction", type: "direction" },
  entrancePosition: { label: "Main entrance position", type: "direction" },
  totalFloors: { label: "Number of floors", type: "number", min: 0, max: 200 },
  bedrooms: { label: "Number of bedrooms", type: "number", min: 0, max: 100 },
  bathrooms: { label: "Number of bathrooms", type: "number", min: 0, max: 100 },
  kitchenDirection: { label: "Kitchen direction", type: "direction" },
  masterBedroomDirection: { label: "Master bedroom direction", type: "direction" },
  bedroomDirections: { label: "Bedroom directions", type: "direction_array" },
  bathroomDirection: { label: "Bathroom direction", type: "direction" },
  toiletDirection: { label: "Toilet direction", type: "direction" },
  prayerRoomDirection: { label: "Prayer room direction", type: "direction" },
  staircaseDirection: { label: "Staircase direction", type: "direction" },
  waterTankDirection: { label: "Underground water tank direction", type: "direction" },
  overheadTankDirection: { label: "Overhead water tank direction", type: "direction" },
  septicTankDirection: { label: "Septic tank direction", type: "direction" },
  plotShape: { label: "Plot shape", type: "enum", options: PLOT_SHAPES },
  plotFacing: { label: "Plot-facing direction", type: "direction" },
  plotArea: { label: "Plot / property area", type: "number", min: 0, max: 100000000 },
  areaUnit: { label: "Area unit", type: "enum", options: AREA_UNITS },
  roadSide: { label: "Road side", type: "direction" },
  roadType: { label: "Road / junction type", type: "enum", options: ROAD_TYPES },
  intersectionPosition: { label: "Intersection position", type: "direction" },
  surroundingContext: { label: "Surrounding context", type: "text", maxLength: 2000 },
  moonSign: { label: "Moon sign", type: "zodiac" },
  ascendantSign: { label: "Ascendant sign", type: "zodiac" },
  moonNakshatra: { label: "Moon nakshatra", type: "text", maxLength: 80 },
  "_derived.missingElementCount": {
    label: "Five-element coverage",
    type: "number",
    derived: true,
  },
  "_derived.centreOccupied": {
    label: "Centre occupancy",
    type: "boolean",
    derived: true,
  },
  "_derived.hasBirthDetails": {
    label: "Birth details",
    type: "boolean",
    derived: true,
  },
};

const CONDITION_OPS = [
  "eq",
  "neq",
  "eq_field",
  "neq_field",
  "in",
  "not_in",
  "includes",
  "exists",
  "empty",
  "gt",
  "gte",
  "lt",
  "lte",
  "between",
  "matches",
];

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const asText = (value, maxLength = 2000) => {
  if (value == null) return "";
  if (typeof value === "object") return "";
  return String(value).trim().slice(0, maxLength);
};

const collapse = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const DIRECTION_ALIASES = {
  n: "north",
  north: "north",
  uttar: "north",
  uttara: "north",
  ne: "north-east",
  northeast: "north-east",
  northheast: "north-east",
  ishan: "north-east",
  ishaan: "north-east",
  ishanya: "north-east",
  e: "east",
  east: "east",
  purva: "east",
  poorva: "east",
  se: "south-east",
  southeast: "south-east",
  agneya: "south-east",
  agnai: "south-east",
  s: "south",
  south: "south",
  dakshin: "south",
  dakshina: "south",
  sw: "south-west",
  southwest: "south-west",
  nairutya: "south-west",
  nairitya: "south-west",
  w: "west",
  west: "west",
  paschim: "west",
  paschima: "west",
  nw: "north-west",
  northwest: "north-west",
  vayavya: "north-west",
  vayu: "north-west",
  c: "centre",
  center: "centre",
  centre: "centre",
  central: "centre",
  middle: "centre",
  brahmasthan: "centre",
  brahmsthan: "centre",
};

const normalizeDirection = (value) => {
  if (value == null) return "";
  const key = collapse(value);
  if (!key) return "";
  return DIRECTION_ALIASES[key] || "";
};

const normalizePropertyType = (value) => {
  const key = collapse(value);
  const aliases = {
    house: "house",
    home: "house",
    villa: "house",
    bungalow: "house",
    independenthouse: "house",
    independentbungalow: "house",
    apartment: "apartment",
    apartmentbuilding: "apartment",
    flat: "flat",
    land: "land",
    plot: "land",
    openplot: "land",
    shop: "shop",
    store: "shop",
    office: "office",
    commercial: "commercial_building",
    commercialbuilding: "commercial_building",
    commercialspace: "commercial_building",
  };
  return aliases[key] || "";
};

const normalizePlotShape = (value) => {
  const key = collapse(value);
  if (!key) return "";
  if (key.includes("triangle") || key.includes("triangular")) return "triangular";
  if (key.includes("square")) return "square";
  if (key.includes("rectang")) return "rectangular";
  if (key.includes("circle") || key.includes("round")) return "circular";
  if (key.includes("irregular") || key.includes("odd")) return "irregular";
  if (key.includes("extend")) return "extended";
  if (key === "regular") return "regular";
  if (key === "other") return "other";
  return "";
};

const normalizeRoadType = (value) => {
  const key = collapse(value);
  if (!key) return "";
  if (key.includes("tjunction") || key === "tj") return "t_junction";
  if (key.includes("deadend") || key.includes("culdesac")) return "dead_end";
  if (key.includes("corner")) return "corner";
  if (key.includes("straight") || key.includes("normal")) return "straight";
  if (key.includes("none") || key.includes("noroad")) return "none";
  if (key.includes("multiple")) return "multiple";
  return "";
};

const normalizeAreaUnit = (value) => {
  const key = collapse(value);
  if (!key) return "";
  const aliases = {
    sqft: "sqft",
    squarefeet: "sqft",
    sqfeet: "sqft",
    sqm: "sqm",
    squaremeter: "sqm",
    squaremetre: "sqm",
    sqmt: "sqm",
    sqyd: "sqyd",
    squareyard: "sqyd",
    sqyard: "sqyd",
    acre: "acre",
    bigha: "bigha",
    marla: "marla",
    kanal: "kanal",
    other: "other",
  };
  return aliases[key] || "";
};

const normalizeZodiac = (value) => {
  if (value == null) return "";
  const key = collapse(value);
  if (!key) return "";
  const aliases = {
    mesh: "Aries",
    vrishabha: "Taurus",
    mithun: "Gemini",
    kark: "Cancer",
    simha: "Leo",
    kanya: "Virgo",
    tula: "Libra",
    vrishchik: "Scorpio",
    dhanu: "Sagittarius",
    makar: "Capricorn",
    kumbh: "Aquarius",
    meen: "Pisces",
  };
  if (aliases[key]) return aliases[key].toLowerCase();
  return ZODIAC_SIGNS.find((sign) => collapse(sign) === key)?.toLowerCase() || "";
};

const normalizeConcern = (value) => {
  const key = collapse(value);
  if (["high", "severe", "major", "critical"].includes(key)) return "high";
  if (["low", "minor", "small", "mild", "slight"].includes(key)) return "low";
  return "moderate";
};

const toNumber = (value, min, max) => {
  if (value === "" || value == null) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  if (min != null && number < min) return null;
  if (max != null && number > max) return null;
  return number;
};

const toBoolean = (value) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const key = value.trim().toLowerCase();
    if (["true", "yes", "1"].includes(key)) return true;
    if (["false", "no", "0"].includes(key)) return false;
  }
  return null;
};

const titleCase = (value) =>
  String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const labelForDirection = (direction) =>
  DIRECTION_LABELS[direction] || titleCase(direction);

const labelForField = (field) =>
  FIELD_REGISTRY[field]?.label || titleCase(String(field || "").split(".").pop());

const toPlain = (value) => {
  if (value == null) return value;
  if (typeof value.toObject === "function") return value.toObject();
  return value;
};

// ---------------------------------------------------------------------------
// Input normalisation
// ---------------------------------------------------------------------------

const normalizePropertyInput = (raw = {}) => {
  const source = toPlain(raw) || {};
  const value = {};
  const errors = [];

  for (const [field, spec] of Object.entries(FIELD_REGISTRY)) {
    if (spec.derived) continue;
    const rawValue = source[field];

    if (spec.type === "direction") {
      if (rawValue == null || rawValue === "") continue;
      const direction = normalizeDirection(rawValue);
      if (!direction) {
        errors.push({ field, message: `${spec.label} must be a direction (north, north-east, east, ... or centre).` });
        continue;
      }
      value[field] = direction;
    } else if (spec.type === "direction_array") {
      const list = Array.isArray(rawValue)
        ? rawValue
        : String(rawValue || "")
            .split(/,|\n|\/|;/)
            .map((item) => item.trim())
            .filter(Boolean);
      const directions = [];
      for (const item of list) {
        const direction = normalizeDirection(item);
        if (direction && !directions.includes(direction)) directions.push(direction);
      }
      if (directions.length) value[field] = directions;
    } else if (spec.type === "number") {
      if (rawValue == null || rawValue === "") continue;
      const number = toNumber(rawValue, spec.min, spec.max);
      if (number == null) {
        errors.push({ field, message: `${spec.label} must be a valid number.` });
        continue;
      }
      value[field] = number;
    } else if (spec.type === "boolean") {
      if (rawValue == null || rawValue === "") continue;
      const boolean = toBoolean(rawValue);
      if (boolean == null) {
        errors.push({ field, message: `${spec.label} must be true or false.` });
        continue;
      }
      value[field] = boolean;
    } else if (spec.type === "enum") {
      if (rawValue == null || rawValue === "") continue;
      let normalized = "";
      if (field === "propertyType") normalized = normalizePropertyType(rawValue);
      else if (field === "plotShape") normalized = normalizePlotShape(rawValue);
      else if (field === "roadType") normalized = normalizeRoadType(rawValue);
      else if (field === "areaUnit") normalized = normalizeAreaUnit(rawValue);
      else normalized = String(rawValue).trim().toLowerCase();
      if (!normalized || (spec.options && !spec.options.includes(normalized))) {
        errors.push({ field, message: `${spec.label} is not a recognised value.` });
        continue;
      }
      value[field] = normalized;
    } else if (spec.type === "zodiac") {
      if (rawValue == null || rawValue === "") continue;
      const sign = normalizeZodiac(rawValue);
      if (!sign) {
        errors.push({ field, message: `${spec.label} must be a zodiac sign.` });
        continue;
      }
      value[field] = sign;
    } else {
      const text = asText(rawValue, spec.maxLength || 2000);
      if (text) value[field] = text;
    }
  }

  return { value, errors };
};

const normalizeBirthDetails = (raw = {}) => {
  const source = toPlain(raw) || {};
  const value = {};
  const errors = [];

  const dateOfBirth = asText(source.dateOfBirth, 40);
  if (dateOfBirth) {
    const parsed = new Date(dateOfBirth);
    if (Number.isNaN(parsed.getTime())) {
      errors.push({ field: "dateOfBirth", message: "Date of birth is not a valid date." });
    } else {
      value.dateOfBirth = parsed;
    }
  }

  const timeOfBirth = asText(source.timeOfBirth, 20);
  if (timeOfBirth) value.timeOfBirth = timeOfBirth;
  const placeOfBirth = asText(source.placeOfBirth, 200);
  if (placeOfBirth) value.placeOfBirth = placeOfBirth;

  if (source.latitude != null && source.latitude !== "") {
    const latitude = toNumber(source.latitude, -90, 90);
    if (latitude == null) errors.push({ field: "latitude", message: "Latitude must be between -90 and 90." });
    else value.latitude = latitude;
  }
  if (source.longitude != null && source.longitude !== "") {
    const longitude = toNumber(source.longitude, -180, 180);
    if (longitude == null) errors.push({ field: "longitude", message: "Longitude must be between -180 and 180." });
    else value.longitude = longitude;
  }
  if (source.timeZoneOffsetMinutes != null && source.timeZoneOffsetMinutes !== "") {
    const offset = toNumber(source.timeZoneOffsetMinutes, -840, 840);
    if (offset == null) {
      errors.push({ field: "timeZoneOffsetMinutes", message: "Timezone offset must be between -840 and 840 minutes." });
    } else {
      value.timeZoneOffsetMinutes = offset;
    }
  }
  const moonSign = normalizeZodiac(source.moonSign);
  if (moonSign) value.moonSign = moonSign;
  const ascendantSign = normalizeZodiac(source.ascendantSign);
  if (ascendantSign) value.ascendantSign = ascendantSign;

  return { value, errors };
};

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const collectPlacements = (input) => {
  const placements = [
    { zoneKey: "entrance", label: "Main entrance", direction: input.entranceDirection },
    { zoneKey: "kitchen", label: "Kitchen", direction: input.kitchenDirection },
    { zoneKey: "master_bedroom", label: "Master bedroom", direction: input.masterBedroomDirection },
    { zoneKey: "bathroom", label: "Bathroom", direction: input.bathroomDirection },
    { zoneKey: "toilet", label: "Toilet", direction: input.toiletDirection },
    { zoneKey: "prayer_room", label: "Prayer room", direction: input.prayerRoomDirection },
    { zoneKey: "staircase", label: "Staircase", direction: input.staircaseDirection },
    { zoneKey: "water_tank", label: "Underground water tank", direction: input.waterTankDirection },
    { zoneKey: "overhead_tank", label: "Overhead water tank", direction: input.overheadTankDirection },
    { zoneKey: "septic_tank", label: "Septic tank", direction: input.septicTankDirection },
  ];

  for (const direction of input.bedroomDirections || []) {
    placements.push({ zoneKey: "bedroom", label: "Bedroom", direction });
  }

  return placements.filter((item) => Boolean(item.direction));
};

const buildElementBalance = (input) => {
  const placements = collectPlacements(input);
  const elements = Object.entries(ELEMENT_DIRECTIONS).map(([element, directions]) => {
    const matching = placements.filter((item) => directions.includes(item.direction));
    const directionSet = [...new Set(matching.map((item) => item.direction))];
    const zoneLabels = [...new Set(matching.map((item) => item.label))];
    const count = matching.length;
    return {
      element,
      label: ELEMENT_LABELS[element],
      directions,
      directionLabels: directions.map(labelForDirection),
      reportedDirections: directionSet,
      reportedDirectionLabels: directionSet.map(labelForDirection),
      zones: zoneLabels,
      count,
      status: count === 0 ? "missing" : count === 1 ? "low" : "present",
      note:
        count === 0
          ? `No reported zone falls in the traditional ${ELEMENT_LABELS[element].toLowerCase()} directions.`
          : `${count} reported placement${count === 1 ? "" : "s"} fall in the traditional ${ELEMENT_LABELS[element].toLowerCase()} directions.`,
    };
  });

  return {
    mapping: Object.fromEntries(
      DIRECTIONS.map((direction) => [direction, DIRECTION_ELEMENTS[direction] || null]),
    ),
    elements,
    balanced: elements.every((element) => element.count > 0),
    missingElements: elements.filter((element) => element.count === 0).map((element) => element.element),
    note:
      "This uses one common traditional direction-to-element mapping according to common traditions. Traditions differ, and this is an informational view, not a scientific measurement.",
  };
};

const buildDerived = (input, birthDetails = {}) => {
  const centreFields = [
    "entranceDirection",
    "kitchenDirection",
    "masterBedroomDirection",
    "bathroomDirection",
    "toiletDirection",
    "prayerRoomDirection",
    "staircaseDirection",
    "waterTankDirection",
    "overheadTankDirection",
    "septicTankDirection",
  ];
  const centreOccupied =
    centreFields.some((field) => input[field] === "centre") ||
    (input.bedroomDirections || []).includes("centre");

  const elementBalance = buildElementBalance(input);
  const hasBirthDetails = Boolean(
    birthDetails.dateOfBirth ||
      birthDetails.moonSign ||
      birthDetails.ascendantSign ||
      birthDetails.moonNakshatra,
  );

  return {
    centreOccupied,
    missingElementCount: elementBalance.missingElements.length,
    hasBirthDetails,
  };
};

const buildContext = (input, birthDetails = {}) => ({
  ...toPlain(input),
  moonSign: birthDetails.moonSign || input.moonSign || "",
  ascendantSign: birthDetails.ascendantSign || input.ascendantSign || "",
  moonNakshatra: birthDetails.moonNakshatra || input.moonNakshatra || "",
  _derived: buildDerived(input, birthDetails),
});

const isProvided = (value) => {
  if (value == null) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  return true;
};

const readField = (context, field) => {
  const parts = String(field || "").split(".");
  let cursor = context;
  for (const part of parts) {
    if (cursor == null) return { provided: false, value: undefined };
    cursor = cursor[part];
  }
  return { provided: isProvided(cursor), value: cursor };
};

const sameValue = (left, right) => {
  if (typeof left === "number" || typeof right === "number") {
    const leftNumber = Number(left);
    const rightNumber = Number(right);
    if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber === rightNumber;
  }
  if (typeof left === "boolean" || typeof right === "boolean") {
    return Boolean(left) === Boolean(right);
  }
  return collapse(left) === collapse(right);
};

const compareValues = (op, actual, expected) => {
  switch (op) {
    case "eq":
      return sameValue(actual, expected);
    case "neq":
      return !sameValue(actual, expected);
    case "in":
      return Array.isArray(expected) && expected.some((item) => sameValue(actual, item));
    case "not_in":
      return Array.isArray(expected) && !expected.some((item) => sameValue(actual, item));
    case "includes":
      return Array.isArray(actual) && actual.some((item) => sameValue(item, expected));
    case "gt":
      return Number(actual) > Number(expected);
    case "gte":
      return Number(actual) >= Number(expected);
    case "lt":
      return Number(actual) < Number(expected);
    case "lte":
      return Number(actual) <= Number(expected);
    case "between":
      return (
        Array.isArray(expected) &&
        expected.length === 2 &&
        Number(actual) >= Number(expected[0]) &&
        Number(actual) <= Number(expected[1])
      );
    case "matches":
      try {
        return new RegExp(String(expected), "i").test(String(actual));
      } catch (_) {
        return false;
      }
    default:
      return false;
  }
};

const evaluateLeaf = (condition, context) => {
  if (!condition || typeof condition !== "object") {
    return { status: "unverified", missingFields: [] };
  }
  const field = asText(condition.field, 120);
  const op = asText(condition.op, 40);

  if (!FIELD_REGISTRY[field]) {
    return { status: "unverified", missingFields: [] };
  }

  const actual = readField(context, field);
  if (!actual.provided) {
    return { status: "unverified", missingFields: [field] };
  }

  if (op === "exists" || op === "empty") {
    const expected = condition.value == null ? true : toBoolean(condition.value);
    const matches = op === "exists" ? expected !== false : expected === true;
    return { status: matches ? "matched" : "not_matched", missingFields: [] };
  }

  if (op === "eq_field" || op === "neq_field") {
    const otherField = asText(condition.value, 120);
    if (!FIELD_REGISTRY[otherField]) {
      return { status: "unverified", missingFields: [] };
    }
    const other = readField(context, otherField);
    if (!other.provided) {
      return { status: "unverified", missingFields: [otherField] };
    }
    const matches =
      op === "eq_field"
        ? sameValue(actual.value, other.value)
        : !sameValue(actual.value, other.value);
    return { status: matches ? "matched" : "not_matched", missingFields: [] };
  }

  if (!CONDITION_OPS.includes(op)) {
    return { status: "unverified", missingFields: [] };
  }

  const matches = compareValues(op, actual.value, condition.value);
  return { status: matches ? "matched" : "not_matched", missingFields: [] };
};

const evaluateGroup = (list, context) => {
  if (!Array.isArray(list) || !list.length) {
    return { status: "matched", missingFields: [] };
  }
  const results = list.map((condition) => evaluateLeaf(condition, context));
  const missingFields = [...new Set(results.flatMap((result) => result.missingFields))];
  if (results.some((result) => result.status === "not_matched")) {
    return { status: "not_matched", missingFields };
  }
  if (results.some((result) => result.status === "unverified")) {
    return { status: "unverified", missingFields };
  }
  return { status: "matched", missingFields: [] };
};

const evaluateAnyGroup = (list, context) => {
  if (!Array.isArray(list) || !list.length) {
    return { status: "matched", missingFields: [] };
  }
  const results = list.map((condition) => evaluateLeaf(condition, context));
  const missingFields = [...new Set(results.flatMap((result) => result.missingFields))];
  if (results.some((result) => result.status === "matched")) {
    return { status: "matched", missingFields: [] };
  }
  if (results.some((result) => result.status === "unverified")) {
    return { status: "unverified", missingFields };
  }
  return { status: "not_matched", missingFields: [] };
};

const evaluateNoneGroup = (list, context) => {
  if (!Array.isArray(list) || !list.length) {
    return { status: "matched", missingFields: [] };
  }
  const results = list.map((condition) => evaluateLeaf(condition, context));
  const missingFields = [...new Set(results.flatMap((result) => result.missingFields))];
  if (results.some((result) => result.status === "matched")) {
    return { status: "not_matched", missingFields: [] };
  }
  if (results.some((result) => result.status === "unverified")) {
    return { status: "unverified", missingFields };
  }
  return { status: "matched", missingFields: [] };
};

/**
 * Evaluates a rule condition tree.
 * Condition shape:
 *   { all: [{field, op, value}], any: [...], none: [...] }
 * A bare array is treated as `all`.
 * Returns { status: "matched" | "not_matched" | "unverified", missingFields }
 */
const evaluateConditions = (conditions, context) => {
  if (!conditions || (typeof conditions !== "object")) {
    return { status: "matched", missingFields: [] };
  }
  const tree = Array.isArray(conditions) ? { all: conditions } : conditions;
  const groups = [];

  if (tree.all !== undefined) groups.push(evaluateGroup(tree.all, context));
  if (tree.any !== undefined) groups.push(evaluateAnyGroup(tree.any, context));
  if (tree.none !== undefined) groups.push(evaluateNoneGroup(tree.none, context));

  if (!groups.length) return { status: "matched", missingFields: [] };

  const missingFields = [...new Set(groups.flatMap((group) => group.missingFields))];
  if (groups.some((group) => group.status === "not_matched")) {
    return { status: "not_matched", missingFields };
  }
  if (groups.some((group) => group.status === "unverified")) {
    return { status: "unverified", missingFields };
  }
  return { status: "matched", missingFields: [] };
};

const validateLeaf = (condition) => {
  const errors = [];
  if (!condition || typeof condition !== "object") {
    return ["Each condition must be an object with field, op and value."];
  }
  const field = asText(condition.field, 120);
  const op = asText(condition.op, 40);
  if (!FIELD_REGISTRY[field]) errors.push(`Unknown condition field: ${field || "(empty)"}`);
  if (!CONDITION_OPS.includes(op)) errors.push(`Unknown condition operator: ${op || "(empty)"}`);

  if (op === "eq_field" || op === "neq_field") {
    const other = asText(condition.value, 120);
    if (!FIELD_REGISTRY[other]) errors.push(`Unknown comparison field: ${other || "(empty)"}`);
  } else if (op === "in" || op === "not_in") {
    if (!Array.isArray(condition.value) || !condition.value.length) {
      errors.push(`Operator "${op}" needs a non-empty array value.`);
    }
  } else if (op === "between") {
    if (!Array.isArray(condition.value) || condition.value.length !== 2) {
      errors.push('Operator "between" needs a [min, max] value.');
    }
  } else if (op === "matches") {
    try {
      new RegExp(String(condition.value));
    } catch (_) {
      errors.push("Operator \"matches\" needs a valid regular expression.");
    }
  } else if (["gt", "gte", "lt", "lte"].includes(op)) {
    if (!Number.isFinite(Number(condition.value))) {
      errors.push(`Operator "${op}" needs a numeric value.`);
    }
  }

  const spec = FIELD_REGISTRY[field];
  if (
    spec &&
    ["eq", "neq", "in", "not_in", "includes"].includes(op) &&
    condition.value != null
  ) {
    const values = Array.isArray(condition.value) ? condition.value : [condition.value];
    for (const value of values) {
      if (spec.type === "direction" && !normalizeDirection(value)) {
        errors.push(`${spec.label} condition must use a recognised direction.`);
        break;
      }
      if (
        spec.type === "enum" &&
        !(
          (field === "propertyType" && normalizePropertyType(value)) ||
          (field === "plotShape" && normalizePlotShape(value)) ||
          (field === "roadType" && normalizeRoadType(value)) ||
          (field === "areaUnit" && normalizeAreaUnit(value)) ||
          spec.options?.includes(String(value).trim().toLowerCase())
        )
      ) {
        errors.push(`${spec.label} condition must use a recognised value.`);
        break;
      }
    }
  }

  return errors;
};

const validateConditions = (conditions) => {
  const errors = [];
  if (!conditions || typeof conditions !== "object") {
    return { valid: false, errors: ["Conditions must be an object."] };
  }
  const tree = Array.isArray(conditions) ? { all: conditions } : conditions;
  const keys = Object.keys(tree);
  const unknown = keys.filter((key) => !["all", "any", "none"].includes(key));
  if (unknown.length) errors.push(`Unknown condition groups: ${unknown.join(", ")}`);
  if (!keys.length) errors.push("At least one of all/any/none is required.");

  for (const key of ["all", "any", "none"]) {
    if (tree[key] === undefined) continue;
    if (!Array.isArray(tree[key]) || !tree[key].length) {
      errors.push(`"${key}" must be a non-empty array of conditions.`);
      continue;
    }
    for (const condition of tree[key]) errors.push(...validateLeaf(condition));
  }

  return { valid: errors.length === 0, errors: [...new Set(errors)] };
};

// ---------------------------------------------------------------------------
// Rule evaluation
// ---------------------------------------------------------------------------

const findingFromRule = (rule) => ({
  rule: rule._id || rule.id || null,
  code: rule.code,
  title: rule.title,
  kind: rule.kind === "strength" ? "strength" : "concern",
  category: rule.category,
  zone: rule.zone || "",
  zoneKey: rule.zoneKey || "other",
  direction: rule.direction || "",
  concern: normalizeConcern(rule.concern),
  concernLabel: CONCERN_LABELS[normalizeConcern(rule.concern)],
  severity: normalizeConcern(rule.concern) === "moderate" ? "medium" : normalizeConcern(rule.concern),
  explanation: rule.explanation || rule.description || "",
  remedy: rule.remedy || "",
  source: "rule",
  sourceNote: rule.source || "",
  status: "active",
  reviewerNote: "",
  sortOrder: Number(rule.sortOrder) || 0,
});

const evaluateRules = (rules = [], input = {}, birthDetails = {}) => {
  const context = buildContext(input, birthDetails);
  const findings = [];
  const strengths = [];
  const unverifiedRules = [];
  const missingFields = new Set();
  const skippedRules = [];

  for (const rule of rules) {
    if (!rule || rule.enabled === false) continue;

    const appliesTo = Array.isArray(rule.appliesTo) ? rule.appliesTo : [];
    if (input.propertyType && appliesTo.length && !appliesTo.includes(input.propertyType)) {
      skippedRules.push({ code: rule.code, reason: "property_type" });
      continue;
    }

    const result = evaluateConditions(rule.conditions, context);

    if (result.status === "unverified") {
      const relevantMissing = result.missingFields.filter((field) => FIELD_REGISTRY[field] && !FIELD_REGISTRY[field].derived);
      if (!relevantMissing.length) continue;

      // Optional rules (for example horoscope-based rules) are skipped silently
      // when only optional birth fields are missing.
      const onlyOptional = relevantMissing.every((field) =>
        ["moonSign", "ascendantSign", "moonNakshatra"].includes(field),
      );
      if (rule.optional && onlyOptional) continue;

      unverifiedRules.push({ code: rule.code, title: rule.title, missingFields: relevantMissing });
      for (const field of relevantMissing) missingFields.add(field);
      continue;
    }

    if (result.status !== "matched") continue;

    const finding = findingFromRule(rule);
    if (finding.kind === "strength") {
      strengths.push(finding);
    } else {
      findings.push(finding);
    }
  }

  findings.sort(
    (a, b) =>
      (CONCERN_ORDER[a.concern] ?? 1) - (CONCERN_ORDER[b.concern] ?? 1) ||
      (a.sortOrder || 0) - (b.sortOrder || 0),
  );
  strengths.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

  return {
    context,
    findings,
    strengths,
    unverifiedRules,
    missingFields: [...missingFields].map((field) => ({
      field,
      label: labelForField(field),
    })),
    skippedRules,
  };
};

// ---------------------------------------------------------------------------
// Report sections
// ---------------------------------------------------------------------------

const ZONE_SPECS = [
  {
    key: "entrance",
    label: "Main entrance",
    field: "entranceDirection",
    ideal: ["north", "north-east", "east"],
  },
  { key: "kitchen", label: "Kitchen", field: "kitchenDirection", ideal: ["south-east"] },
  {
    key: "master_bedroom",
    label: "Master bedroom",
    field: "masterBedroomDirection",
    ideal: ["south-west"],
  },
  { key: "bedroom", label: "Bedroom", field: "bedroomDirections", ideal: ["south-west", "west", "north-west"] },
  { key: "bathroom", label: "Bathroom", field: "bathroomDirection", ideal: ["north-west", "west"] },
  { key: "toilet", label: "Toilet", field: "toiletDirection", ideal: ["north-west", "west"] },
  { key: "prayer_room", label: "Prayer room", field: "prayerRoomDirection", ideal: ["north-east", "north", "east"] },
  {
    key: "staircase",
    label: "Staircase",
    field: "staircaseDirection",
    ideal: ["south-west", "south", "west"],
  },
  {
    key: "water_tank",
    label: "Underground water tank",
    field: "waterTankDirection",
    ideal: ["north-east", "north", "east"],
  },
  {
    key: "overhead_tank",
    label: "Overhead water tank",
    field: "overheadTankDirection",
    ideal: ["south-west", "south", "west"],
  },
  {
    key: "septic_tank",
    label: "Septic tank",
    field: "septicTankDirection",
    ideal: ["north-west", "west"],
  },
];

const countConcerns = (findings) => ({
  high: findings.filter((item) => item.concern === "high").length,
  moderate: findings.filter((item) => item.concern === "moderate").length,
  low: findings.filter((item) => item.concern === "low").length,
});

const buildZoneAnalysis = (input, findings = []) => {
  const zones = [];

  for (const spec of ZONE_SPECS) {
    const raw = input[spec.field];
    const directions = Array.isArray(raw) ? raw : raw ? [raw] : [];
    if (!directions.length) {
      zones.push({
        zoneKey: spec.key,
        label: spec.label,
        directions: [],
        direction: "",
        idealDirections: spec.ideal,
        status: "not_assessed",
        concernCount: 0,
        concerns: [],
      });
      continue;
    }

    const zoneFindings = findings.filter((finding) => finding.zoneKey === spec.key);
    const aligned =
      !directions.includes("centre") &&
      directions.every((direction) => spec.ideal.includes(direction));

    zones.push({
      zoneKey: spec.key,
      label: spec.label,
      directions,
      direction: directions[0],
      directionLabel: directions.map(labelForDirection).join(", "),
      idealDirections: spec.ideal,
      idealDirectionLabels: spec.ideal.map(labelForDirection),
      status: aligned ? "aligned" : "review",
      concernCount: zoneFindings.length,
      concerns: zoneFindings.map((finding) => finding.title),
      element: DIRECTION_ELEMENTS[directions[0]] || null,
    });
  }

  return zones;
};

const buildDirectionalAssessment = (input, findings = []) => {
  const placements = collectPlacements(input);
  const concernsByDirection = findings.reduce((acc, finding) => {
    if (!finding.direction) return acc;
    acc[finding.direction] = (acc[finding.direction] || 0) + 1;
    return acc;
  }, {});

  return DIRECTIONS.map((direction) => {
    const zoneItems = placements.filter((item) => item.direction === direction);
    const isEntrance = input.entranceDirection === direction;
    return {
      direction,
      label: labelForDirection(direction),
      element: DIRECTION_ELEMENTS[direction] || null,
      elementLabel: ELEMENT_LABELS[DIRECTION_ELEMENTS[direction]] || "",
      isEntrance,
      zones: zoneItems.map((item) => ({ zoneKey: item.zoneKey, label: item.label })),
      concernCount: concernsByDirection[direction] || 0,
      status: zoneItems.length || isEntrance ? "assessed" : "no_input",
      note:
        zoneItems.length || isEntrance
          ? ""
          : "No entrance or room direction was reported for this side.",
    };
  });
};

const computeScore = (findings = []) => {
  const concerns = findings.filter((finding) => finding.kind !== "strength");
  if (!concerns.length) return 100;
  const deduction = concerns.reduce((total, finding) => {
    if (finding.concern === "high") return total + 12;
    if (finding.concern === "moderate") return total + 6;
    return total + 2;
  }, 0);
  return Math.max(10, 100 - deduction);
};

const verdictFor = (score) => {
  if (!Number.isFinite(score)) return "Insufficient information";
  if (score >= 85) return "Good — well aligned";
  if (score >= 70) return "Good";
  if (score >= 50) return "Needs attention";
  return "Significant concerns";
};

const uniqueList = (items) => {
  const seen = new Set();
  const output = [];
  for (const item of items) {
    const text = asText(item, 1000);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    output.push(text);
  }
  return output;
};

const buildHoroscopeInterpretation = (birthDetails = {}) => {
  const birth = toPlain(birthDetails) || {};
  if (!birth.dateOfBirth) {
    return {
      provided: false,
      moonSign: "",
      ascendantSign: "",
      moonNakshatra: "",
      precision: "not_provided",
      note:
        "No birth details were provided, so the optional horoscope-based interpretation was skipped. This does not affect the Vastu observations.",
      disclaimer:
        "Horoscope-based Vastu interpretation is optional and traditional. It is not a scientific input to the property assessment.",
    };
  }

  let chart = null;
  try {
    chart = calculateVedicChart({
      dateOfBirth: birth.dateOfBirth,
      timeOfBirth: birth.timeOfBirth,
      timeZoneOffsetMinutes: birth.timeZoneOffsetMinutes,
      latitude: birth.latitude,
      longitude: birth.longitude,
    });
  } catch (error) {
    chart = null;
  }

  if (!chart || chart.precision === "invalid") {
    return {
      provided: false,
      moonSign: "",
      ascendantSign: "",
      moonNakshatra: "",
      precision: "unavailable",
      note:
        "Birth details were provided but the chart could not be calculated. The optional horoscope-based interpretation was skipped.",
      disclaimer:
        "Horoscope-based Vastu interpretation is optional and traditional. It is not a scientific input to the property assessment.",
    };
  }

  const facts = [];
  facts.push(`Moon sign: ${chart.moonRashi || "not available"}`);
  facts.push(`Moon nakshatra: ${chart.moonNakshatra?.name || "not available"}`);
  facts.push(`Ascendant: ${chart.ascendant?.rashi || "requires birth time and location"}`);

  return {
    provided: true,
    moonSign: chart.moonRashi || "",
    ascendantSign: chart.ascendant?.rashi || "",
    moonNakshatra: chart.moonNakshatra?.name || "",
    precision: chart.precision,
    facts,
    note:
      chart.precision === "full"
        ? "Birth details were available. This optional section records traditional chart facts for the reviewer; it is not used to override the property-based observations."
        : "Birth details were partial, so only the available chart facts are shown. Ascendant-based interpretation needs an accurate birth time and location.",
    disclaimer:
      "Horoscope-based Vastu interpretation is optional and traditional. It is not a scientific input to the property assessment.",
  };
};

const buildSummary = ({ input, score, verdict, findings, strengths, zoneAnalysis, missingInputs }) => {
  const property = titleCase(input.propertyType || "property");
  const assessedZones = zoneAnalysis.filter((zone) => zone.status !== "not_assessed");
  const alignedZones = assessedZones.filter((zone) => zone.status === "aligned");
  const counts = countConcerns(findings);
  const entrance = input.entranceDirection
    ? ` The main entrance is reported in the ${labelForDirection(input.entranceDirection).toLowerCase()}.`
    : " No main entrance direction was reported.";

  if (!assessedZones.length && !strengths.length) {
    return `${property}.${entrance} There was not enough verified information to run a meaningful traditional Vastu comparison. The missing inputs are listed for review.`;
  }

  const concernSentence = findings.length
    ? `${counts.high} high, ${counts.moderate} moderate and ${counts.low} low-concern observations were recorded.`
    : "No rule-based concern was triggered by the information provided.";
  const missingSentence = missingInputs.length
    ? ` ${missingInputs.length} input${missingInputs.length === 1 ? " is" : "s are"} missing or unverified and should be checked before the report is finalised.`
    : "";

  return `${property}.${entrance} ${alignedZones.length} of ${assessedZones.length} assessed zones match the traditional preferred direction. ${concernSentence}${missingSentence}${verdict ? ` Overall traditional alignment: ${verdict.toLowerCase()}.` : ""}`;
};

const templateSections = (template) => {
  const source = Array.isArray(template?.sections) && template.sections.length
    ? template.sections
    : DEFAULT_TEMPLATE_SECTIONS;
  return source
    .map((section, index) => ({
      key: section.key,
      title: section.title || titleCase(section.key),
      enabled: section.enabled !== false,
      order: Number.isFinite(Number(section.order)) ? Number(section.order) : (index + 1) * 10,
    }))
    .sort((a, b) => a.order - b.order);
};

const buildReportData = ({ request, rules = [], template = null, reviewer = null } = {}) => {
  const plainRequest = toPlain(request) || {};
  const property = toPlain(plainRequest.property) || {};
  const birthDetails = toPlain(plainRequest.birthDetails) || {};
  const normalized = normalizePropertyInput(property);
  const input = normalized.value;
  const evaluation = evaluateRules(rules, input, birthDetails);
  const zoneAnalysis = buildZoneAnalysis(input, evaluation.findings);
  const directionalAssessment = buildDirectionalAssessment(input, evaluation.findings);
  const elementBalance = buildElementBalance(input);
  const horoscope = buildHoroscopeInterpretation(birthDetails);

  const findings = evaluation.findings.map((finding) => ({
    ...finding,
    rule: finding.rule ? String(finding.rule) : null,
    directionLabel: finding.direction ? labelForDirection(finding.direction) : "",
  }));

  const strengths = uniqueList([
    ...evaluation.strengths.map((finding) => finding.title),
    ...(findings.some((finding) => finding.concern === "high")
      ? []
      : findings.length || !zoneAnalysis.some((zone) => zone.status !== "not_assessed")
        ? []
        : ["No high-concern rule was triggered by the inputs that could be assessed."]),
  ]);

  const score = findings.length || strengths.length ? computeScore(findings) : null;
  const verdict = verdictFor(score);

  const missingMap = new Map();
  for (const item of evaluation.missingFields) {
    if (!missingMap.has(item.field)) {
      missingMap.set(item.field, {
        field: item.field,
        label: item.label,
        reason: "This input is needed to evaluate one or more enabled Vastu rules.",
        status: "open",
      });
    }
  }
  for (const item of plainRequest.missingInfo || []) {
    const plainItem = toPlain(item) || {};
    if (!plainItem.field || plainItem.status === "resolved" || plainItem.status === "waived") continue;
    if (!missingMap.has(plainItem.field)) {
      missingMap.set(plainItem.field, {
        field: plainItem.field,
        label: plainItem.label || labelForField(plainItem.field),
        reason: plainItem.reason || "The reviewer requested this input.",
        status: "open",
      });
    }
  }

  if (!input.entranceDirection && !input.houseFacing) {
    missingMap.set("entranceDirection", {
      field: "entranceDirection",
      label: "Main entrance / house-facing direction",
      reason: "Without this, entrance and facing rules cannot be checked.",
      status: "open",
    });
  }
  if (!plainRequest.media?.floorPlanUrl && !(plainRequest.media?.photoUrls || []).length) {
    missingMap.set("floorPlan", {
      field: "floorPlan",
      label: "Floor plan or property photos",
      reason:
        "Only an address or map link was provided, so the interior layout, rooms and entrance position cannot be verified.",
      status: "open",
    });
  }

  const missingInputs = [...missingMap.values()];

  const verification = toPlain(plainRequest.verification) || {};
  const unverifiedInputs = [];
  if (verification.addressVerified !== true) {
    unverifiedInputs.push({
      field: "address",
      label: "Address / location context",
      reason: "The address and map context were supplied by the user and have not been verified by the reviewer.",
    });
  }
  if (verification.directionsVerified !== true) {
    unverifiedInputs.push({
      field: "directions",
      label: "Reported directions",
      reason: "Room and entrance directions are user-reported; the reviewer should confirm them before finalising.",
    });
  }
  if (verification.mediaVerified !== true) {
    unverifiedInputs.push({
      field: "media",
      label: "Floor plan, photos and video",
      reason: "Uploaded media has not been checked for clarity or completeness.",
    });
  }

  const recommendations = uniqueList(
    findings
      .filter((finding) => finding.remedy)
      .map((finding) => finding.remedy)
      .slice(0, 8),
  );

  const address = toPlain(plainRequest.address) || {};
  const locationAssessment = {
    addressLine: address.line || "",
    city: address.city || "",
    state: address.state || "",
    pincode: address.pincode || "",
    country: address.country || "",
    mapsUrl: address.mapsUrl || "",
    placeId: address.placeId || "",
    latitude: address.latitude ?? null,
    longitude: address.longitude ?? null,
    source: address.source || "manual",
    verified: verification.addressVerified === true,
    notes: address.contextNotes || "",
    limitations: [
      "A map link or pin shows location context only. It does not establish the interior layout, entrance direction, room positions or surrounding structures.",
      "Roads, intersections and neighbouring structures must be confirmed by the reviewer from the map or a site visit.",
    ],
  };

  const summary = buildSummary({
    input,
    score,
    verdict,
    findings,
    strengths,
    zoneAnalysis,
    missingInputs,
  });

  return {
    input,
    birthDetails: normalizeBirthDetails(birthDetails).value,
    score,
    verdict,
    summary,
    conclusion: "",
    strengths,
    findings,
    zoneAnalysis,
    directionalAssessment,
    elementBalance,
    horoscope,
    missingInputs,
    unverifiedInputs,
    locationAssessment,
    recommendations,
    customRemarks: "",
    disclaimer: DISCLAIMER,
    template: templateSections(template),
    generatedAt: new Date(),
    generatedBy: reviewer ? String(reviewer._id || reviewer.id || reviewer) : null,
    ruleStats: {
      enabled: rules.filter((rule) => rule.enabled !== false).length,
      matched: findings.length + evaluation.strengths.length,
      unverified: evaluation.unverifiedRules.length,
      skipped: evaluation.skippedRules.length,
    },
  };
};

module.exports = {
  DIRECTIONS,
  PROPERTY_TYPES,
  CONCERN_LEVELS,
  RULE_CATEGORIES,
  ZONE_KEYS,
  PLOT_SHAPES,
  ROAD_TYPES,
  AREA_UNITS,
  ZODIAC_SIGNS,
  REQUEST_STATUSES,
  STATUS_TRANSITIONS,
  canTransition,
  DISCLAIMER,
  DEFAULT_TEMPLATE_SECTIONS,
  CONCERN_LABELS,
  ELEMENT_DIRECTIONS,
  DIRECTION_ELEMENTS,
  ELEMENT_LABELS,
  DIRECTION_LABELS,
  FIELD_REGISTRY,
  CONDITION_OPS,
  normalizeDirection,
  normalizePropertyType,
  normalizePlotShape,
  normalizeRoadType,
  normalizeAreaUnit,
  normalizeZodiac,
  normalizeConcern,
  normalizePropertyInput,
  normalizeBirthDetails,
  buildContext,
  buildElementBalance,
  buildDerived,
  evaluateConditions,
  validateConditions,
  evaluateRules,
  buildZoneAnalysis,
  buildDirectionalAssessment,
  buildHoroscopeInterpretation,
  computeScore,
  verdictFor,
  buildSummary,
  templateSections,
  buildReportData,
  labelForDirection,
  labelForField,
  concernLabel: (concern) => CONCERN_LABELS[normalizeConcern(concern)],
  titleCase,
};
