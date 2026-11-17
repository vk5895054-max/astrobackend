const VastuRule = require("../models/vastuRule");
const VastuReport = require("../models/vastuReport");
const VastuRequest = require("../models/vastuRequest");
const VastuReportTemplate = require("../models/vastuReportTemplate");
const {
  canTransition,
  normalizePropertyInput,
  normalizeBirthDetails,
  buildReportData,
  DEFAULT_TEMPLATE_SECTIONS,
  DISCLAIMER,
  FIELD_REGISTRY,
  REQUEST_STATUSES,
  titleCase,
} = require("./vastuRulesEngine");
const { ensureVastuDefaults } = require("./vastuSeedService");
const { sendNotificationToUser } = require("./notificationService");

const STATUS_LABELS = {
  submitted: "Submitted",
  pending_review: "Pending Review",
  under_review: "Under Review",
  analysis_in_progress: "Analysis in Progress",
  report_ready: "Report Ready",
  completed: "Completed",
  more_information_required: "More Information Required",
  cancelled: "Cancelled",
};

const buildError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.expose = true;
  return error;
};

const isAdmin = (user) => user?.role === "admin";
const isAstrologer = (user) => user?.role === "astrologer" || isAdmin(user);

const toPlain = (value) => (value && typeof value.toObject === "function" ? value.toObject() : value);

const parseObject = (value) => {
  if (value == null || value === "") return null;
  if (typeof value === "object") return toPlain(value);
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (_) {
    return null;
  }
};

const extractPropertyInput = (body = {}) => {
  const nested = parseObject(body.property) || {};
  const source = { ...nested };
  for (const field of Object.keys(FIELD_REGISTRY)) {
    if (FIELD_REGISTRY[field].derived) continue;
    if (body[field] !== undefined && body[field] !== "") source[field] = body[field];
  }
  return source;
};

const extractLatLngFromMapsUrl = (value) => {
  const url = String(value || "");
  if (!url) return null;
  const patterns = [
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /[?&]q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
    /[?&]ll=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      const latitude = Number(match[1]);
      const longitude = Number(match[2]);
      if (
        Number.isFinite(latitude) &&
        Number.isFinite(longitude) &&
        Math.abs(latitude) <= 90 &&
        Math.abs(longitude) <= 180
      ) {
        return { latitude, longitude };
      }
    }
  }
  return null;
};

const extractAddress = (body = {}) => {
  const nested = parseObject(body.address) || {};
  const raw = {
    ...nested,
    line: nested.line || nested.addressLine || body.addressLine || "",
    mapsUrl: nested.mapsUrl || nested.googleMapsUrl || body.mapsUrl || body.googleMapsUrl || "",
    placeId: nested.placeId || body.placeId || "",
    latitude: nested.latitude ?? nested.lat ?? body.latitude ?? body.lat ?? null,
    longitude: nested.longitude ?? nested.lng ?? body.longitude ?? body.lng ?? null,
    source: nested.source || body.addressSource || "",
    contextNotes: nested.contextNotes || nested.notes || body.addressContext || "",
  };

  const address = {
    line: String(raw.line || "").trim().slice(0, 500),
    city: String(nested.city || body.city || "").trim().slice(0, 120),
    state: String(nested.state || body.state || "").trim().slice(0, 120),
    pincode: String(nested.pincode || body.pincode || "").trim().slice(0, 20),
    country: String(nested.country || body.country || "India").trim().slice(0, 120),
    mapsUrl: String(raw.mapsUrl || "").trim().slice(0, 2000),
    placeId: String(raw.placeId || "").trim().slice(0, 300),
    latitude: null,
    longitude: null,
    source: "manual",
    contextNotes: String(raw.contextNotes || "").trim().slice(0, 2000),
  };

  if (address.mapsUrl && !/^https?:\/\//i.test(address.mapsUrl)) {
    throw buildError("The Google Maps link must start with http:// or https://");
  }

  const parsedFromUrl = extractLatLngFromMapsUrl(address.mapsUrl);
  const latitude = raw.latitude ?? parsedFromUrl?.latitude ?? null;
  const longitude = raw.longitude ?? parsedFromUrl?.longitude ?? null;

  if (latitude != null && latitude !== "") {
    const number = Number(latitude);
    if (!Number.isFinite(number) || Math.abs(number) > 90) {
      throw buildError("Latitude must be between -90 and 90");
    }
    address.latitude = number;
  }
  if (longitude != null && longitude !== "") {
    const number = Number(longitude);
    if (!Number.isFinite(number) || Math.abs(number) > 180) {
      throw buildError("Longitude must be between -180 and 180");
    }
    address.longitude = number;
  }

  const source = String(raw.source || "").trim().toLowerCase();
  if (["manual", "google_maps_link", "places_search", "map_pin"].includes(source)) {
    address.source = source;
  } else if (address.mapsUrl) {
    address.source = "google_maps_link";
  } else if (address.placeId) {
    address.source = "places_search";
  } else if (address.latitude != null && address.longitude != null) {
    address.source = "map_pin";
  }

  if (
    !address.line &&
    !address.mapsUrl &&
    !address.placeId &&
    (address.latitude == null || address.longitude == null)
  ) {
    throw buildError(
      "Please provide an address, a Google Maps link, a place ID, or a map pin (latitude/longitude).",
    );
  }

  return address;
};

