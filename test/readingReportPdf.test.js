const test = require("node:test");
const assert = require("node:assert/strict");

const { buildReadingReportPdf } = require("../services/readingReportPdf");

const report = {
  summary: "A warm and balanced appearance with expressive features.",
  overallReading: "The visible features suggest a thoughtful personality.",
  features: [
    { title: "Forehead", detail: "Broad and smooth." },
    { title: "Eyes", detail: "Calm and clear." },
  ],
  detailed: {
    forehead: { observation: "Broad and smooth", interpretation: "Curious nature" },
    eyes: { observation: "Calm gaze", interpretation: "Steady focus" },
  },
  strengths: ["Expressive eyes", "Balanced proportions"],
  cautions: ["Photo lighting affects visibility"],
  suggestions: ["Reflect on your natural strengths"],
  disclaimer: "For entertainment only.",
};

test("face reading PDF is a valid printable document", () => {
  const pdf = buildReadingReportPdf({
    report,
    reading: {
      _id: "68a000000000000000000001",
      feature: "face",
      tier: "detailed",
      createdAt: new Date("2026-11-17T10:00:00.000Z"),
    },
  });

  assert.ok(Buffer.isBuffer(pdf));
  assert.equal(pdf.subarray(0, 8).toString(), "%PDF-1.4");
  const text = pdf.toString("latin1");
  assert.match(text, /\/Type \/Pages/);
  assert.match(text, /FACE READING REPORT/);
  assert.match(text, /Feature-wise interpretation/);
  assert.match(text, /Detailed observations/);
  assert.match(text, /For entertainment only/);
});

test("palm reading PDF works with a minimal report", () => {
  const pdf = buildReadingReportPdf({
    report: { summary: "Heart and head lines are visible." },
    reading: { feature: "palm", tier: "basic" },
  });
  assert.equal(pdf.subarray(0, 8).toString(), "%PDF-1.4");
  assert.match(pdf.toString("latin1"), /PALM READING REPORT/);
});
