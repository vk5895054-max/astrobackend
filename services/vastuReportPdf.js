// Minimal, dependency-free PDF writer for Vastu reports.
//
// The server already has enough dependencies; adding a full PDF toolkit just
// for this report is unnecessary. This writes a standard PDF 1.4 document with
// the built-in Helvetica faces, automatic word wrapping and page breaks.
//
// Limitation: the built-in PDF fonts are Latin-1. Non-Latin text (for example
// Devanagari) is replaced with "?" rather than rendered as garbage. The JSON
// report always keeps the original text; this only affects the PDF export.

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const BOTTOM_LIMIT = 60;

const plain = (value) => (value && typeof value.toObject === "function" ? value.toObject() : value);

const sanitize = (value) =>
  String(value == null ? "" : value)
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2022/g, "*")
    .replace(/\u2026/g, "...")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e\n]/g, "?");

const escapePdf = (value) =>
  sanitize(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

const wrapText = (text, maxChars) => {
  const source = sanitize(text);
  const output = [];
  for (const paragraph of source.split(/\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      output.push("");
      continue;
    }
    let line = "";
    for (let word of words) {
      while (word.length > maxChars) {
        if (line) {
          output.push(line);
          line = "";
        }
        output.push(word.slice(0, maxChars));
        word = word.slice(maxChars);
      }
      if (!line) line = word;
      else if (line.length + 1 + word.length <= maxChars) line += ` ${word}`;
      else {
        output.push(line);
        line = word;
      }
    }
    if (line) output.push(line);
  }
  return output;
};

class PdfBuilder {
  constructor() {
    this.pages = [];
    this.current = [];
    this.y = PAGE_HEIGHT - MARGIN;
    this.pages.push(this.current);
  }

  newPage() {
    this.current = [];
    this.pages.push(this.current);
    this.y = PAGE_HEIGHT - MARGIN;
  }

  ensureSpace(height) {
    if (this.y - height < BOTTOM_LIMIT) this.newPage();
  }

  text(value, { size = 10, bold = false, indent = 0, gap = 4, spacing = 1.35 } = {}) {
    const font = bold ? "F2" : "F1";
    const usable = PAGE_WIDTH - MARGIN * 2 - indent;
    const maxChars = Math.max(18, Math.floor(usable / (size * 0.54)));
    const leading = size * spacing + gap;
    const lines = wrapText(value, maxChars);

    for (const line of lines) {
      this.ensureSpace(leading + BOTTOM_LIMIT);
      if (line) {
        this.current.push(
          `BT /${font} ${size} Tf ${(MARGIN + indent).toFixed(2)} ${this.y.toFixed(2)} Td (${escapePdf(line)}) Tj ET`,
        );
      }
      this.y -= leading;
    }
  }

  heading(value) {
    this.ensureSpace(24);
    this.y -= 4;
    this.text(value, { size: 13, bold: true, gap: 4 });
    this.y -= 2;
  }

  label(value) {
    this.text(value, { size: 9, bold: true, gap: 2 });
  }

  divider() {
    this.ensureSpace(14);
    this.current.push(
      `0.75 G 0.6 w ${MARGIN} ${this.y.toFixed(2)} m ${(PAGE_WIDTH - MARGIN).toFixed(2)} ${this.y.toFixed(2)} l S 0 G`,
    );
    this.y -= 10;
  }

  finish() {
    return this.pages;
  }
}

const buildObjects = (pages) => {
  const objects = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  const pageNumbers = pages.map((_, index) => 5 + index * 2);
  objects[2] = `<< /Type /Pages /Kids [${pageNumbers.map((number) => `${number} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] =
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objects[4] =
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";

  pages.forEach((content, index) => {
    const pageNumber = 5 + index * 2;
    const contentNumber = pageNumber + 1;
    const stream = content.join("\n");
    objects[pageNumber] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentNumber} 0 R >>`;
    objects[contentNumber] = `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`;
  });

  return objects;
};

const serialize = (objects) => {
  let pdf = "%PDF-1.4\n";
  const offsets = [];

  for (let index = 1; index < objects.length; index += 1) {
    offsets[index] = Buffer.byteLength(pdf, "latin1");
    pdf += `${index} 0 obj\n${objects[index]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let index = 1; index < objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
};

const formatDate = (value) => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
};

const titleCase = (value) =>
  String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const addressLines = (address = {}) => {
  const parts = [
    address.line,
    address.city,
    address.state,
    address.pincode,
    address.country,
  ].filter(Boolean);
  return parts.join(", ");
};

/**
 * Builds a printable PDF for one Vastu report.
 *
 * @param {{ report: object, request?: object }} input
 * @returns {Buffer}
 */
const buildVastuReportPdf = ({ report, request } = {}) => {
  const doc = plain(report);
  if (!doc) throw new Error("A Vastu report is required to build a PDF");

  const req = plain(request) || {};
  const property = plain(req.property) || {};
  const address = plain(req.address) || {};
  const findings = (doc.findings || [])
    .map(plain)
    .filter((finding) => finding && finding.status !== "removed" && finding.kind !== "strength");
  const pdf = new PdfBuilder();

  pdf.text("VASTU REPORT", { size: 20, bold: true, gap: 2 });
  pdf.text("Traditional Vastu guidance and interpretation", { size: 10, gap: 2 });
  const meta = [
    doc.status ? `Status: ${titleCase(doc.status)}` : "",
    doc.version ? `Version: ${doc.version}` : "",
    `Generated: ${formatDate(doc.generatedAt || doc.createdAt)}`,
    `Report ID: ${String(doc._id || "")}`,
  ]
    .filter(Boolean)
    .join("   |   ");
  pdf.text(meta, { size: 8.5, gap: 2 });
  pdf.divider();

  if (doc.score != null || doc.verdict) {
    pdf.text(
      [
        doc.score != null ? `Traditional alignment score: ${doc.score}/100` : "",
        doc.verdict ? `Verdict: ${doc.verdict}` : "",
      ]
        .filter(Boolean)
        .join("   |   "),
      { size: 11, bold: true },
    );
  }

  if (doc.summary) {
    pdf.heading("Summary");
    pdf.text(doc.summary, { size: 10 });
  }

  pdf.heading("Property overview");
  pdf.text(
    [
      `Property type: ${titleCase(property.propertyType) || "Not provided"}`,
      `House facing: ${titleCase(property.houseFacing) || "Not provided"}`,
      `Main entrance: ${titleCase(property.entranceDirection) || "Not provided"}`,
      property.totalFloors != null ? `Floors: ${property.totalFloors}` : "",
      property.bedrooms != null ? `Bedrooms: ${property.bedrooms}` : "",
      property.bathrooms != null ? `Bathrooms: ${property.bathrooms}` : "",
      property.plotArea != null
        ? `Area: ${property.plotArea} ${property.areaUnit || ""}`.trim()
        : "",
      `Address: ${addressLines(address) || "Not provided"}`,
      address.mapsUrl ? `Map: ${address.mapsUrl}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    { size: 9.5 },
  );

  const directions = (doc.directionalAssessment || []).map(plain).filter(Boolean);
  if (directions.length) {
    pdf.heading("Directional assessment");
    for (const item of directions) {
      if (item.status === "no_input" && !item.isEntrance) continue;
      const zones = (item.zones || []).map((zone) => zone.label).join(", ");
      pdf.text(
        `${item.label}: ${item.elementLabel || "element not mapped"}${item.isEntrance ? " (main entrance)" : ""}${zones ? ` - ${zones}` : ""}${item.concernCount ? `; ${item.concernCount} concern(s)` : ""}`,
        { size: 9.5, gap: 1 },
      );
    }
  }

  const zones = (doc.zoneAnalysis || []).map(plain).filter(Boolean);
  if (zones.length) {
    pdf.heading("Zone-wise analysis");
    for (const zone of zones) {
      const directionText =
        zone.directionLabel || (zone.directions || []).map(titleCase).join(", ");
      pdf.text(
        `${zone.label}: ${directionText || "not provided"} - ${titleCase(zone.status)}${zone.concernCount ? ` (${zone.concernCount} concern(s))` : ""}`,
        { size: 9.5, gap: 1 },
      );
    }
  }

  const elements = plain(doc.elementBalance);
  if (elements?.elements?.length) {
    pdf.heading("Five-element balance");
    for (const element of elements.elements) {
      pdf.text(
        `${element.label}: ${titleCase(element.status)}${element.reportedDirectionLabels?.length ? ` - ${element.reportedDirectionLabels.join(", ")}` : ""}`,
        { size: 9.5, gap: 1 },
      );
    }
    if (elements.note) pdf.text(elements.note, { size: 8.5, gap: 2 });
  }

  pdf.heading("Traditional Vastu concerns");
  if (!findings.length) {
    pdf.text("No concern was triggered by the information provided.", { size: 10 });
  } else {
    findings.forEach((finding, index) => {
      pdf.ensureSpace(50);
      pdf.text(`${index + 1}. ${finding.title}`, { size: 10.5, bold: true, gap: 1 });
      const where = [finding.zone, finding.directionLabel || finding.direction]
        .filter(Boolean)
        .join(" - ");
      pdf.text(
        `${finding.concernLabel || titleCase(finding.concern)}${where ? `   |   ${where}` : ""}`,
        { size: 8.5, gap: 2 },
      );
      if (finding.explanation) pdf.text(finding.explanation, { size: 9.5, gap: 2 });
      if (finding.remedy) pdf.text(`Suggested remedy: ${finding.remedy}`, { size: 9, gap: 3 });
      if (finding.reviewerNote) pdf.text(`Reviewer note: ${finding.reviewerNote}`, { size: 9, gap: 3 });
    });
  }

  if (doc.strengths?.length) {
    pdf.heading("What is already aligned");
    doc.strengths.forEach((item) => pdf.text(`- ${item}`, { size: 9.5, gap: 1 }));
  }

  const missing = (doc.missingInputs || []).map(plain).filter(Boolean);
  const unverified = (doc.unverifiedInputs || []).map(plain).filter(Boolean);
  if (missing.length || unverified.length) {
    pdf.heading("Missing or unverified information");
    for (const item of missing) {
      pdf.text(`Missing: ${item.label || item.field}${item.reason ? ` - ${item.reason}` : ""}`, {
        size: 9.5,
        gap: 1,
      });
    }
    for (const item of unverified) {
      pdf.text(`Unverified: ${item.label || item.field}${item.reason ? ` - ${item.reason}` : ""}`, {
        size: 9.5,
        gap: 1,
      });
    }
  }

  const location = plain(doc.locationAssessment);
  if (location) {
    pdf.heading("Location and map context");
    pdf.text(
      [
        location.addressLine ? `Address: ${location.addressLine}` : "",
        location.mapsUrl ? `Map link: ${location.mapsUrl}` : "",
        location.source ? `Source: ${titleCase(location.source)}` : "",
        `Verified: ${location.verified ? "Yes" : "No"}`,
        ...(location.limitations || []).map((item) => `Note: ${item}`),
      ]
        .filter(Boolean)
        .join("\n"),
      { size: 9 },
    );
  }

  const horoscope = plain(doc.horoscope);
  if (horoscope?.provided) {
    pdf.heading("Optional horoscope-based interpretation");
    pdf.text((horoscope.facts || []).join("\n"), { size: 9.5 });
    if (horoscope.note) pdf.text(horoscope.note, { size: 8.5, gap: 2 });
  }

  if (doc.recommendations?.length) {
    pdf.heading("Suggested corrections and remedies");
    doc.recommendations.forEach((item) => pdf.text(`- ${item}`, { size: 9.5, gap: 1 }));
  }

  if (doc.customRemarks) {
    pdf.heading("Astrologer / admin remarks");
    pdf.text(doc.customRemarks, { size: 9.5 });
  }

  if (doc.conclusion) {
    pdf.heading("Final conclusion");
    pdf.text(doc.conclusion, { size: 9.5 });
  }

  if (doc.disclaimer) {
    pdf.heading("Important note");
    pdf.text(doc.disclaimer, { size: 8.5 });
  }

  pdf.divider();
  pdf.text(
    `Traditional guidance only. Prepared${doc.approvedBy ? " and approved" : ""}${
      doc.publishedAt ? ` on ${formatDate(doc.publishedAt)}` : ""
    }. This PDF is not a structural, legal or safety report.`,
    { size: 8 },
  );

  return serialize(buildObjects(pdf.finish()));
};

module.exports = { buildVastuReportPdf, wrapText, sanitize };
