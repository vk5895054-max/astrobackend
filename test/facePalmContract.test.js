const test = require("node:test");
const assert = require("node:assert/strict");

const ReadingReport = require("../models/readingReport");
const readingRoutes = require("../routes/readingRoutes");
const { validateReadingImage } = require("../services/readingVisionService");
const { serializeReadingReport } = require("../controllers/readingController");

const image = (bytes = 20 * 1024, mimetype = "image/jpeg") => ({
  buffer: Buffer.alloc(bytes, 1),
  mimetype,
  originalname: "photo.jpg",
  size: bytes,
});

test("unusable photos are rejected before any paid AI call", () => {
  assert.equal(validateReadingImage(null).valid, false);
  assert.equal(validateReadingImage(image(0)).valid, false);
  assert.equal(validateReadingImage(image(1024)).valid, false);
  assert.equal(validateReadingImage(image(20 * 1024, "text/plain")).valid, false);

  const valid = validateReadingImage(image());
  assert.equal(valid.valid, true);
  assert.equal(valid.message, "");
});

test("shared face-palm analyze rejects an unknown type instead of running face reading", async () => {
  const layer = readingRoutes.facePalmRoutes.stack.find(
    (item) => item.route?.path === "/analyze",
  );
  const handler = layer.route.stack.at(-1).handle;
  let status;
  let body;
  const res = {
    status(code) {
      status = code;
      return this;
    },
    json(value) {
      body = value;
      return this;
    },
  };

  await handler(
    { body: { type: "graphology" }, files: {}, user: { _id: "ignored" } },
    res,
    () => {},
  );

  assert.equal(status, 400);
  assert.equal(body.code, "INVALID_READING_TYPE");
});

test("saved report keeps stable area keys and localized observation fields", () => {
  const doc = new ReadingReport({
    user: "68a000000000000000000001",
    feature: "face",
    language: "hi-IN",
    consent: { acceptedAt: new Date() },
    report: {
      features: [
        {
          key: "forehead",
          title: "माथा",
          detail: "broad",
          observation: "चौड़ा",
          interpretation: "जिज्ञासु",
        },
      ],
    },
  });

  assert.deepEqual(doc.toObject().report.features[0], {
    key: "forehead",
    title: "माथा",
    detail: "broad",
    observation: "चौड़ा",
    interpretation: "जिज्ञासु",
  });
  assert.equal(
    serializeReadingReport(doc).features[0].key,
    "forehead",
  );
});

test("saved report is serialized into the app's FacePalmReading contract", () => {
  const doc = {
    _id: "68a000000000000000000009",
    feature: "palm",
    tier: "detailed",
    images: [{ url: "/uploads/readings/palm/1/photo.jpg", provider: "local" }],
    report: {
      summary: "The lines are clearly visible.",
      overallReading: "A balanced palm overall.",
      features: [{ title: "Heart line", detail: "Long and steady." }],
      detailed: {
        lifeLine: {
          observation: "Curved and deep",
          interpretation: "Steady energy",
        },
      },
      strengths: ["Clear lines"],
      cautions: ["Lighting can change visibility"],
      suggestions: ["Reflect on your energy"],
      disclaimer: "For entertainment only.",
    },
    quality: { valid: true, message: "" },
    billing: { isFree: true, charged: 0 },
    consent: { acceptedAt: new Date("2026-11-17T00:00:00.000Z") },
    createdAt: new Date("2026-11-17T00:00:00.000Z"),
  };

  const value = serializeReadingReport(doc);
  assert.equal(value.type, "palm");
  assert.equal(value.feature, "palm");
  assert.equal(value.image.url, doc.images[0].url);
  assert.equal(value.summary, "The lines are clearly visible.");
  assert.equal(value.interpretation, "A balanced palm overall.");
  assert.equal(value.features[0].label, "Heart line");
  assert.equal(value.features[0].interpretation, "Long and steady.");
  assert.equal(value.proportions[0].key, "life_line");
  assert.equal(value.proportions[0].detail, "Steady energy");
  assert.equal(value.quality.valid, true);
  assert.ok(
    value.suggestions.some((item) => item.includes("Lighting can change"))
  );
});
