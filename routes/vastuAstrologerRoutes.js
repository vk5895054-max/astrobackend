const express = require("express");
const { protect } = require("../middlewares/authMiddleware");
const { astrologerOnly } = require("../middlewares/roleMiddleware");
const {
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
} = require("../controllers/vastuReviewController");

const router = express.Router();

router.use(protect, astrologerOnly);

// Queue and single request
router.get("/requests", listRequests);
router.get("/requests/:requestId", getRequestDetail);
router.post("/requests/:requestId/claim", claimRequest);
router.patch("/requests/:requestId/status", updateRequestStatus);

// Rule engine + report editing
router.post("/requests/:requestId/analyze", runAnalysis);
router.get("/requests/:requestId/report", getReport);
router.patch("/requests/:requestId/report", updateReport);

router.post("/requests/:requestId/findings", addFinding);
router.patch("/requests/:requestId/findings/:findingId", updateFinding);
router.delete("/requests/:requestId/findings/:findingId", removeFinding);

// Publishing and follow-up
router.post("/requests/:requestId/publish", publish);
router.post("/requests/:requestId/more-info", requestMoreInfo);
router.patch("/requests/:requestId/verify", verifyRequest);
router.post("/requests/:requestId/complete", completeRequest);

// Admins may reassign while acting in the astrologer console.
router.patch("/requests/:requestId/assign", assignRequest);

module.exports = router;
