const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const { cloudinary } = require("../config/cloudinary");

const UPLOAD_ROOT = path.join(__dirname, "..", "uploads", "readings");

const EXTENSION_BY_MIME = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/heic": ".heic",
  "image/heif": ".heif",
};

const cloudinaryConfigured = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
);

const uploadToCloudinary = (file, { userId, feature }) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `astro/readings/${feature}/${userId}`,
        resource_type: "image",
        public_id: `${feature}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
        transformation: [
          { width: 1600, height: 1600, crop: "limit", quality: "auto" },
        ],
      },
      (error, result) => {
        if (error) return reject(error);
        resolve({
          url: result.secure_url || result.url,
          publicId: result.public_id,
          provider: "cloudinary",
          mimeType: file.mimetype,
          size: file.size || null,
        });
      }
    );
    stream.end(file.buffer);
  });

const uploadToLocalDisk = async (file, { userId, feature }) => {
  const directory = path.join(UPLOAD_ROOT, feature, String(userId));
  await fs.mkdir(directory, { recursive: true });
  const extension =
    EXTENSION_BY_MIME[file.mimetype] ||
    path.extname(file.originalname || "").toLowerCase() ||
    "";
  const filename = `${feature}-${Date.now()}-${crypto.randomBytes(6).toString("hex")}${extension}`;
  await fs.writeFile(path.join(directory, filename), file.buffer);
  return {
    url: `/uploads/readings/${feature}/${userId}/${filename}`,
    publicId: "",
    provider: "local",
    mimeType: file.mimetype,
    size: file.size || null,
  };
};

const persistOne = async (file, options) => {
  if (cloudinaryConfigured) {
    try {
      return await uploadToCloudinary(file, options);
    } catch (error) {
      console.warn(
        "[Reading] Cloudinary upload failed, falling back to local disk:",
        error.message
      );
    }
  }
  return uploadToLocalDisk(file, options);
};

const persistReadingImages = async (files = [], userId, feature) => {
  const stored = [];
  for (const file of files) {
    stored.push(await persistOne(file, { userId, feature }));
  }
  return stored;
};

const deleteReadingMedia = async (image) => {
  if (!image?.publicId || image.provider !== "cloudinary") return false;
  await cloudinary.uploader
    .destroy(image.publicId, { resource_type: "image" })
    .catch(() => {});
  return true;
};

module.exports = {
  persistReadingImages,
  deleteReadingMedia,
  UPLOAD_ROOT,
};
