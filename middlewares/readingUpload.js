const multer = require("multer");

// Face/Palm photos stay in memory only long enough for the AI call and the
// Cloudinary upload (or local disk fallback). Max 4 images per reading.
const uploadReadingImages = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 4,
  },
  fileFilter: (req, file, callback) => {
    const allowed = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic",
      "image/heif",
    ];
    if (!allowed.includes(file.mimetype)) {
      return callback(
        new Error("Only JPEG, PNG, WebP, or HEIC images are allowed")
      );
    }
    callback(null, true);
  },
}).fields([
  { name: "image", maxCount: 1 },
  { name: "images", maxCount: 4 },
]);

const flattenReadingImages = (files = {}) => {
  if (!files) return [];
  if (Array.isArray(files)) return files;
  return [...(files.image || []), ...(files.images || [])].slice(0, 4);
};

module.exports = { uploadReadingImages, flattenReadingImages };