const extractBirthDetails = (body = {}) => {
  const nested = parseObject(body.birthDetails) || {};
  const source = { ...nested };
  for (const field of [
    "dateOfBirth",
    "timeOfBirth",
    "placeOfBirth",
    "latitude",
    "longitude",
    "timeZoneOffsetMinutes",
    "moonSign",
    "ascendantSign",
  ]) {
    if (body[field] !== undefined && body[field] !== "") source[field] = body[field];
  }
  const normalized = normalizeBirthDetails(source);
  if (normalized.errors.length) {
    throw buildError(normalized.errors.map((item) => item.message).join(" "));
  }
  return normalized.value;
};

const addHistory = (request, { status, by, role, note = "" }) => {
  request.statusHistory.push({
    status,
    by: by || null,
    role: role || "system",
    note: String(note || "").slice(0, 1000),
    at: new Date(),
  });
  request.lastActionAt = new Date();
};

const transitionRequest = async (request, { to, by, role, note = "" }) => {
  if (!REQUEST_STATUSES.includes(to)) {
    throw buildError(`Unknown request status: ${to}`);
  }
  if (request.status === to) return request;
  if (!canTransition(request.status, to)) {
    throw buildError(`A request cannot move from ${STATUS_LABELS[request.status] || request.status} to ${STATUS_LABELS[to] || to}.`);
  }

  addHistory(request, { status: to, by, role, note });
  request.status = to;
  if (to === "under_review" && !request.reviewStartedAt) request.reviewStartedAt = new Date();
  if (to === "completed") request.completedAt = new Date();
  if (to !== "completed") request.completedAt = null;
  await request.save();
  return request;
};

const notifyUser = (request, title, body, data = {}) => {
  if (!request?.user) return Promise.resolve();
  return sendNotificationToUser({
    userId: request.user,
    title,
    body,
    data: {
      type: "vastu",
      requestId: String(request._id),
      status: request.status,
      ...data,
    },
  }).catch(() => {});
};

const serializeStatusHistory = (history = []) =>
  history.map((item) => {
    const plain = toPlain(item) || {};
    return {
      status: plain.status,
      label: STATUS_LABELS[plain.status] || titleCase(plain.status),
      note: plain.note || "",
      role: plain.role || "system",
      by: plain.by ? String(plain.by) : null,
      at: plain.at,
    };
  });

const serializeRequest = (request, { includeInternal = false } = {}) => {
  const plain = toPlain(request) || {};
  const assigned = toPlain(plain.assignedTo);
  return {
    id: String(plain._id),
    status: plain.status,
    statusLabel: STATUS_LABELS[plain.status] || titleCase(plain.status),
    property: plain.property || {},
    address: plain.address || {},
    media: plain.media || {},
    birthDetails: plain.birthDetails || {},
    concern: plain.concern || "",
    language: plain.language || "en",
    missingInfo: (plain.missingInfo || []).map((item) => {
      const info = toPlain(item) || {};
      return {
        id: info._id ? String(info._id) : undefined,
        field: info.field,
        label: info.label || "",
        reason: info.reason || "",
        status: info.status || "open",
        requestedAt: info.requestedAt,
        resolvedAt: info.resolvedAt,
        value: info.value || "",
      };
    }),
    verification: plain.verification || {},
    assignedTo: assigned
      ? { id: String(assigned._id || assigned), name: assigned.name || "", role: assigned.role || "" }
      : null,
    reportId: plain.report ? String(plain.report) : null,
    statusHistory: serializeStatusHistory(plain.statusHistory),
    submittedAt: plain.submittedAt,
    reviewStartedAt: plain.reviewStartedAt,
    completedAt: plain.completedAt,
    lastActionAt: plain.lastActionAt,
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt,
    ...(includeInternal
      ? {
          user: assignedUser(plain.user),
        }
      : {}),
  };
};

