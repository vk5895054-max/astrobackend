const mongoose = require("mongoose");
const VastuRequest = require("../models/vastuRequest");
const VastuReport = require("../models/vastuReport");
const VastuRule = require("../models/vastuRule");
const User = require("../models/user");
const {
  RULE_CATEGORIES,
  ZONE_KEYS,
  FIELD_REGISTRY,
  normalizeDirection,
  normalizeConcern,
  computeScore,
  verdictFor,
  concernLabel,
  labelForField,
  titleCase,
} = require("../services/vastuRulesEngine");
const {
  STATUS_LABELS,
  buildError,
  isAdmin,
  isRequestReviewer,
  toPlain,
  transitionRequest,
  notifyUser,
  serializeRequest,
  serializeReport,
  generateReport,
  publishReport,
} = require("../services/vastuWorkflowService");

const ensureObjectId = (value, label = "request ID") => {
  if (!mongoose.isValidObjectId(value)) throw buildError(`Invalid ${label}.`);
};

const cleanText = (value, maxLength) => {
  if (value == null) return "";
  return String(value).trim().slice(0, maxLength);
};

const reviewGuard = (request, user) => {
  if (!isRequestReviewer(request, user)) {
    throw buildError("This Vastu request is assigned to another reviewer.", 403);
  }
};

const loadRequestForReview = async (id, user) => {
  ensureObjectId(id);
  const populateUser = isAdmin(user) ? "name email role" : "name role";
  const request = await VastuRequest.findById(id)
    .populate("user", populateUser)
    .populate("assignedTo", "name email role");
  if (!request) throw buildError("Vastu request not found.", 404);
  reviewGuard(request, user);
  return request;
};

const activeConcerns = (report) =>
  (report.findings || []).filter((finding) => finding.status !== "removed" && finding.kind !== "strength");

const recalculateScore = (report) => {
  const concerns = activeConcerns(report);
  if (!concerns.length) {
    report.score = 100;
    report.verdict = verdictFor(100);
    return;
  }
  report.score = computeScore(concerns);
  report.verdict = verdictFor(report.score);
};

// ---------------------------------------------------------------------------
// Request queue and detail
// ---------------------------------------------------------------------------

const listRequests = async (req, res, next) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 100);
    const filter = {};

    if (req.query.status) {
      const statuses = String(req.query.status)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      filter.status = statuses.length > 1 ? { $in: statuses } : statuses[0];
    }
    if (req.query.assignedTo === "me") filter.assignedTo = req.user._id;
    else if (req.query.assignedTo === "unassigned") filter.assignedTo = null;
    else if (req.query.assignedTo) {
      ensureObjectId(req.query.assignedTo, "assignedTo ID");
      filter.assignedTo = req.query.assignedTo;
    }

    if (req.user.role === "astrologer") {
      filter.$or = [{ assignedTo: req.user._id }, { assignedTo: null }];
    }

    if (req.query.search) {
      const search = String(req.query.search).trim().slice(0, 100);
      const matchingUsers = await User.find({ name: { $regex: search, $options: "i" } })
        .select("_id")
        .limit(50)
        .lean();
      filter.$and = [
        {
          $or: [
            { "address.line": { $regex: search, $options: "i" } },
            { "address.city": { $regex: search, $options: "i" } },
            { user: { $in: matchingUsers.map((item) => item._id) } },
          ],
        },
      ];
    }

    const [requests, total] = await Promise.all([
      VastuRequest.find(filter)
        .populate("user", "name email role")
        .populate("assignedTo", "name email role")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      VastuRequest.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      message: "Vastu requests retrieved",
      data: requests.map((request) => serializeRequest(request, { includeInternal: true })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    });
  } catch (error) {
    return next(error);
  }
};

const getRequestDetail = async (req, res, next) => {
  try {
    const request = await loadRequestForReview(req.params.requestId, req.user);
    const report = await VastuReport.findOne({ request: request._id }).lean();
    return res.json({
      success: true,
      message: "Vastu request retrieved",
      data: {
        ...serializeRequest(request, { includeInternal: true }),
        report: report ? serializeReport(report, { requestId: request._id, includeRemoved: true }) : null,
      },
    });
  } catch (error) {
    return next(error);
  }
};

// ---------------------------------------------------------------------------
// Assignment
// ---------------------------------------------------------------------------

