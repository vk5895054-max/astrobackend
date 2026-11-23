const test = require("node:test");
const assert = require("node:assert/strict");

const ReadingReport = require("../models/readingReport");
const readingRoutes = require("../routes/readingRoutes");
const { serializeReadingReport } = require("../controllers/readingController");
const { buildReadingReportPdf } = require("../services/readingReportPdf");

test("Graphology reports are an accepted persisted feature", () => {
  assert.deepEqual(
    ReadingReport.schema.path("feature").enumValues,
    ["face", "palm", "graphology"]
  );
});

test("Graphology API exposes the protected analyze and report endpoints", () => {
  const routes = readingRoutes.graphologyRoutes.stack
    .filter((layer) => layer.route)
    .map((layer) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods),
    }));

  for (const [path, method] of [
    ["/billing", "get"],
    ["/analyze", "post"],
    ["/reports", "get"],
    ["/reports/:id", "get"],
    ["/reports/:id/pdf", "get"],
    ["/reports/:id", "delete"],
  ]) {
    assert.ok(
      routes.some((route) => route.path === path && route.methods.includes(method)),
      `${method.toUpperCase()} ${path} should be registered`
    );
  }
});

test("Graphology results serialize into the app's shared reading contract", () => {
  const response = serializeReadingReport({
    _id: "68a000000000000000000099",
    feature: "graphology",
    tier: "detailed",
    language: "en-US",
    images: [{ url: "/uploads/readings/graphology/1/sample.jpg" }],
    report: {
      summary: "The sample has a steady baseline.",
      overallReading: "A brief observation of visible writing patterns.",
      features: [
        {
          key: "baseline",
          title: "Baseline",
          observation: "Mostly straight",
          interpretation: "This alone does not establish a trait.",
        },
      ],
      detailed: {
        baseline: {
          label: "Baseline",
          observation: "Mostly straight",
          interpretation: "This alone does not establish a trait.",
        },
      },
      strengths: ["Consistent sample"],
      suggestions: ["Use a well-lit photo"],
      disclaimer: "Graphology is not scientifically validated.",
    },
    quality: { valid: true, message: "" },
    createdAt: new Date("2026-11-23T00:00:00.000Z"),
  });

  assert.equal(response.type, "graphology");
  assert.equal(response.image.url, "/uploads/readings/graphology/1/sample.jpg");
  assert.equal(response.features[0].key, "baseline");
  assert.equal(response.features[0].label, "Baseline");
  assert.equal(response.proportions[0].detail, "This alone does not establish a trait.");
  assert.deepEqual(response.strengths, ["Consistent sample"]);
});

test("Graphology PDF is labeled and includes its disclaimer", () => {
  const pdf = buildReadingReportPdf({
    report: {
      summary: "The sample has a steady baseline.",
      detailed: {
        baseline: {
          label: "Baseline",
          observation: "Mostly straight",
          interpretation: "A visible writing feature.",
        },
      },
      disclaimer: "Graphology is not scientifically validated.",
    },
    reading: {
      _id: "68a000000000000000000099",
      feature: "graphology",
      tier: "basic",
      language: "en-US",
    },
  });

  const text = pdf.toString("latin1");
  assert.equal(pdf.subarray(0, 8).toString(), "%PDF-1.4");
  assert.match(text, /GRAPHOLOGY READING REPORT/);
  assert.match(text, /Baseline/);
  assert.match(text, /Graphology is not scientifically validated/);
});
