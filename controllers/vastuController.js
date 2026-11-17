const mongoose = require("mongoose");
const VastuRequest = require("../models/vastuRequest");
const VastuReport = require("../models/vastuReport");
const { analyzeVastu } = require("../services/vastuService");
const { persistVastuUploads } = require("../services/vastuMediaService");
const { buildVastuReportPdf } = require("../services/vastuReportPdf");
const {
  buildError,
  extractPropertyInput,
  extractAddress,
  extractBirthDetails,
  parseObject,
  normalizePropertyInput,
  transitionRequest,
  serializeRequest,
  serializeReport,
  findOwnedRequestOrThrow,
  notifyUser,
} = require("../services/vastuWorkflowService");

const cleanField = (value, maxLength) => {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
};

const ensureObjectId = (value, label = "request ID") => {
  if (!mongoose.isValidObjectId(value)) {
    throw buildError(`Invalid ${label}.`);
  }
};

const mergeDefined = (target, patch) => {
  for (const [key, value] of Object.entries(patch || {})) {
    if (value !== undefined && value !== null && value !== "") target[key] = value;
  }
  return target;
};

// ---------------------------------------------------------------------------
// Existing instant AI analysis (kept for the current Flutter screen)
// ---------------------------------------------------------------------------

// POST /api/vastu/analyze
// multipart/form-data:
//   map   (required) floor-plan image
//   video (required) short house walkthrough video
//   notes, homeType, facing (optional text)
const analyze = async (req, res, next) => {
  try {
    const map = req.files?.map?.[0];
    const video = req.files?.video?.[0];

    if (!map) {
      return res.status(400).json({
        success: false,
        message: "Please upload a photo or screenshot of your floor map.",
      });
    }
    if (!video) {
      return res.status(400).json({
        success: false,
        message: "Please upload a short walkthrough video of your home.",
      });
    }

    const report = await analyzeVastu({
      map,
      video,
      notes: cleanField(req.body?.notes, 1000),
      homeType: cleanField(req.body?.homeType, 80),
      facing: cleanField(req.body?.facing, 80),
      language: req.language,
    });

    return res.json({
      success: true,
      message: "Vastu report generated",
      data: report,
    });
  } catch (error) {
    return next(error);
  }
};

// ---------------------------------------------------------------------------
// Reviewed Vastu requests
// ---------------------------------------------------------------------------

// POST /api/vastu/requests
// multipart/form-data (or JSON):
//   property, address, birthDetails as JSON strings, or flattened fields
//   floorPlan (image), photos (up to 6 images), video (optional)
const createRequest = async (req, res, next) => {
  try {
    const propertyRaw = extractPropertyInput(req.body || {});
    const normalized = normalizePropertyInput(propertyRaw);
    if (normalized.errors.length) {
      return res.status(400).json({
        success: false,
        message: normalized.errors.map((item) => item.message).join(" "),
        errors: normalized.errors,
      });
    }
    if (!normalized.value.propertyType) {
      return res.status(400).json({
        success: false,
        message: "Please select the property type (house, apartment, flat, land, shop, office or commercial building).",
      });
    }

    const address = extractAddress(req.body || {});
    const birthDetails = extractBirthDetails(req.body || {});
    const media = await persistVastuUploads(req.files || {}, req.user._id);

    const request = await VastuRequest.create({
      user: req.user._id,
      status: "submitted",
      property: normalized.value,
      address,
      media,
      birthDetails,
      concern: cleanField(req.body?.concern, 3000),
      language: cleanField(req.body?.language, 20) || "en",
      verification: {},
      statusHistory: [
        {
          status: "submitted",
          by: req.user._id,
          role: "user",
          note: "Vastu request submitted.",
        },
      ],
      submittedAt: new Date(),
      lastActionAt: new Date(),
    });

    await transitionRequest(request, {
      to: "pending_review",
      by: req.user._id,
      role: "user",
      note: "Queued for admin / astrologer review.",
    });

    await notifyUser(
      request,
      "Vastu request received",
      "Your Vastu request is pending review. We will notify you when the report is ready.",
    );

    return res.status(201).json({
      success: true,
      message: "Vastu request submitted for review",
      data: serializeRequest(request),
    });
  } catch (error) {
    return next(error);
  }
};

// GET /api/vastu/requests
const listMyRequests = async (req, res, next) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 100);
    const filter = { user: req.user._id };
    if (req.query.status) filter.status = req.query.status;

    const [requests, total] = await Promise.all([
      VastuRequest.find(filter)
        .populate("assignedTo", "name role")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      VastuRequest.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      message: "Vastu requests retrieved",
      data: requests.map((request) => serializeRequest(request)),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    });
  } catch (error) {
    return next(error);
  }
};