const assignRequest = async (req, res, next) => {
  try {
    ensureObjectId(req.params.requestId);
    const request = await VastuRequest.findById(req.params.requestId);
    if (!request) throw buildError("Vastu request not found.", 404);

    const raw = req.body?.astrologerId ?? req.body?.assignedTo ?? null;
    if (raw != null && raw !== "") {
      ensureObjectId(raw, "astrologer ID");
      const reviewer = await User.findOne({
        _id: raw,
        role: { $in: ["astrologer", "admin"] },
        isActive: true,
      }).select("name role");
      if (!reviewer) throw buildError("Reviewer not found or inactive.", 404);
      request.assignedTo = reviewer._id;
      request.assignedAt = new Date();
      if (request.status === "pending_review") {
        await transitionRequest(request, {
          to: "under_review",
          by: req.user._id,
          role: req.user.role,
          note: `Assigned to ${reviewer.name || "reviewer"}.`,
        });
      } else {
        await request.save();
      }
      notifyUser(
        reviewer._id,
        "New Vastu request assigned",
        "A Vastu request has been assigned to you for review.",
        { requestId: String(request._id) },
      );
    } else {
      request.assignedTo = null;
      request.assignedAt = null;
      if (request.status === "under_review") {
        await transitionRequest(request, {
          to: "pending_review",
          by: req.user._id,
          role: req.user.role,
          note: "Reviewer unassigned; returned to the queue.",
        });
      } else {
        await request.save();
      }
    }

    return res.json({
      success: true,
      message: raw ? "Vastu request assigned" : "Vastu request unassigned",
      data: serializeRequest(request, { includeInternal: true }),
    });
  } catch (error) {
    return next(error);
  }
};

const claimRequest = async (req, res, next) => {
  try {
    ensureObjectId(req.params.requestId);
    const request = await VastuRequest.findById(req.params.requestId);
    if (!request) throw buildError("Vastu request not found.", 404);
    if (request.assignedTo && String(request.assignedTo) !== String(req.user._id) && !isAdmin(req.user)) {
      throw buildError("This Vastu request is already assigned to another reviewer.", 409);
    }
    request.assignedTo = req.user._id;
    request.assignedAt = new Date();
    if (request.status === "pending_review") {
      await transitionRequest(request, {
        to: "under_review",
        by: req.user._id,
        role: req.user.role,
        note: "Reviewer claimed the request.",
      });
    } else {
      await request.save();
    }
    return res.json({
      success: true,
      message: "Vastu request claimed",
      data: serializeRequest(request, { includeInternal: true }),
    });
  } catch (error) {
    return next(error);
  }
};

// ---------------------------------------------------------------------------
// Status + analysis
// ---------------------------------------------------------------------------

const updateRequestStatus = async (req, res, next) => {
  try {
    const request = await loadRequestForReview(req.params.requestId, req.user);
    const status = cleanText(req.body?.status, 40).toLowerCase();
    const note = cleanText(req.body?.note, 1000);
    if (!STATUS_LABELS[status]) throw buildError("Unknown request status.");

    if (status === "report_ready") {
      const report = await VastuReport.findOne({ request: request._id });
      if (!report || report.status !== "published") {
        throw buildError("Publish the report instead of setting Report Ready directly.", 409);
      }
    }
    if (status === "completed" && request.status !== "report_ready") {
      throw buildError("Only a report-ready request can be completed.", 409);
    }

    await transitionRequest(request, {
      to: status,
      by: req.user._id,
      role: req.user.role,
      note: note || `Status changed to ${STATUS_LABELS[status]}.`,
    });

    if (["more_information_required", "report_ready", "completed", "cancelled"].includes(status)) {
      notifyUser(
        request,
        `Vastu request: ${STATUS_LABELS[status]}`,
        status === "more_information_required"
          ? "The reviewer needs a little more information. Please open the app to provide it."
          : `Your Vastu request is now ${STATUS_LABELS[status].toLowerCase()}.`,
        { reportId: request.report ? String(request.report) : "" },
      );
    }

    return res.json({
      success: true,
      message: `Request moved to ${STATUS_LABELS[status]}`,
      data: serializeRequest(request, { includeInternal: true }),
    });
  } catch (error) {
    return next(error);
  }
};

