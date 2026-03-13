// routes/upload.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const {
  requireAuthExpress,
  requireRoleExpress,
} = require("../Middleware/auth");
const {
  uploadVideoToCloudinary,
  uploadPDFToCloudinary,
  uploadImageToCloudinary,
  deleteFileFromCloudinary,
  generateVideoThumbnailUrl,
} = require("../services/uploadServices");
const Subject = require("../models/Subject");
const Teacher = require("../models/Teacher");

const memoryStorage = multer({ storage: multer.memoryStorage() });

// ========================================
// UPLOAD VIDÉO (+ miniature optionnelle)
// FormData fields:
//   - video     : fichier vidéo (obligatoire)
//   - thumbnail : image miniature (optionnel)
//   - subjectId, title, description, order, price
// ========================================
router.post(
  "/video",
  requireAuthExpress,
  requireRoleExpress(["TEACHER"]),
  memoryStorage.fields([
    { name: "video", maxCount: 1 },
    { name: "thumbnail", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      console.log("📹 Upload vidéo - User:", req.user.email);

      const videoFile = req.files?.video?.[0];
      const thumbnailFile = req.files?.thumbnail?.[0];

      if (!videoFile) {
        return res.status(400).json({ success: false, error: "Aucune vidéo uploadée" });
      }

      const { subjectId, title, description, order, price } = req.body;

      if (!subjectId || !title) {
        return res.status(400).json({ success: false, error: "subjectId et title requis" });
      }

      console.log("📹 Fichier reçu:", videoFile.originalname);
      if (thumbnailFile) {
        console.log("🖼️ Miniature reçue:", thumbnailFile.originalname);
      }

      // 1. Vérifier subject
      const subject = await Subject.findById(subjectId);
      if (!subject) {
        return res.status(404).json({ success: false, error: "Matière non trouvée" });
      }

      // 2. Vérifier teacher
      const teacher = await Teacher.findOne({ userId: req.user._id });
      if (!teacher) {
        return res.status(404).json({ success: false, error: "Profil professeur non trouvé" });
      }

      // 3. Vérifier assignation
      const isAssigned = subject.assignedTeachers.some(
        (t) => t.teacherId.toString() === teacher._id.toString()
      );
      if (!isAssigned) {
        return res.status(403).json({ success: false, error: "Vous n'êtes pas assigné à cette matière" });
      }

      console.log("✅ Autorisations OK");

      // 4. Upload vidéo vers Cloudinary
      const videoResult = await uploadVideoToCloudinary(videoFile.buffer);
      console.log("✅ Vidéo uploadée:", videoResult.url);

      // 5. Thumbnail : custom si fournie, sinon auto depuis la vidéo
      let thumbnailUrl = generateVideoThumbnailUrl(videoResult.publicId);
      let thumbnailPublicId = null;

      if (thumbnailFile) {
        const thumbnailResult = await uploadImageToCloudinary(thumbnailFile.buffer);
        thumbnailUrl = thumbnailResult.url;
        thumbnailPublicId = thumbnailResult.publicId;
        console.log("✅ Miniature uploadée:", thumbnailUrl);
      } else {
        console.log("🖼️ Miniature auto-générée (frame à 1s)");
      }

      // 6. Créer objet vidéo
      const video = {
        title,
        description: description || "",
        url: videoResult.url,
        publicId: videoResult.publicId,
        duration: videoResult.duration,
        fileSize: videoResult.fileSize,
        format: videoResult.format,
        width: videoResult.width,
        height: videoResult.height,
        uploadedBy: teacher._id,
        uploadedAt: new Date(),
        order: order ? parseInt(order) : subject.videos.length,
        price: price ? parseFloat(price) : 0,
        thumbnail: thumbnailUrl,
        thumbnailPublicId: thumbnailPublicId,
      };

      // 7. Ajouter au subject
      subject.videos.push(video);

      // 8. Mettre à jour stats
      if (!subject.contentStats) {
        subject.contentStats = { totalVideos: 0, totalPdfs: 0, totalDuration: 0, totalSize: 0 };
      }
      subject.contentStats.totalVideos = subject.videos.length;
      subject.contentStats.totalDuration += video.duration || 0;
      subject.contentStats.totalSize += video.fileSize || 0;

      await subject.save();

      console.log("✅ Vidéo ajoutée au subject:", subject.name);

      res.json({
        success: true,
        message: "Vidéo uploadée avec succès",
        data: {
          video,
          subject: {
            id: subject._id,
            name: subject.name,
            totalVideos: subject.contentStats.totalVideos,
          },
        },
      });
    } catch (error) {
      console.error("❌ Erreur upload vidéo:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// ========================================
// UPLOAD PDF
// ========================================
router.post(
  "/pdf",
  requireAuthExpress,
  requireRoleExpress(["TEACHER"]),
  memoryStorage.single("pdf"),
  async (req, res) => {
    try {
      console.log("📄 Upload PDF - User:", req.user.email);

      if (!req.file) {
        return res.status(400).json({ success: false, error: "Aucun PDF uploadé" });
      }

      const { subjectId, title, description, pageCount, price } = req.body;

      if (!subjectId || !title) {
        return res.status(400).json({ success: false, error: "subjectId et title requis" });
      }

      console.log("📄 Fichier reçu:", req.file.originalname);

      const subject = await Subject.findById(subjectId);
      if (!subject) {
        return res.status(404).json({ success: false, error: "Matière non trouvée" });
      }

      const teacher = await Teacher.findOne({ userId: req.user._id });
      if (!teacher) {
        return res.status(404).json({ success: false, error: "Profil professeur non trouvé" });
      }

      const isAssigned = subject.assignedTeachers.some(
        (t) => t.teacherId.toString() === teacher._id.toString()
      );
      if (!isAssigned) {
        return res.status(403).json({ success: false, error: "Vous n'êtes pas assigné à cette matière" });
      }

      console.log("✅ Autorisations OK");

      const cloudinaryResult = await uploadPDFToCloudinary(req.file.buffer);

      const pdf = {
        title,
        description: description || "",
        url: cloudinaryResult.url,
        publicId: cloudinaryResult.publicId,
        fileSize: cloudinaryResult.fileSize,
        pageCount: pageCount ? parseInt(pageCount) : 0,
        uploadedBy: teacher._id,
        uploadedAt: new Date(),
        price: price ? parseFloat(price) : 0,
      };

      subject.pdfs.push(pdf);

      if (!subject.contentStats) {
        subject.contentStats = { totalVideos: 0, totalPdfs: 0, totalDuration: 0, totalSize: 0 };
      }
      subject.contentStats.totalPdfs = subject.pdfs.length;
      subject.contentStats.totalSize += pdf.fileSize || 0;

      await subject.save();

      console.log("✅ PDF ajouté au subject:", subject.name);

      res.json({
        success: true,
        message: "PDF uploadé avec succès",
        data: {
          pdf,
          subject: {
            id: subject._id,
            name: subject.name,
            totalPdfs: subject.contentStats.totalPdfs,
          },
        },
      });
    } catch (error) {
      console.error("❌ Erreur upload PDF:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// ========================================
// REMPLACER THUMBNAIL APRÈS UPLOAD
// PATCH /upload/video/:subjectId/:videoId/thumbnail
// ========================================
router.patch(
  "/video/:subjectId/:videoId/thumbnail",
  requireAuthExpress,
  requireRoleExpress(["TEACHER"]),
  memoryStorage.single("thumbnail"),
  async (req, res) => {
    try {
      console.log("🖼️ Remplacement thumbnail - User:", req.user.email);

      if (!req.file) {
        return res.status(400).json({ success: false, error: "Aucune image uploadée" });
      }

      const { subjectId, videoId } = req.params;

      const subject = await Subject.findById(subjectId);
      if (!subject) {
        return res.status(404).json({ success: false, error: "Matière non trouvée" });
      }

      const teacher = await Teacher.findOne({ userId: req.user._id });
      if (!teacher) {
        return res.status(404).json({ success: false, error: "Profil professeur non trouvé" });
      }

      const isAssigned = subject.assignedTeachers.some(
        (t) => t.teacherId.toString() === teacher._id.toString()
      );
      if (!isAssigned) {
        return res.status(403).json({ success: false, error: "Vous n'êtes pas assigné à cette matière" });
      }

      const video = subject.videos.id(videoId);
      if (!video) {
        return res.status(404).json({ success: false, error: "Vidéo non trouvée" });
      }

      // Supprimer l'ancienne thumbnail custom si elle existe
      if (video.thumbnailPublicId) {
        try {
          await deleteFileFromCloudinary(video.thumbnailPublicId, "image");
          console.log("🗑️ Ancienne thumbnail supprimée:", video.thumbnailPublicId);
        } catch (err) {
          console.warn("⚠️ Impossible de supprimer l'ancienne thumbnail:", err.message);
        }
      }

      const cloudinaryResult = await uploadImageToCloudinary(req.file.buffer);
      video.thumbnail = cloudinaryResult.url;
      video.thumbnailPublicId = cloudinaryResult.publicId;

      await subject.save();

      console.log("✅ Thumbnail remplacée pour:", video.title);

      res.json({
        success: true,
        message: "Thumbnail remplacée avec succès",
        data: {
          videoId,
          thumbnail: video.thumbnail,
          thumbnailPublicId: video.thumbnailPublicId,
        },
      });
    } catch (error) {
      console.error("❌ Erreur remplacement thumbnail:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// ========================================
// RÉINITIALISER THUMBNAIL (revenir à l'auto)
// DELETE /upload/video/:subjectId/:videoId/thumbnail
// ========================================
router.delete(
  "/video/:subjectId/:videoId/thumbnail",
  requireAuthExpress,
  requireRoleExpress(["TEACHER"]),
  async (req, res) => {
    try {
      const { subjectId, videoId } = req.params;

      const subject = await Subject.findById(subjectId);
      if (!subject) {
        return res.status(404).json({ success: false, error: "Matière non trouvée" });
      }

      const video = subject.videos.id(videoId);
      if (!video) {
        return res.status(404).json({ success: false, error: "Vidéo non trouvée" });
      }

      if (video.thumbnailPublicId) {
        try {
          await deleteFileFromCloudinary(video.thumbnailPublicId, "image");
        } catch (err) {
          console.warn("⚠️ Impossible de supprimer la thumbnail:", err.message);
        }
      }

      video.thumbnail = generateVideoThumbnailUrl(video.publicId);
      video.thumbnailPublicId = null;

      await subject.save();

      res.json({
        success: true,
        message: "Thumbnail réinitialisée (auto-générée)",
        data: { videoId, thumbnail: video.thumbnail },
      });
    } catch (error) {
      console.error("❌ Erreur réinitialisation thumbnail:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// ========================================
// SUPPRIMER FICHIER
// ========================================
router.delete(
  "/file/:publicId",
  requireAuthExpress,
  async (req, res) => {
    try {
      const { publicId } = req.params;
      const { resourceType } = req.query;

      await deleteFileFromCloudinary(publicId, resourceType || "video");

      res.json({ success: true, message: "Fichier supprimé" });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

module.exports = router;