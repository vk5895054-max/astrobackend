const express = require("express");
const { protect } = require("../middlewares/authMiddleware");
const { adminProtect } = require("../middlewares/adminMiddleware");
const {
  listRules,
  getRule,
  createRule,
  updateRule,
  setRuleEnabled,
  deleteRule,
  getRuleFields,
  validateRuleConditions,
  previewRule,
  seedRules,
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getStats,
} = require("../controllers/vastuAdminController");
const {
  listRequests,
  getRequestDetail,
  assignRequest,
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
} = require("../controllers/vastuReviewController");

const router = express.Router();

router.use(protect, adminProtect);

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

// Static paths must be registered before "/rules/:ruleId".
router.get("/rules/fields", getRuleFields);
router.post("/rules/validate", validateRuleConditions);
router.post("/rules/preview", previewRule);
router.post("/rules/seed", seedRules);

router.get("/rules", listRules);
router.post("/rules", createRule);
router.get("/rules/:ruleId", getRule);
router.patch("/rules/:ruleId", updateRule);
router.delete("/rules/:ruleId", deleteRule);
// Convenience alias: PATCH /rules/:ruleId/enabled { enabled: true|false }
router.patch("/rules/:ruleId/enabled", setRuleEnabled);
router.post("/rules/:ruleId/toggle", setRuleEnabled);

// ---------------------------------------------------------------------------
// Report templates
// ---------------------------------------------------------------------------

router.get("/templates", listTemplates);
router.post("/templates", createTemplate);
router.patch("/templates/:templateId", updateTemplate);
router.delete("/templates/:templateId", deleteTemplate);

// ---------------------------------------------------------------------------
// Dashboard + review workflow
// ---------------------------------------------------------------------------

router.get("/stats", getStats);

router.get("/requests", listRequests);
router.get("/requests/:requestId", getRequestDetail);
router.patch("/requests/:requestId/assign", assignRequest);
router.patch("/requests/:requestId/status", updateRequestStatus);
router.post("/requests/:requestId/analyze", runAnalysis);

router.get("/requests/:requestId/report", getReport);
router.patch("/requests/:requestId/report", updateReport);

router.post("/requests/:requestId/findings", addFinding);
router.patch("/requests/:requestId/findings/:findingId", updateFinding);
router.delete("/requests/:requestId/findings/:findingId", removeFinding);

router.post("/requests/:requestId/publish", publish);
router.post("/requests/:requestId/more-info", requestMoreInfo);
router.patch("/requests/:requestId/verify", verifyRequest);
router.post("/requests/:requestId/complete", completeRequest);
router.post("/requests/:requestId/reopen", reopenRequest);

module.exports = router;