const runAnalysis = async (req, res, next) => {
  try {
    const request = await loadRequestForReview(req.params.requestId, req.user);
    const regenerate = req.body?.regenerate === true;

    if (!["pending_review", "under_review", "analysis_in_progress", "report_ready"].includes(request.status)) {
      throw buildError(
        `The rule engine cannot run while the request is ${STATUS_LABELS[request.status] || request.status}.`,
        409,
      );
    }

    if (req.user.role === "astrologer" && !request.assignedTo) {
      request.assignedTo = req.user._id;
      request.assignedAt = new Date();
      await request.save();
    }

    if (request.status === "pending_review") {
      await transitionRequest(request, {
        to: "under_review",
        by: req.user._id,
        role: req.user.role,
        note: "Review started.",
      });
    }

    if (request.status === "report_ready" && !regenerate) {
      const existing = await VastuReport.findOne({ request: request._id });
      if (existing?.status === "published") {
        return res.json({
          success: true,
          message: "The published report is unchanged. Pass regenerate: true to rebuild it.",
          data: serializeReport(existing, { requestId: request._id, includeRemoved: true }),
        });
      }
    }

    if (request.status !== "analysis_in_progress") {
      await transitionRequest(request, {
        to: "analysis_in_progress",
        by: req.user._id,
        role: req.user.role,
        note: regenerate ? "Rule engine re-run requested." : "Rule engine started.",
      });
    }

    const { report, created } = await generateReport({
      request,
      reviewer: req.user,
      regenerate,
    });

    return res.json({
      success: true,
      message: created ? "Preliminary report generated" : "Preliminary report updated",
      data: serializeReport(report, { requestId: request._id, includeRemoved: true }),
      request: serializeRequest(request, { includeInternal: true }),
    });
  } catch (error) {
    return next(error);
  }
};

const getReport = async (req, res, next) => {
  try {
    const request = await loadRequestForReview(req.params.requestId, req.user);
    const report = await VastuReport.findOne({ request: request._id }).lean();
    if (!report) throw buildError("No report has been generated for this request yet.", 404);
    return res.json({
      success: true,
      message: "Vastu report retrieved",
      data: serializeReport(report, { requestId: request._id, includeRemoved: true }),
    });
  } catch (error) {
    return next(error);
  }
};

// ---------------------------------------------------------------------------
// Findings and report editing
// ---------------------------------------------------------------------------

const loadReportForEdit = async (requestId, user, { allowPublished = false } = {}) => {
  const request = await loadRequestForReview(requestId, user);
  const report = await VastuReport.findOne({ request: request._id });
  if (!report) throw buildError("Generate the preliminary report first.", 409);
  if (report.status === "published" && !allowPublished) {
    throw buildError("This report is published. Reopen it before editing findings.", 409);
  }
  return { request, report };
};

const applyFindingFields = (finding, body) => {
  if (body.title !== undefined) {
    const title = cleanText(body.title, 200);
    if (!title) throw buildError("Finding title cannot be empty.");
    finding.title = title;
  }
  if (body.zone !== undefined) finding.zone = cleanText(body.zone, 160);
  if (body.zoneKey !== undefined) {
    const zoneKey = cleanText(body.zoneKey, 80).toLowerCase();
    if (!ZONE_KEYS.includes(zoneKey)) throw buildError("Invalid zoneKey.");
    finding.zoneKey = zoneKey;
  }
  if (body.direction !== undefined) {
    const raw = cleanText(body.direction, 40);
    const direction = raw ? normalizeDirection(raw) : "";
    if (raw && !direction) throw buildError("Invalid direction.");
    finding.direction = direction;
    finding.directionLabel = direction ? titleCase(direction) : "";
  }
  if (body.concern !== undefined) {
    finding.concern = normalizeConcern(body.concern);
    finding.concernLabel = concernLabel(finding.concern);
    finding.severity = finding.concern === "moderate" ? "medium" : finding.concern;
  }
  if (body.explanation !== undefined) finding.explanation = cleanText(body.explanation, 4000);
  if (body.remedy !== undefined) finding.remedy = cleanText(body.remedy, 4000);
  if (body.reviewerNote !== undefined) finding.reviewerNote = cleanText(body.reviewerNote, 2000);
  if (body.sortOrder !== undefined) {
    const order = Number(body.sortOrder);
    if (Number.isFinite(order)) finding.sortOrder = order;
  }
};

const findingSnapshot = (finding) => ({
  title: finding.title,
  zone: finding.zone,
  zoneKey: finding.zoneKey,
  direction: finding.direction,
  directionLabel: finding.directionLabel,
  concern: finding.concern,
  concernLabel: finding.concernLabel,
  severity: finding.severity,
  explanation: finding.explanation,
  remedy: finding.remedy,
  status: "active",
  reviewerNote: finding.reviewerNote,
  sortOrder: finding.sortOrder,
});

