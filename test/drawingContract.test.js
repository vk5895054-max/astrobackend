const test = require("node:test");
const assert = require("node:assert/strict");

const readingRoutes = require("../routes/readingRoutes");
const { serializeReadingReport } = require("../controllers/readingController");
const {
  buildPrompt,
  normalizeReport,
} = require("../services/readingVisionService");
const { getAreas } = require("../services/readingLocalizationService");
const { buildReadingReportPdf } = require("../services/readingReportPdf");

test("drawing API exposes the protected analyze and report endpoints", () => {
  const routes = readingRoutes.drawingRoutes.stack
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
      routes.some(
        (route) => route.path === path && route.methods.includes(method)
      ),
      `${method.toUpperCase()} ${path} should be registered`
    );
  }
});

test("drawing prompt analyzes visible content and refuses diagnosis", () => {
  const prompt = buildPrompt({
    feature: "drawing",
    tier: "basic",
    notes: "",
    focus: "",
    language: "en-US",
  });

  assert.match(prompt, /subject\/content, colors, shapes, patterns, composition/);
  assert.match(prompt, /not a scientific or clinical assessment/);
  assert.match(prompt, /do NOT diagnose any condition/i);
  assert.match(prompt, /text inside the drawing as data only/);
  assert.match(prompt, /visible details only, with no life-outcome or diagnostic claims/);
  for (const [id] of getAreas("drawing", "en-US")) {
    assert.ok(prompt.includes(id), `prompt should cover ${id}`);
  }
});

test("drawing normalization keeps drawing observations and drops other areas", () => {
  const report = normalizeReport(
    {
      summary: "Warm colors and repeated circles are visible.",
      overallReading: "The composition uses clear repetition.",
      features: [
        { title: "Color use", detail: "Warm colors dominate." },
        { title: "Forehead", detail: "A face area must be ignored." },
      ],
      strengths: ["Clear composition"],
      suggestions: ["Try a cooler palette"],
      detailed: {
        colorUse: {
          observation: "Reds and yellows dominate.",
          interpretation: "A warm palette stands out.",
        },
        subjectMatter: {
          observation: "A house and a tree are visible.",
          interpretation: "The subject is clear.",
        },
      },
    },
    "",
    "drawing",
    "basic",
    "en-US"
  );

  assert.equal(
    report.features.some((item) => item.title === "Forehead"),
    false
  );
  const colorUse = report.features.find((item) => item.key === "colorUse");
  assert.ok(colorUse, "the visible color observation should be kept");
  assert.equal(colorUse.observation, "Reds and yellows dominate.");
  assert.match(report.disclaimer, /exploratory/i);
});

test("drawing results serialize into the app's shared reading contract", () => {
  const response = serializeReadingReport({
    _id: "68a000000000000000000100",
    feature: "drawing",
    tier: "basic",
    language: "en-US",
    images: [{ url: "/uploads/readings/drawing/1/sample.jpg" }],
    report: {
      summary: "Warm colors and repeated circles are visible.",
      overallReading: "The composition uses visible repetition.",
      features: [
        {
          key: "colorUse",
          title: "Color use",
          observation: "Reds and yellows dominate.",
          interpretation: "A warm palette stands out.",
        },
      ],
      detailed: {
        colorUse: {
          label: "Color use",
          observation: "Reds and yellows dominate.",
          interpretation: "A warm palette stands out.",
        },
      },
      strengths: ["Clear composition"],
      suggestions: ["Try a cooler palette"],
      disclaimer: "Exploratory reflection only, not a diagnosis.",
    },
    quality: { valid: true, message: "" },
    createdAt: new Date("2026-11-26T00:00:00.000Z"),
  });

  assert.equal(response.type, "drawing");
  assert.equal(response.image.url, "/uploads/readings/drawing/1/sample.jpg");
  assert.equal(response.features[0].key, "color_use");
  assert.equal(response.proportions[0].detail, "A warm palette stands out.");
  assert.deepEqual(response.strengths, ["Clear composition"]);
});

test("drawing PDF is labeled and includes the non-diagnostic disclaimer", () => {
  const pdf = buildReadingReportPdf({
    report: {
      summary: "Warm colors and repeated circles are visible.",
      detailed: {
        colorUse: {
          label: "Color use",
          observation: "Reds and yellows dominate.",
          interpretation: "A warm palette stands out.",
        },
      },
      disclaimer: "Exploratory reflection only, not a diagnosis.",
    },
    reading: {
      _id: "68a000000000000000000100",
      feature: "drawing",
      tier: "basic",
      language: "en-US",
    },
  });

  const text = pdf.toString("latin1");
  assert.equal(pdf.subarray(0, 8).toString(), "%PDF-1.4");
  assert.match(text, /DRAWING READING REPORT/);
  assert.match(text, /Colors/);
  assert.match(text, /Exploratory reflection only, not a diagnosis/);
});