// GET /api/vastu/requests/:requestId
const getMyRequest = async (req, res, next) => {
  try {
    ensureObjectId(req.params.requestId);
    const request = await findOwnedRequestOrThrow({
      id: req.params.requestId,
      userId: req.user._id,
    });

    const report = await VastuReport.findOne({
      request: request._id,
      user: req.user._id,
      status: "published",
    }).lean();

    return res.json({
      success: true,
      message: "Vastu request retrieved",
      data: {
        ...serializeRequest(request),
        report: report ? serializeReport(report, { requestId: request._id }) : null,
      },
    });
  } catch (error) {
    return next(error);
  }
};

// PATCH /api/vastu/requests/:requestId/info
// Multipart or JSON. Any fields supplied here fill the reviewer's open
// "More Information Required" items and move the request back to review.
const provideMoreInfo = async (req, res, next) => {
  try {
    ensureObjectId(req.params.requestId);
    const request = await findOwnedRequestOrThrow({
      id: req.params.requestId,
      userId: req.user._id,
    });

    if (request.status !== "more_information_required") {
      throw buildError("This request is not currently waiting for more information.", 409);
    }

    const propertyRaw = extractPropertyInput(req.body || {});
    const normalized = normalizePropertyInput(propertyRaw);
    if (normalized.errors.length) {
      return res.status(400).json({
        success: false,
        message: normalized.errors.map((item) => item.message).join(" "),
        errors: normalized.errors,
      });
    }

    if (Object.keys(normalized.value).length) {
      const merged = {
        ...(request.property.toObject ? request.property.toObject() : request.property),
        ...normalized.value,
      };
      request.property = merged;
    }

    const addressPatch = parseObject(req.body?.address) || {};
    const directAddressPatch = {};
    for (const key of ["addressLine", "line", "city", "state", "pincode", "country", "mapsUrl", "googleMapsUrl", "placeId", "latitude", "longitude", "lat", "lng", "addressSource"]) {
      if (req.body?.[key] !== undefined && req.body[key] !== "") directAddressPatch[key] = req.body[key];
    }
    if (Object.keys(addressPatch).length || Object.keys(directAddressPatch).length) {
      const existingAddress = request.address.toObject ? request.address.toObject() : request.address;
      const mergedAddress = { ...existingAddress, ...addressPatch };
      for (const [key, value] of Object.entries(directAddressPatch)) {
        if (key === "addressLine") mergedAddress.line = value;
        else if (key === "googleMapsUrl") mergedAddress.mapsUrl = value;
        else if (key === "lat") mergedAddress.latitude = value;
        else if (key === "lng") mergedAddress.longitude = value;
        else if (key === "addressSource") mergedAddress.source = value;
        else mergedAddress[key] = value;
      }
      request.address = extractAddress({ address: mergedAddress });
    }

    const birthPatch = parseObject(req.body?.birthDetails) || {};
    for (const key of ["dateOfBirth", "timeOfBirth", "placeOfBirth", "latitude", "longitude", "timeZoneOffsetMinutes", "moonSign", "ascendantSign"]) {
      if (req.body?.[key] !== undefined && req.body[key] !== "") birthPatch[key] = req.body[key];
    }
    if (Object.keys(birthPatch).length) {
      const existingBirth = request.birthDetails.toObject ? request.birthDetails.toObject() : request.birthDetails;
      request.birthDetails = extractBirthDetails({ birthDetails: { ...existingBirth, ...birthPatch } });
    }

    const media = await persistVastuUploads(req.files || {}, req.user._id);
    if (media.floorPlanUrl) {
      request.media.floorPlanUrl = media.floorPlanUrl;
      request.media.floorPlanPublicId = media.floorPlanPublicId;
      request.media.floorPlanProvider = media.floorPlanProvider;
    }
    if (media.photoUrls.length) {
      request.media.photoUrls = [...(request.media.photoUrls || []), ...media.photoUrls];
      request.media.photoPublicIds = [...(request.media.photoPublicIds || []), ...media.photoPublicIds];
    }
    if (media.videoUrl) {
      request.media.videoUrl = media.videoUrl;
      request.media.videoPublicId = media.videoPublicId;
      request.media.videoProvider = media.videoProvider;
    }

    const provided = new Set([
      ...Object.keys(normalized.value),
      ...(media.floorPlanUrl ? ["floorPlan"] : []),
      ...(media.photoUrls.length ? ["photos", "floorPlan"] : []),
      ...(media.videoUrl ? ["video"] : []),
      ...(Object.keys(addressPatch).length || Object.keys(directAddressPatch).length ? ["address"] : []),
      ...(Object.keys(birthPatch).length ? ["birthDetails"] : []),
    ]);

    let resolved = 0;
    for (const item of request.missingInfo) {
      if (item.status !== "open") continue;
      const field = item.field;
      const isResolved =
        provided.has(field) ||
        (field === "floorPlan" && (request.media.floorPlanUrl || request.media.photoUrls?.length)) ||
        (field === "address" && request.address?.line) ||
        (field === "birthDetails" && request.birthDetails?.dateOfBirth);
      if (isResolved) {
        item.status = "provided";
        item.resolvedBy = req.user._id;
        item.resolvedAt = new Date();
        resolved += 1;
      }
    }

    await request.save();

    await transitionRequest(request, {
      to: "pending_review",
      by: req.user._id,
      role: "user",
      note: `Additional information supplied${resolved ? ` (${resolved} item${resolved === 1 ? "" : "s"} resolved)` : ""}.`,
    });

    await notifyUser(
      request,
      "Vastu information received",
      "Thank you. Your request is back in the review queue.",
    );

    return res.json({
      success: true,
      message: "Information submitted. Your request is back in review.",
      data: serializeRequest(request),
    });
  } catch (error) {
    return next(error);
  }
};

