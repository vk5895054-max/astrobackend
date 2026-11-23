const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildPrompt,
  normalizeReport,
  DEFAULT_DISCLAIMER,
} = require("../services/readingVisionService");

test("face prompt covers every area required by the scope", () => {
  const basic = buildPrompt({
    feature: "face",
    tier: "basic",
    notes: "",
    focus: "",
    language: "en-US",
  });
  for (const area of [
    "forehead",
    "eyes",
    "nose",
    "lips",
    "chin",
    "faceShape",
  ]) {
    assert.match(basic, new RegExp(area));
  }
  assert.match(basic, /Do NOT give medical/i);
  assert.match(basic, /entertainment/i);
});

test("palm prompt covers all four lines", () => {
  const prompt = buildPrompt({
    feature: "palm",
    tier: "detailed",
    notes: "right hand photo",
    focus: "career",
    language: "en-US",
  });
  for (const line of ["heartLine", "headLine", "lifeLine", "fateLine"]) {
    assert.match(prompt, new RegExp(line));
  }
  assert.match(prompt, /career/);
  assert.match(prompt, /right hand photo/);
  assert.match(prompt, /observation.*interpretation/);
});

test("graphology prompt focuses on visible writing and avoids factual claims", () => {
  const prompt = buildPrompt({
    feature: "graphology",
    tier: "detailed",
    notes: "",
    focus: "",
    language: "en-US",
  });

  for (const area of [
    "slant",
    "letterSize",
    "spacing",
    "baseline",
    "writingPressure",
    "letterForms",
  ]) {
    assert.match(prompt, new RegExp(area));
  }
  assert.match(prompt, /not scientifically validated/i);
  assert.match(prompt, /do not claim handwriting proves personality/i);
  assert.match(prompt, /no readable handwriting/i);
});

test("normalizeReport localizes Graphology areas without accepting palm areas", () => {
  const report = normalizeReport(
    {
      summary: "The writing has a consistent right slant.",
      features: [
        { title: "Letter slant", detail: "Mostly upright." },
        { title: "Heart line", detail: "Not part of this sample." },
      ],
      detailed: {
        slant: {
          observation: "Mostly upright",
          interpretation: "This feature alone does not establish a trait.",
        },
      },
    },
    "",
    "graphology",
    "detailed",
    "hi-IN"
  );

  assert.deepEqual(
    report.features.map((item) => item.key),
    ["slant"]
  );
  assert.equal(report.features[0].title, "अक्षरों का झुकाव");
  assert.equal(report.detailed.slant.label, "अक्षरों का झुकाव");
  assert.match(report.disclaimer, /वैज्ञानिक रूप से प्रमाणित नहीं/);
});

test("normalizeReport tolerates malformed or string-shaped model output", () => {
  const report = normalizeReport(
    {
      summary: "A balanced appearance.",
      features: ["Broad forehead - thoughtful", { title: "Eyes", detail: "Calm gaze" }],
      strengths: ["Warm expression", { detail: "Clear features" }],
      cautions: null,
      suggestions: "Reflect on your strengths",
      detailed: {
        forehead: { observation: "High", interpretation: "Curious mind" },
      },
    },
    "raw model text",
    "face",
    "detailed"
  );

  assert.equal(report.summary, "A balanced appearance.");
  assert.equal(report.features.length, 2);
  assert.equal(report.features[0].title, "Broad forehead - thoughtful");
  assert.equal(report.features[1].title, "Eyes");
  assert.deepEqual(report.strengths, ["Warm expression", "Clear features"]);
  assert.deepEqual(report.cautions, []);
  assert.equal(report.detailed.forehead.interpretation, "Curious mind");
  assert.equal(report.disclaimer, DEFAULT_DISCLAIMER);
  assert.equal(report.rawText, "raw model text");
});

test("normalizeReport never leaks face areas into a palm report", () => {
  const report = normalizeReport(
    {
      summary: "Palm lines are visible.",
      features: [{ title: "Forehead", detail: "Broad and smooth" }],
      detailed: {
        heartLine: { observation: "Long", interpretation: "Empathetic" },
        lifeLine: { observation: "Curved", interpretation: "Resilient" },
      },
    },
    "",
    "palm",
    "basic"
  );

  assert.deepEqual(
    report.features.map((item) => item.title),
    ["Heart line", "Life line"]
  );
  assert.equal(report.detailed.heartLine.label, "Heart line");
  assert.equal(report.detailed.lifeLine.label, "Life line");
});

test("normalizeReport falls back to detailed notes when features are missing", () => {
  const report = normalizeReport(
    {
      summary: "Palm lines are visible.",
      detailed: {
        lifeLine: { observation: "Long and clear", interpretation: "Steady energy" },
        fateLine: { observation: "Faint", interpretation: "Changing path" },
      },
    },
    "",
    "palm",
    "basic"
  );

  assert.deepEqual(
    report.features.map((item) => item.title),
    ["Life line", "Fate line"]
  );
  assert.equal(report.overallReading, "");
});
