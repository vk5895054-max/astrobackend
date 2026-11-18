const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildPrompt,
  normalizeReport,
  validateReadingImage,
} = require("../services/readingVisionService");
const {
  getAreas,
  getAreaLabel,
  findAreaId,
  getDisclaimer,
  getMessage,
  normalizeLocale,
} = require("../services/readingLocalizationService");
const {
  serializeReadingReport,
} = require("../controllers/readingController");
const {
  buildReadingReportPdf,
} = require("../services/readingReportPdf");

const parsedFace = {
  summary: "A warm, open expression.",
  features: [{ title: "Forehead", detail: "Broad and smooth" }],
  detailed: {
    forehead: { observation: "Broad", interpretation: "Open minded" },
    eyes: { observation: "Bright", interpretation: "Curious" },
  },
};

test("reading locales normalize to the three app languages", () => {
  assert.equal(normalizeLocale("hi-IN"), "hi-IN");
  assert.equal(normalizeLocale("hi"), "hi-IN");
  assert.equal(normalizeLocale("en_IN"), "en-IN");
  assert.equal(normalizeLocale("en-IN"), "en-IN");
  assert.equal(normalizeLocale("fr-FR"), "en-US");
  assert.equal(normalizeLocale(undefined), "en-US");
});

test("face and palm labels change with the app language", () => {
  assert.deepEqual(
    getAreas("face", "en-US").map(([, label]) => label),
    ["Forehead", "Eyes", "Nose", "Lips", "Chin", "Face shape"]
  );
  assert.deepEqual(
    getAreas("face", "hi-IN").map(([, label]) => label),
    ["माथा", "आँखें", "नाक", "होंठ", "ठोड़ी", "चेहरे का आकार"]
  );
  assert.equal(getAreaLabel("palm", "heartLine", "hi-IN"), "हृदय रेखा");
  assert.equal(getAreaLabel("palm", "heartLine", "en-IN"), "Heart line");
});

test("labels are matched across locales and never leak across features", () => {
  // A Hindi request whose model answered in English still maps to the area.
  assert.equal(findAreaId("face", "Forehead"), "forehead");
  assert.equal(findAreaId("face", "माथा"), "forehead");
  assert.equal(findAreaId("palm", "HeartLine"), "heartLine");
  assert.equal(findAreaId("palm", "हृदय रेखा"), "heartLine");
  assert.equal(findAreaId("palm", "Forehead"), null);
  assert.equal(findAreaId("face", "जीवन रेखा"), null);
});

test("buildPrompt uses the localized area labels", () => {
  const hindi = buildPrompt({
    feature: "face",
    tier: "basic",
    notes: "",
    focus: "",
    language: "hi-IN",
  });
  assert.match(hindi, /- forehead \(माथा\)/);
  assert.match(hindi, /चेहरा पढ़ना/);
  // Stable ids are unchanged so the JSON contract stays the same.
  assert.match(hindi, /faceShape/);
});

test("normalizeReport localizes labels and disclaimer for hi-IN", () => {
  const report = normalizeReport(parsedFace, "", "face", "basic", "hi-IN");
  assert.equal(report.features[0].title, "माथा");
  assert.equal(report.features[0].key, "forehead");
  assert.equal(report.detailed.eyes.label, "आँखें");
  assert.equal(report.disclaimer, getDisclaimer("hi-IN"));
  assert.match(report.disclaimer, /मनोरंजन/);
});

test("normalizeReport localizes labels and disclaimer for en-IN", () => {
  const report = normalizeReport(parsedFace, "", "face", "basic", "en-IN");
  assert.equal(report.features[0].title, "Forehead");
  assert.equal(report.detailed.eyes.label, "Aankhen");
  assert.match(report.disclaimer, /Yeh ek traditional/);
});

test("normalizeReport still drops cross-feature areas in every locale", () => {
  const report = normalizeReport(
    {
      features: [
        { title: "Forehead", detail: "Not visible" },
        { title: "हृदय रेखा", detail: "Long" },
      ],
      detailed: {
        heartLine: { observation: "Long", interpretation: "Empathetic" },
      },
    },
    "",
    "palm",
    "basic",
    "hi-IN"
  );
  assert.deepEqual(
    report.features.map((item) => item.key),
    ["heartLine"]
  );
  assert.equal(report.features[0].title, "हृदय रेखा");
});

test("serialized cautions use the localized 'keep in mind' prefix", () => {
  const makeDoc = (language, report) => ({
    _id: "68a000000000000000000001",
    feature: "face",
    tier: "basic",
    language,
    images: [],
    quality: { valid: true, message: "" },
    report,
    createdAt: new Date("2026-11-18T10:00:00.000Z"),
  });

  const base = {
    summary: "Summary",
    cautions: ["Lighting can change what is visible"],
    features: [{ key: "forehead", title: "माथा", detail: "Obs" }],
  };
  const english = serializeReadingReport(makeDoc("en-US", base));
  assert.equal(
    english.suggestions[0],
    "Keep in mind: Lighting can change what is visible"
  );

  const hindi = serializeReadingReport(
    makeDoc("hi-IN", { ...base, cautions: ["रोशनी बदल सकती है"] })
  );
  assert.equal(hindi.suggestions[0], "ध्यान दें: रोशनी बदल सकती है");
  assert.equal(hindi.features[0].key, "forehead");

  const hinglish = serializeReadingReport(
    makeDoc("en-IN", { ...base, cautions: ["Lighting badal sakta hai"] })
  );
  assert.equal(hinglish.suggestions[0], "Dhyan dein: Lighting badal sakta hai");
});

test("validation and feature messages follow the app language", () => {
  assert.equal(
    getMessage("consentRequired", "en-US"),
    "Please give consent before processing your photo."
  );
  assert.match(getMessage("consentRequired", "hi-IN"), /सहमति/);
  assert.match(getMessage("insufficientBalance", "en-IN"), /wallet recharge/);
  assert.equal(
    validateReadingImage(null, "hi-IN").message,
    getMessage("emptyPhoto", "hi-IN")
  );
  assert.match(validateReadingImage(null, "en-IN").message, /khali/);
});

test("PDF keeps Latin-readable area labels for a Hindi report", () => {
  const report = normalizeReport(parsedFace, "", "face", "basic", "hi-IN");
  const pdf = buildReadingReportPdf({
    report,
    reading: {
      _id: "68a000000000000000000001",
      feature: "face",
      tier: "basic",
      language: "hi-IN",
      createdAt: new Date("2026-11-18T10:00:00.000Z"),
    },
  });
  assert.ok(Buffer.isBuffer(pdf));
  // Structural labels stay in the Latin-1-safe English form; the JSON report
  // above still carries the Devanagari labels for the app UI.
  assert.match(pdf.toString("latin1"), /Forehead/);
});
