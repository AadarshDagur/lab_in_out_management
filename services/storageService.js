const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { put, del } = require("@vercel/blob");

const localUploadDir = path.join(__dirname, "..", "public", "uploads", "users");
const allowedExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

function ensureLocalUploadDir() {
  fs.mkdirSync(localUploadDir, { recursive: true });
}

function getSafeExtension(fileName = "", mimetype = "") {
  const originalExtension = path.extname(fileName).toLowerCase();
  if (allowedExtensions.has(originalExtension)) {
    return originalExtension;
  }

  if (mimetype === "image/jpeg") return ".jpg";
  if (mimetype === "image/webp") return ".webp";
  if (mimetype === "image/gif") return ".gif";
  return ".png";
}

function buildFileName(file) {
  const extension = getSafeExtension(file?.originalname || "", file?.mimetype || "");
  return `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${extension}`;
}

function shouldUseBlobStorage() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

async function saveToLocal(file) {
  ensureLocalUploadDir();
  const fileName = buildFileName(file);
  const targetPath = path.join(localUploadDir, fileName);
  await fs.promises.writeFile(targetPath, file.buffer);
  return `/uploads/users/${fileName}`;
}

async function saveToBlob(file) {
  const fileName = buildFileName(file);
  const blob = await put(`uploads/users/${fileName}`, file.buffer, {
    access: "public",
    addRandomSuffix: false,
    token: process.env.BLOB_READ_WRITE_TOKEN,
    contentType: file.mimetype || "image/png",
  });
  return blob.url;
}

async function saveProfileImage(file) {
  if (!file) return null;
  if (shouldUseBlobStorage()) {
    return saveToBlob(file);
  }
  return saveToLocal(file);
}

async function deleteLocalFile(profileImage) {
  if (!profileImage || !profileImage.startsWith("/uploads/users/")) return;
  const imagePath = path.join(__dirname, "..", "public", profileImage.replace(/^\/+/, ""));
  if (fs.existsSync(imagePath)) {
    await fs.promises.unlink(imagePath);
  }
}

async function deleteBlobFile(profileImage) {
  if (!profileImage || !/^https?:\/\//i.test(profileImage)) return;
  await del(profileImage, {
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
}

async function deleteProfileImage(profileImage) {
  if (!profileImage) return;

  try {
    if (profileImage.startsWith("/uploads/users/")) {
      await deleteLocalFile(profileImage);
      return;
    }

    if (shouldUseBlobStorage() && /^https?:\/\//i.test(profileImage)) {
      await deleteBlobFile(profileImage);
    }
  } catch (error) {
    console.error("Profile image delete error:", error.message);
  }
}

module.exports = {
  saveProfileImage,
  deleteProfileImage,
  shouldUseBlobStorage,
};