const assignedUser = (value) => {
  const user = toPlain(value);
  if (!user) return null;
  if (typeof user === "string") return { id: user };
  return {
    id: String(user._id || user.id || ""),
    name: user.name || "",
    email: user.email || "",
    role: user.role || "",
  };
};

const serializeReport = (report, { requestId, includeRemoved = false } = {}) => {
  const plain = toPlain(report);
  if (!plain) return null;
  const findings = (plain.findings || [])
    .map(toPlain)
    .filter((finding) => includeRemoved || finding.status !== "removed")
    .map((finding) => ({
      id: finding._id ? String(finding._id) : undefined,
      ruleId: finding.rule ? String(finding.rule) : null,
      code: finding.code || "",
      title: finding.title,
      kind: finding.kind || "concern",
      category: finding.category || "general",
      zone: finding.zone || "",
      zoneKey: finding.zoneKey || "other",
      direction: finding.direction || "",
      directionLabel: finding.directionLabel || (finding.direction ? titleCase(finding.direction) : ""),
      concern: finding.concern || "moderate",
      concernLabel: finding.concernLabel || `${titleCase(finding.concern || "moderate")} Concern`,
      // Compatibility with the existing Flutter report model.
      severity: finding.severity || (finding.concern === "moderate" ? "medium" : finding.concern || "medium"),
      explanation: finding.explanation || "",
      remedy: finding.remedy || "",
      source: finding.source || "rule",
      sourceNote: finding.sourceNote || "",
      status: finding.status || "active",
      reviewerNote: finding.reviewerNote || "",
      sortOrder: finding.sortOrder || 0,
    }))
    .sort(
      (a, b) =>
        ({ high: 0, moderate: 1, low: 2 }[a.concern] ?? 1) -
          ({ high: 0, moderate: 1, low: 2 }[b.concern] ?? 1) ||
        a.sortOrder - b.sortOrder,
    );

  return {
    id: String(plain._id),
    requestId: String(plain.request || requestId || ""),
    status: plain.status,
    version: plain.version || 1,
    score: plain.score,
    verdict: plain.verdict || "",
    summary: plain.summary || "",
    conclusion: plain.conclusion || "",
    customRemarks: plain.customRemarks || "",
    strengths: plain.strengths || [],
    findings,
    doshas: findings,
    zoneAnalysis: plain.zoneAnalysis || [],
    directionalAssessment: plain.directionalAssessment || [],
    elementBalance: plain.elementBalance || null,
    horoscope: plain.horoscope || null,
    missingInputs: plain.missingInputs || [],
    unverifiedInputs: plain.unverifiedInputs || [],
    locationAssessment: plain.locationAssessment || null,
    recommendations: plain.recommendations || [],
    sections: plain.sections || [],
    disclaimer: plain.disclaimer || DISCLAIMER,
    ruleStats: plain.ruleStats || null,
    generatedAt: plain.generatedAt,
    publishedAt: plain.publishedAt,
    approvedBy: plain.approvedBy ? String(plain.approvedBy) : null,
    downloadUrl:
      plain.status === "published"
        ? `/api/vastu/requests/${String(plain.request || requestId || "")}/report.pdf`
        : null,
  };
};

const getEnabledRules = async () => {
  await ensureVastuDefaults();
  return VastuRule.find({ enabled: true }).sort({ sortOrder: 1, createdAt: 1 }).lean();
};

const getDefaultTemplate = async () => {
  const template = await VastuReportTemplate.findOne({ isDefault: true }).lean();
  if (template) return template;
  return {
    _id: null,
    name: "Default Vastu report",
    sections: DEFAULT_TEMPLATE_SECTIONS,
    disclaimer: DISCLAIMER,
  };
};

