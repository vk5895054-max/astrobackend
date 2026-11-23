// Dependency-free PDF export for Face Reading / Palm Reading reports.
// Reuses the PDF primitives from the Vastu report writer.

const { PdfBuilder, buildObjects, serialize } = require("./vastuReportPdf");
const {
  getAreaLabel,
  findAreaId,
  normalizeLocale,
} = require("./readingLocalizationService");

const plain = (value) =>
  value && typeof value.toObject === "function" ? value.toObject() : value;

const titleCase = (value) =>
  String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const formatDate = (value) => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
};

const list = (value) =>
  (Array.isArray(value) ? value : [])
    .map((item) => (typeof item === "string" ? item : item?.detail || item?.title || ""))
    .map((item) => String(item).trim())
    .filter(Boolean);

const buildReadingReportPdf = ({ report, reading } = {}) => {
  const doc = plain(report);
  if (!doc) throw new Error("A reading report is required to build a PDF");

  const entry = plain(reading) || {};
  const featureKey = ["face", "palm", "graphology"].includes(entry.feature)
    ? entry.feature
    : "face";
  const feature = featureKey.toUpperCase();
  // The built-in PDF font is Latin-1 only: Devanagari labels would be rendered
  // as "?". Keep the structural labels in English for Hindi PDFs while using
  // the Latin-script Hinglish labels for en-IN. The JSON report always keeps
  // the fully localized labels.
  const pdfLanguage =
    normalizeLocale(entry.language) === "hi-IN"
      ? "en-US"
      : normalizeLocale(entry.language);
  const areaLabel = (id, fallback) =>
    getAreaLabel(featureKey, id, pdfLanguage) || fallback || titleCase(id);
  const pdf = new PdfBuilder();

  pdf.text(`${feature} READING REPORT`, { size: 20, bold: true, gap: 2 });
  pdf.text(
    featureKey === "graphology"
      ? "Entertainment-focused interpretation based on visible handwriting"
      : "Traditional interpretation based on visible features",
    {
    size: 10,
    gap: 2,
    }
  );
  pdf.text(
    [
      `Report ID: ${String(entry._id || "")}`,
      `Type: ${titleCase(entry.tier || "basic")}`,
      `Generated: ${formatDate(entry.createdAt)}`,
    ]
      .filter(Boolean)
      .join("   |   "),
    { size: 8.5, gap: 2 }
  );
  pdf.divider();

  if (doc.summary) {
    pdf.heading("Summary");
    pdf.text(doc.summary, { size: 10 });
  }

  if (doc.overallReading) {
    pdf.heading("Overall reading");
    pdf.text(doc.overallReading, { size: 10 });
  }

  const features = Array.isArray(doc.features) ? doc.features : [];
  if (features.length) {
    pdf.heading("Feature-wise interpretation");
    features.forEach((item, index) => {
      const point = plain(item) || {};
      const id = point.key || findAreaId(featureKey, point.title);
      pdf.text(`${index + 1}. ${areaLabel(id, point.title || "Observation")}`, {
        size: 10.5,
        bold: true,
        gap: 1,
      });
      if (point.detail) pdf.text(point.detail, { size: 9.5, gap: 3 });
    });
  }

  const detailed = plain(doc.detailed) || {};
  const detailedEntries = Object.entries(detailed).filter(([, value]) => {
    const item = plain(value) || {};
    return item.observation || item.interpretation;
  });
  if (detailedEntries.length) {
    pdf.heading("Detailed observations");
    for (const [key, value] of detailedEntries) {
      const item = plain(value) || {};
      pdf.text(areaLabel(key), { size: 10, bold: true, gap: 1 });
      if (item.observation) pdf.text(`Observed: ${item.observation}`, { size: 9.5, gap: 1 });
      if (item.interpretation) pdf.text(`Interpretation: ${item.interpretation}`, { size: 9.5, gap: 3 });
    }
  }

  const strengths = list(doc.strengths);
  if (strengths.length) {
    pdf.heading("Strengths");
    strengths.forEach((item) => pdf.text(`- ${item}`, { size: 9.5, gap: 1 }));
  }

  const cautions = list(doc.cautions);
  if (cautions.length) {
    pdf.heading("Things to keep in mind");
    cautions.forEach((item) => pdf.text(`- ${item}`, { size: 9.5, gap: 1 }));
  }

  const suggestions = list(doc.suggestions);
  if (suggestions.length) {
    pdf.heading("Suggestions");
    suggestions.forEach((item) => pdf.text(`- ${item}`, { size: 9.5, gap: 1 }));
  }

  pdf.divider();
  pdf.text(
    doc.disclaimer ||
      "For entertainment and self-reflection only. Not a medical, psychological, legal or financial assessment.",
    { size: 8 }
  );

  return serialize(buildObjects(pdf.finish()));
};

module.exports = { buildReadingReportPdf };