// POST /api/vastu/requests/:requestId/cancel
const cancelMyRequest = async (req, res, next) => {
  try {
    ensureObjectId(req.params.requestId);
    const request = await findOwnedRequestOrThrow({
      id: req.params.requestId,
      userId: req.user._id,
    });
    await transitionRequest(request, {
      to: "cancelled",
      by: req.user._id,
      role: "user",
      note: cleanField(req.body?.note, 1000) || "Cancelled by user.",
    });
    return res.json({
      success: true,
      message: "Vastu request cancelled",
      data: serializeRequest(request),
    });
  } catch (error) {
    return next(error);
  }
};

// POST /api/vastu/requests/:requestId/complete
const completeMyRequest = async (req, res, next) => {
  try {
    ensureObjectId(req.params.requestId);
    const request = await findOwnedRequestOrThrow({
      id: req.params.requestId,
      userId: req.user._id,
    });
    if (request.status !== "report_ready") {
      throw buildError("The report is not ready to be completed yet.", 409);
    }
    await transitionRequest(request, {
      to: "completed",
      by: req.user._id,
      role: "user",
      note: "Completed by user.",
    });
    return res.json({
      success: true,
      message: "Vastu request completed",
      data: serializeRequest(request),
    });
  } catch (error) {
    return next(error);
  }
};

// GET /api/vastu/requests/:requestId/report
const getMyReport = async (req, res, next) => {
  try {
    ensureObjectId(req.params.requestId);
    const request = await findOwnedRequestOrThrow({
      id: req.params.requestId,
      userId: req.user._id,
    });
    const report = await VastuReport.findOne({
      request: request._id,
      user: req.user._id,
      status: "published",
    }).lean();
    if (!report) {
      throw buildError("The reviewed report is not ready yet.", 404);
    }
    return res.json({
      success: true,
      message: "Vastu report retrieved",
      data: serializeReport(report, { requestId: request._id }),
    });
  } catch (error) {
    return next(error);
  }
};

// GET /api/vastu/requests/:requestId/report.pdf
const downloadMyReportPdf = async (req, res, next) => {
  try {
    ensureObjectId(req.params.requestId);
    const request = await findOwnedRequestOrThrow({
      id: req.params.requestId,
      userId: req.user._id,
    });
    const report = await VastuReport.findOne({
      request: request._id,
      user: req.user._id,
      status: "published",
    }).lean();
    if (!report) {
      throw buildError("The reviewed report is not ready yet.", 404);
    }
    const pdf = buildVastuReportPdf({ report, request: request.toObject() });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="vastu-report-${String(request._id)}.pdf"`,
    );
    res.setHeader("Content-Length", String(pdf.length));
    return res.send(pdf);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  analyze,
  createRequest,
  listMyRequests,
  getMyRequest,
  provideMoreInfo,
  cancelMyRequest,
  completeMyRequest,
  getMyReport,
  downloadMyReportPdf,
};
