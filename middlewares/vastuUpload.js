const multer = require("multer");

const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const VIDEO_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/3gpp",
  "video/x-m4v",
]);

const uploadVastuMedia = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 30 * 1024 * 1024,
    files: 2,
  },
  fileFilter: (req, file, callback) => {
    const isMap =
      file.fieldname === "map" && IMAGE_TYPES.has(file.mimetype);
    const isVideo =
      file.fieldname === "video" && VIDEO_TYPES.has(file.mimetype);
    if (isMap || isVideo) return callback(null, true);
    callback(
      new Error(
        "Only a floor-map image (JPG, PNG, WebP or HEIC) and an MP4, MOV or WebM video are allowed.",
      ),
    );
  },
}).fields([
  { name: "map", maxCount: 1 },
  { name: "video", maxCount: 1 },
]);

// The full request flow accepts a floor plan, up to six property photos, and
// an optional walkthrough video. Files stay in memory only until the controller
// stores them through services/vastuMediaService.js.
const uploadVastuRequestMedia = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 30 * 1024 * 1024,
    files: 8,
  },
  fileFilter: (req, file, callback) => {
    if (file.fieldname === "floorPlan" && IMAGE_TYPES.has(file.mimetype)) {
      return callback(null, true);
    }
    if (file.fieldname === "photos" && IMAGE_TYPES.has(file.mimetype)) {
      return callback(null, true);
    }
    if (file.fieldname === "video" && VIDEO_TYPES.has(file.mimetype)) {
      return callback(null, true);
    }
    callback(
      new Error(
        "Only floor plan/photo images (JPG, PNG, WebP or HEIC) and an MP4, MOV or WebM video are allowed.",
      ),
    );
  },
}).fields([
  { name: "floorPlan", maxCount: 1 },
  { name: "photos", maxCount: 6 },
  { name: "video", maxCount: 1 },
]);

module.exports = { uploadVastuMedia, uploadVastuRequestMedia };