const generateReport = async ({ request, reviewer = null, regenerate = false } = {}) => {
  const existing = await VastuReport.findOne({ request: request._id });
  if (existing && existing.status === "published" && !regenerate) {
    return { report: existing, created: false, existingPublished: true };
  }
  if (existing && !regenerate) {
    return { report: existing, created: false, existingPublished: false };
  }

  const [rules, template] = await Promise.all([getEnabledRules(), getDefaultTemplate()]);
  const data = buildReportData({ request, rules, template, reviewer });

  let manualFindings = [];
  let removedCodes = new Set();
  let reviewerNotes = new Map();
  if (existing) {
    for (const finding of existing.findings) {
      if (finding.source === "manual") manualFindings.push(finding.toObject ? finding.toObject() : finding);
      if (finding.source === "rule" && finding.status === "removed") removedCodes.add(finding.code);
      if (finding.reviewerNote) reviewerNotes.set(finding.code, finding.reviewerNote);
    }
  }

  const ruleFindings = data.findings
    .filter((finding) => !removedCodes.has(finding.code))
    .map((finding) => ({
      ...finding,
      reviewerNote: reviewerNotes.get(finding.code) || "",
    }));

  const reportPayload = {
    request: request._id,
    user: request.user,
    template: template._id || null,
    sections: data.template,
    status: "draft",
    version: existing
      ? existing.status === "published"
        ? (existing.version || 1) + 1
        : Math.max(existing.version || 1, 1)
      : 1,
    score: data.score,
    verdict: data.verdict,
    summary: data.summary,
    conclusion: existing?.conclusion || "",
    customRemarks: existing?.customRemarks || "",
    strengths: data.strengths,
    findings: [...ruleFindings, ...manualFindings],
    zoneAnalysis: data.zoneAnalysis,
    directionalAssessment: data.directionalAssessment,
    elementBalance: data.elementBalance,
    horoscope: data.horoscope,
    missingInputs: data.missingInputs,
    unverifiedInputs: data.unverifiedInputs,
    locationAssessment: data.locationAssessment,
    recommendations: data.recommendations,
    disclaimer: template.disclaimer || data.disclaimer,
    ruleStats: data.ruleStats,
    generatedAt: new Date(),
    generatedBy: reviewer?._id || null,
    approvedBy: null,
    publishedAt: null,
    lastEditedBy: reviewer?._id || null,
  };

  let report;
  if (existing) {
    existing.set(reportPayload);
    report = await existing.save();
  } else {
    report = await VastuReport.create(reportPayload);
  }

  if (!request.report || String(request.report) !== String(report._id)) {
    request.report = report._id;
    await request.save();
  }

  return { report, created: !existing, existingPublished: false };
};

const publishReport = async ({ report, request, user }) => {
  if (!report) throw buildError("Generate the report before publishing it.", 409);
  if (!(report.findings || []).some((finding) => finding.status === "active")) {
    // An empty report is allowed only when the reviewer has added a summary or
    // conclusion, otherwise publishing nothing would look like a completed review.
    if (!report.summary && !report.conclusion && !report.customRemarks) {
      throw buildError("Add at least one active finding or a conclusion before publishing.", 409);
    }
  }

  report.status = "published";
  report.approvedBy = user._id;
  report.publishedAt = new Date();
  report.lastEditedBy = user._id;
  await report.save();

  if (request.status !== "report_ready") {
    if (canTransition(request.status, "report_ready")) {
      await transitionRequest(request, {
        to: "report_ready",
        by: user._id,
        role: user.role,
        note: "Report approved and published by reviewer.",
      });
    } else if (request.status === "report_ready") {
      request.lastActionAt = new Date();
      await request.save();
    } else {
      throw buildError(
        `The report cannot be published while the request is ${STATUS_LABELS[request.status] || request.status}.`,
        409,
      );
    }
  }

  notifyUser(
    request,
    "Your Vastu report is ready",
    "Your Vastu report has been reviewed and published. Open the app to read it.",
    { reportId: String(report._id) },
  );

  return report;
};

const isRequestReviewer = (request, user) => {
  if (!user) return false;
  if (isAdmin(user)) return true;
  if (user.role !== "astrologer") return false;
  if (!request.assignedTo) return true;
  return String(request.assignedTo) === String(user._id);
};

const findRequestOrThrow = async (id) => {
  const request = await VastuRequest.findById(id).populate("assignedTo", "name email role");
  if (!request) throw buildError("Vastu request not found.", 404);
  return request;
};

const findOwnedRequestOrThrow = async ({ id, userId }) => {
  const request = await VastuRequest.findOne({ _id: id, user: userId }).populate(
    "assignedTo",
    "name email role",
  );
  if (!request) throw buildError("Vastu request not found.", 404);
  return request;
};

module.exports = {
  STATUS_LABELS,
  buildError,
  isAdmin,
  isAstrologer,
  isRequestReviewer,
  toPlain,
  parseObject,
  extractPropertyInput,
  extractAddress,
  extractBirthDetails,
  addHistory,
  transitionRequest,
  notifyUser,
  serializeRequest,
  serializeReport,
  serializeStatusHistory,
  getEnabledRules,
  getDefaultTemplate,
  generateReport,
  publishReport,
  findRequestOrThrow,
  findOwnedRequestOrThrow,
  normalizePropertyInput,
};
