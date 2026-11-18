const express = require("express");
const { protect } = require("../middlewares/authMiddleware");
const { adminProtect } = require("../middlewares/adminMiddleware");
const { createReadingAdminController } = require("../controllers/readingAdminController");

const createReadingAdminRoutes = (feature) => {
  const router = express.Router();
  router.use(protect, adminProtect);

  const controller = createReadingAdminController(feature);
  router.get("/stats", controller.getStats);
  router.get("/reports", controller.listReports);
  router.get("/reports/:id", controller.getReport);
  router.delete("/reports/:id", controller.deleteReport);

  return router;
};

module.exports = {
  createReadingAdminRoutes,
  faceReadingAdminRoutes: createReadingAdminRoutes("face"),
  palmReadingAdminRoutes: createReadingAdminRoutes("palm"),
};