const updateFinding = async (req, res, next) => {
  try {
    const { request, report } = await loadReportForEdit(req.params.requestId, req.user, {
      allowPublished: isAdmin(req.user),
    });
    ensureObjectId(req.params.findingId, "finding ID");
    const finding = report.findings.id(req.params.findingId);
    if (!finding) throw buildError("Finding not found in this report.", 404);

    if (req.body?.restore === true && finding.original) {
      finding.set(finding.original);
      finding.status = "active";
      finding.original = null;
      recalculateScore(report);
      report.lastEditedBy = req.user._id;
      await report.save();
      return res.json({
        success: true,
        message: "Finding restored",
        data: serializeReport(report, { requestId: request._id, includeRemoved: true }),
      });
    }

    if (!finding.original) finding.original = findingSnapshot(finding);
    applyFindingFields(finding, req.body || {});

    const status = cleanText(req.body?.status, 20).toLowerCase();
    if (status && !["active", "removed", "edited"].includes(status)) {
      throw buildError("Finding status must be active, removed or edited.");
    }
    finding.status = status || "edited";

    recalculateScore(report);
    report.lastEditedBy = req.user._id;
    await report.save();

    return res.json({
      success: true,
      message: "Finding updated",
      data: serializeReport(report, { requestId: request._id, includeRemoved: true }),
    });
  } catch (error) {
    return next(error);
  }
};

const addFinding = async (req, res, next) => {
  try {
    const { request, report } = await loadReportForEdit(req.params.requestId, req.user, {
      allowPublished: isAdmin(req.user),
    });
    const title = cleanText(req.body?.title, 200);
    if (!title) throw buildError("Finding title is required.");

    const rawDirection = cleanText(req.body?.direction, 40);
    const direction = rawDirection ? normalizeDirection(rawDirection) : "";
    if (rawDirection && !direction) throw buildError("Invalid direction.");

    const category = cleanText(req.body?.category, 80).toLowerCase();
    const zoneKey = cleanText(req.body?.zoneKey, 80).toLowerCase();
    const concern = normalizeConcern(req.body?.concern || "moderate");

    report.findings.push({
      rule: null,
      code: `manual-${Date.now()}`,
      title,
      kind: "concern",
      category: RULE_CATEGORIES.includes(category) ? category : "general",
      zone: cleanText(req.body?.zone, 160),
      zoneKey: ZONE_KEYS.includes(zoneKey) ? zoneKey : "other",
      direction,
      directionLabel: direction ? titleCase(direction) : "",
      concern,
      concernLabel: concernLabel(concern),
      severity: concern === "moderate" ? "medium" : concern,
      explanation: cleanText(req.body?.explanation, 4000),
      remedy: cleanText(req.body?.remedy, 4000),
      source: "manual",
      sourceNote: "Added by reviewer.",
      status: "active",
      reviewerNote: cleanText(req.body?.reviewerNote, 2000),
      sortOrder: Number.isFinite(Number(req.body?.sortOrder)) ? Number(req.body.sortOrder) : 999,
    });

    recalculateScore(report);
    report.lastEditedBy = req.user._id;
    await report.save();

    return res.status(201).json({
      success: true,
      message: "Manual finding added",
      data: serializeReport(report, { requestId: request._id, includeRemoved: true }),
    });
  } catch (error) {
    return next(error);
  }
};

const removeFinding = async (req, res, next) => {
  try {
    const { request, report } = await loadReportForEdit(req.params.requestId, req.user, {
      allowPublished: isAdmin(req.user),
    });
    ensureObjectId(req.params.findingId, "finding ID");
    const finding = report.findings.id(req.params.findingId);
    if (!finding) throw buildError("Finding not found in this report.", 404);
    if (!finding.original) finding.original = findingSnapshot(finding);
    finding.status = "removed";
    finding.reviewerNote = cleanText(req.body?.reviewerNote, 2000) || finding.reviewerNote;
    recalculateScore(report);
    report.lastEditedBy = req.user._id;
    await report.save();
    return res.json({
      success: true,
      message: "Finding removed from the report",
      data: serializeReport(report, { requestId: request._id, includeRemoved: true }),
    });
  } catch (error) {
    return next(error);
  }
};

