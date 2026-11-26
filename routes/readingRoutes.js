const express = require("express");
const { protect } = require("../middlewares/authMiddleware");
const { uploadReadingImages } = require("../middlewares/readingUpload");
const {
  faceReadingController,
  palmReadingController,
  graphologyReadingController,
  drawingReadingController,
  getAnyReport,
  downloadAnyReportPdf,
  deleteAnyReport,
} = require("../controllers/readingController");

const createReadingRoutes = (controller) => {
  const router = express.Router();
  router.use(protect);

  // Static paths first so they are never shadowed by /reports/:id.
  router.get("/billing", controller.billing);
  router.post("/analyze", uploadReadingImages, controller.analyze);
  router.get("/reports", controller.listReports);
  router.get("/reports/:id/pdf", controller.downloadPdf);
  router.get("/reports/:id", controller.getReport);
  router.delete("/reports/:id", controller.deleteReport);

  return router;
};

// The Flutter app uses one shared screen for both features and sends `type`.
// This router keeps that contract while reusing the same controllers below.
// Unknown types must be rejected: silently falling back to face analysis would
// run the wrong prompt on the uploaded photo.
const pickController = (value) => {
  const type = String(value ?? "").trim().toLowerCase();
  if (type === "" || type === "face") return faceReadingController;
  if (type === "palm") return palmReadingController;
  return null;
};

const withSelectedController = (field, action) => (req, res, next) => {
  const controller = pickController(req[field]?.type);
  if (!controller) {
    return res.status(400).json({
      success: false,
      code: "INVALID_READING_TYPE",
      message: "Unknown reading type. Use 'face' or 'palm'.",
    });
  }
  return controller[action](req, res, next);
};

const facePalmRouter = express.Router();
facePalmRouter.use(protect);
facePalmRouter.get("/billing", withSelectedController("query", "billing"));
facePalmRouter.post(
  "/analyze",
  uploadReadingImages,
  withSelectedController("body", "analyze"),
);
facePalmRouter.get("/history", withSelectedController("query", "listReports"));
facePalmRouter.get("/:id/report.pdf", downloadAnyReportPdf);
facePalmRouter.get("/:id", getAnyReport);
facePalmRouter.delete("/:id", deleteAnyReport);

module.exports = {
  createReadingRoutes,
  faceReadingRoutes: createReadingRoutes(faceReadingController),
  palmReadingRoutes: createReadingRoutes(palmReadingController),
  graphologyRoutes: createReadingRoutes(graphologyReadingController),
  drawingRoutes: createReadingRoutes(drawingReadingController),
  facePalmRoutes: facePalmRouter,
};
