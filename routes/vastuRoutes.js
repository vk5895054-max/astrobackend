const express = require("express");
const { protect } = require("../middlewares/authMiddleware");
const {
  uploadVastuMedia,
  uploadVastuRequestMedia,
} = require("../middlewares/vastuUpload");
const {
  analyze,
  createRequest,
  listMyRequests,
  getMyRequest,
  provideMoreInfo,
  cancelMyRequest,
  completeMyRequest,
  getMyReport,
  downloadMyReportPdf,
} = require("../controllers/vastuController");

const router = express.Router();

router.use(protect);

// ---------------------------------------------------------------------------
// Instant AI analysis (legacy screen)
// ---------------------------------------------------------------------------
// Multipart with one floor-map image and one walkthrough video.
router.post("/analyze", uploadVastuMedia, analyze);

// ---------------------------------------------------------------------------
// Reviewed consultation requests
// ---------------------------------------------------------------------------

router.post("/requests", uploadVastuRequestMedia, createRequest);
router.get("/requests", listMyRequests);
router.get("/requests/:requestId", getMyRequest);
router.patch("/requests/:requestId/info", uploadVastuRequestMedia, provideMoreInfo);
router.post("/requests/:requestId/cancel", cancelMyRequest);
router.post("/requests/:requestId/complete", completeMyRequest);
router.get("/requests/:requestId/report", getMyReport);
router.get("/requests/:requestId/report.pdf", downloadMyReportPdf);

module.exports = router;