const updateReport = async (req, res, next) => {
  try {
    const { request, report } = await loadReportForEdit(req.params.requestId, req.user, {
      allowPublished: isAdmin(req.user),
    });

    if (req.body?.summary !== undefined) report.summary = cleanText(req.body.summary, 5000);
    if (req.body?.conclusion !== undefined) report.conclusion = cleanText(req.body.conclusion, 5000);
    if (req.body?.customRemarks !== undefined) report.customRemarks = cleanText(req.body.customRemarks, 5000);
    if (req.body?.disclaimer !== undefined) report.disclaimer = cleanText(req.body.disclaimer, 2000);
    if (req.body?.verdict !== undefined) report.verdict = cleanText(req.body.verdict, 120);
    if (req.body?.recommendations !== undefined) {
      const list = Array.isArray(req.body.recommendations)
        ? req.body.recommendations
        : String(req.body.recommendations).split("\n");
      report.recommendations = [...new Set(list.map((item) => cleanText(item, 1000)).filter(Boolean))];
    }
    if (req.body?.score !== undefined) {
      const score = Number(req.body.score);
      if (!Number.isFinite(score) || score < 0 || score > 100) {
        throw buildError("Score must be between 0 and 100.");
      }
      report.score = Math.round(score);
      if (req.body?.verdict === undefined) report.verdict = verdictFor(report.score);
    } else if (req.body?.recalculateScore === true) {
      recalculateScore(report);
    }

    report.lastEditedBy = req.user._id;
    await report.save();

    return res.json({
      success: true,
      message: "Report updated",
      data: serializeReport(report, { requestId: request._id, includeRemoved: true }),
    });
  } catch (error) {
    return next(error);
  }
};

const publish = async (req, res, next) => {
  try {
    const request = await loadRequestForReview(req.params.requestId, req.user);
    const report = await VastuReport.findOne({ request: request._id });
    if (!report) throw buildError("Generate the preliminary report before publishing.", 409);

    if (req.user.role === "astrologer" && !request.assignedTo) {
      request.assignedTo = req.user._id;
      request.assignedAt = new Date();
      await request.save();
    }

    await publishReport({ report, request, user: req.user });

    return res.json({
      success: true,
      message: "Vastu report published",
      data: serializeReport(report, { requestId: request._id, includeRemoved: true }),
      request: serializeRequest(request, { includeInternal: true }),
    });
  } catch (error) {
    return next(error);
  }
};

// ---------------------------------------------------------------------------
// Missing info, verification, completion
// ---------------------------------------------------------------------------

const requestMoreInfo = async (req, res, next) => {
  try {
    const request = await loadRequestForReview(req.params.requestId, req.user);
    const note = cleanText(req.body?.note, 1000);
    const rawFields = Array.isArray(req.body?.fields)
      ? req.body.fields
      : req.body?.field
        ? [req.body]
        : [];

    if (!rawFields.length && !note) {
      throw buildError("Provide at least one field or a note explaining what is missing.");
    }

    const existingOpen = new Set(
      (request.missingInfo || []).filter((item) => item.status === "open").map((item) => item.field),
    );

    let added = 0;
    for (const item of rawFields) {
      const field = cleanText(item?.field, 120);
      if (!field || existingOpen.has(field)) continue;
      request.missingInfo.push({
        field,
        label: cleanText(item?.label, 160) || labelForField(field),
        reason: cleanText(item?.reason, 1000) || note || "The reviewer needs this information to complete the report.",
        status: "open",
        requestedBy: req.user._id,
        requestedAt: new Date(),
      });
      existingOpen.add(field);
      added += 1;
    }

    await request.save();

    await transitionRequest(request, {
      to: "more_information_required",
      by: req.user._id,
      role: req.user.role,
      note: note || `More information requested${added ? ` (${added} item${added === 1 ? "" : "s"})` : ""}.`,
    });

    notifyUser(
      request,
      "More information needed for your Vastu report",
      note || "The reviewer needs a little more information. Please open the app to provide it.",
    );

    return res.json({
      success: true,
      message: "More information requested from the user",
      data: serializeRequest(request, { includeInternal: true }),
    });
  } catch (error) {
    return next(error);
  }
};

