const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeReport,
  normalizeDirection,
  buildPrompt,
  SYSTEM_PROMPT,
  DEFAULT_DISCLAIMER,
} = require("../services/vastuService");

test("direction labels cover every Vastu zone and tolerate model spellings", () => {
  assert.equal(normalizeDirection("NE"), "North-east");
  assert.equal(normalizeDirection("north east corner"), "North-east");
  assert.equal(normalizeDirection("SE"), "South-east");
  assert.equal(normalizeDirection("South-West"), "South-west");
  assert.equal(normalizeDirection("Northwest"), "North-west");
  assert.equal(normalizeDirection("Centre / Brahmasthan"), "Centre");
  assert.equal(normalizeDirection("Unknown"), "Unknown");
  assert.equal(normalizeDirection(""), "Unknown");
});

test("normalizeReport derives a direction from the zone when the model says Unknown", () => {
  const report = normalizeReport(
    {
      score: 62,
      verdict: "Needs attention",
      summary: "Toilet in the north-east corner.",
      doshas: [
        {
          title: "Master Bedroom in South-East",
          zone: "Master Bedroom (SE)",
          direction: "Unknown",
          severity: "high",
          observation: "Fire zone used as a bedroom.",
          remedy: "Use calm colours.",
        },
        {
          title: "South Main Entrance",
          zone: "Main entrance",
          direction: "",
          severity: "low",
          observation: "Southern entry.",
          remedy: "Keep it well lit.",
        },
      ],
    },
    ""
  );

  assert.equal(report.doshas[0].direction, "South-east");
  assert.equal(report.doshas[1].direction, "South");
  // High severity must always be listed first.
  assert.deepEqual(
    report.doshas.map((item) => item.severity),
    ["high", "low"]
  );
});

test("normalizeReport clamps the score and keeps a usable verdict/disclaimer", () => {
  const report = normalizeReport(
    { score: 148, summary: "Well aligned", doshas: [] },
    ""
  );
  assert.equal(report.score, 100);
  assert.equal(report.verdict, "Excellent");
  assert.equal(report.disclaimer, DEFAULT_DISCLAIMER);

  const fallback = normalizeReport(null, "Plain language answer");
  assert.equal(fallback.score, null);
  assert.equal(fallback.verdict, "Vastu report ready");
  assert.equal(fallback.summary, "Plain language answer");
  assert.deepEqual(fallback.doshas, []);
});

test("Vastu prompt keeps the JSON contract and the full direction enum", () => {
  assert.match(SYSTEM_PROMPT, /demolition/);
  for (const direction of [
    "North-east",
    "South-east",
    "South-west",
    "North-west",
    "Centre",
  ]) {
    assert.match(SYSTEM_PROMPT, new RegExp(direction.replace("-", ".")));
  }
  assert.match(SYSTEM_PROMPT, /never write "Unknown"/);
  assert.match(buildPrompt({ notes: "", homeType: "House", facing: "South" }), /South/);
});
