const multer = require("multer");

// A single logo file per review request. 8 MB is generous enough for a PNG
// export while keeping the inline Gemini request small.
const uploadLogoImage = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024,
    files: 1,
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
        new Error("Only JPEG, PNG, WebP, or HEIC images are allowed"),
      );
    }
    callback(null, true);
  },
}).single("logo");

module.exports = { uploadLogoImage };