const verifyRequest = async (req, res, next) => {
  try {
    const request = await loadRequestForReview(req.params.requestId, req.user);
    const body = req.body || {};
    const hasAny =
      body.address !== undefined ||
      body.directions !== undefined ||
      body.media !== undefined ||
      body.addressVerified !== undefined ||
      body.directionsVerified !== undefined ||
      body.mediaVerified !== undefined;
    if (!hasAny) throw buildError("Provide at least one verification flag.");

    const verification = request.verification || {};
    const address =
      body.address !== undefined ? body.address === true : body.addressVerified === true ? true : undefined;
    const directions =
      body.directions !== undefined
        ? body.directions === true
        : body.directionsVerified === true
          ? true
          : undefined;
    const media =
      body.media !== undefined ? body.media === true : body.mediaVerified === true ? true : undefined;

    if (address !== undefined) verification.addressVerified = address;
    if (directions !== undefined) verification.directionsVerified = directions;
    if (media !== undefined) verification.mediaVerified = media;
    verification.verifiedBy = req.user._id;
    verification.verifiedAt = new Date();
    if (body.note !== undefined) verification.note = cleanText(body.note, 1000);
    request.verification = verification;
    await request.save();

    const report = await VastuReport.findOne({ request: request._id });
    if (report) {
      if (report.locationAssessment) {
        report.locationAssessment.verified = verification.addressVerified === true;
      }
      const unverified = [];
      if (verification.addressVerified !== true) {
        unverified.push({
          field: "address",
          label: "Address / location context",
          reason: "The address and map context were supplied by the user and have not been verified by the reviewer.",
        });
      }
      if (verification.directionsVerified !== true) {
        unverified.push({
          field: "directions",
          label: "Reported directions",
          reason: "Room and entrance directions are user-reported; the reviewer should confirm them before finalising.",
        });
      }
      if (verification.mediaVerified !== true) {
        unverified.push({
          field: "media",
          label: "Floor plan, photos and video",
          reason: "Uploaded media has not been checked for clarity or completeness.",
        });
      }
      report.unverifiedInputs = unverified;
      report.lastEditedBy = req.user._id;
      await report.save();
    }

    return res.json({
      success: true,
      message: "Verification updated",
      data: serializeRequest(request, { includeInternal: true }),
    });
  } catch (error) {
    return next(error);
  }
};

const completeRequest = async (req, res, next) => {
  try {
    const request = await loadRequestForReview(req.params.requestId, req.user);
    if (request.status !== "report_ready") {
      throw buildError("Only a report-ready request can be completed.", 409);
    }
    await transitionRequest(request, {
      to: "completed",
      by: req.user._id,
      role: req.user.role,
      note: cleanText(req.body?.note, 1000) || "Review completed.",
    });
    notifyUser(
      request,
      "Vastu consultation completed",
      "Your Vastu consultation is complete. The report remains available in the app.",
    );
    return res.json({
      success: true,
      message: "Vastu request completed",
      data: serializeRequest(request, { includeInternal: true }),
    });
  } catch (error) {
    return next(error);
  }
};

const reopenRequest = async (req, res, next) => {
  try {
    if (!isAdmin(req.user)) throw buildError("Admin access required.", 403);
    ensureObjectId(req.params.requestId);
    const request = await VastuRequest.findById(req.params.requestId);
    if (!request) throw buildError("Vastu request not found.", 404);
    if (!["report_ready", "completed"].includes(request.status)) {
      throw buildError("Only a report-ready or completed request can be reopened.", 409);
    }

    if (request.status === "completed") {
      await transitionRequest(request, {
        to: "report_ready",
        by: req.user._id,
        role: req.user.role,
        note: "Reopening for changes.",
      });
    }
    await transitionRequest(request, {
      to: "analysis_in_progress",
      by: req.user._id,
      role: req.user.role,
      note: cleanText(req.body?.note, 1000) || "Report reopened for review.",
    });

    const report = await VastuReport.findOne({ request: request._id });
    if (report) {
      report.status = "draft";
      report.publishedAt = null;
      report.approvedBy = null;
      report.lastEditedBy = req.user._id;
      await report.save();
    }

    return res.json({
      success: true,
      message: "Vastu request reopened for review",
      data: serializeRequest(request, { includeInternal: true }),
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listRequests,
  getRequestDetail,
  assignRequest,
  claimRequest,
  updateRequestStatus,
  runAnalysis,
  getReport,
  updateFinding,
  addFinding,
  removeFinding,
  updateReport,
  publish,
  requestMoreInfo,
  verifyRequest,
  completeRequest,
  reopenRequest,
};
