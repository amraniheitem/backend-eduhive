// routes/upload.js
const express = require("express");
const router = express.Router();
const { uploadVideo, uploadPDF, deleteFile } = require("../config/cloudinary");
const {
  requireAuthExpress,
  requireRoleExpress,
} = require("../Middleware/auth"); // ← CHANGÉ ICI
const Subject = require("../models/Subject");
const Teacher = require("../models/Teacher");

// routes/upload.js
router.post(
  '/video',
  requireAuthExpress,
  requireRoleExpress(['TEACHER']),
  uploadVideo.single('video'),
  async (req, res) => {
    try {
      console.log('📹 Upload vidéo - User:', req.user.email);

      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'Aucune vidéo uploadée'
        });
      }

      const { subjectId, title, description, order, price } = req.body;

      if (!subjectId || !title) {
        return res.status(400).json({
          success: false,
          error: 'subjectId et title requis'
        });
      }

      console.log('📹 Fichier reçu:', req.file.originalname);

      // 1. Vérifier subject
      const subject = await Subject.findById(subjectId);
      if (!subject) {
        return res.status(404).json({
          success: false,
          error: 'Matière non trouvée'
        });
      }

      // 2. Vérifier teacher
      const teacher = await Teacher.findOne({ userId: req.user._id });
      if (!teacher) {
        return res.status(404).json({
          success: false,
          error: 'Profil professeur non trouvé'
        });
      }

      // 3. Vérifier assignation
      const isAssigned = subject.assignedTeachers.some(
        t => t.teacherId.toString() === teacher._id.toString()
      );

      if (!isAssigned) {
        return res.status(403).json({
          success: false,
          error: 'Vous n\'êtes pas assigné à cette matière'
        });
      }

      console.log('✅ Autorisations OK');

      // 4. Créer objet vidéo
      const video = {
        title,
        description: description || '',
        url: req.file.path,
        publicId: req.file.filename,
        duration: req.file.duration || 0,
        fileSize: req.file.bytes || 0,
        format: req.file.format || '',
        width: req.file.width || 0,
        price: price || 0,
        height: req.file.height || 0,
        uploadedBy: teacher._id,
        uploadedAt: new Date(),
        order: order ? parseInt(order) : subject.videos.length,
        price: price ? parseFloat(price) : 0
      };

      // 5. Ajouter au subject
      subject.videos.push(video);

      // 6. Mettre à jour stats (avec initialisation si besoin)
      if (!subject.contentStats) {
        subject.contentStats = {
          totalVideos: 0,
          totalPdfs: 0,
          totalDuration: 0,
          totalSize: 0
        };
      }

      subject.contentStats.totalVideos = subject.videos.length;
      subject.contentStats.totalDuration += (video.duration || 0);
      subject.contentStats.totalSize += (video.fileSize || 0);

      await subject.save();

      console.log('✅ Vidéo ajoutée au subject:', subject.name);

      res.json({
        success: true,
        message: 'Vidéo uploadée avec succès',
        data: {
          video,
          subject: {
            id: subject._id,
            name: subject.name,
            totalVideos: subject.contentStats.totalVideos
          }
        }
      });

    } catch (error) {
      console.error('❌ Erreur upload vidéo:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// ========================================
// UPLOAD PDF
// ========================================
router.post(
  '/pdf',
  requireAuthExpress,
  requireRoleExpress(['TEACHER']),
  uploadPDF.single('pdf'),
  async (req, res) => {
    try {
      console.log('📄 Upload PDF - User:', req.user.email);

      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'Aucun PDF uploadé'
        });
      }

      const { subjectId, title, description, pageCount, price } = req.body;

      if (!subjectId || !title) {
        return res.status(400).json({
          success: false,
          error: 'subjectId et title requis'
        });
      }

      console.log('📄 Fichier reçu:', req.file.originalname);

      const subject = await Subject.findById(subjectId);
      if (!subject) {
        return res.status(404).json({
          success: false,
          error: 'Matière non trouvée'
        });
      }

      const teacher = await Teacher.findOne({ userId: req.user._id });
      if (!teacher) {
        return res.status(404).json({
          success: false,
          error: 'Profil professeur non trouvé'
        });
      }

      const isAssigned = subject.assignedTeachers.some(
        t => t.teacherId.toString() === teacher._id.toString()
      );

      if (!isAssigned) {
        return res.status(403).json({
          success: false,
          error: 'Vous n\'êtes pas assigné à cette matière'
        });
      }

      console.log('✅ Autorisations OK');

      const pdf = {
        title,
        description: description || '',
        url: req.file.path,
        publicId: req.file.filename,
        fileSize: req.file.bytes || 0,
        pageCount: pageCount ? parseInt(pageCount) : 0,
        uploadedBy: teacher._id,
        uploadedAt: new Date(),
        price: price ? parseFloat(price) : 0
      };

      subject.pdfs.push(pdf);

      // Initialiser contentStats si nécessaire
      if (!subject.contentStats) {
        subject.contentStats = {
          totalVideos: 0,
          totalPdfs: 0,
          totalDuration: 0,
          totalSize: 0
        };
      }

      subject.contentStats.totalPdfs = subject.pdfs.length;
      subject.contentStats.totalSize += (pdf.fileSize || 0);

      await subject.save();

      console.log('✅ PDF ajouté au subject:', subject.name);

      res.json({
        success: true,
        message: 'PDF uploadé avec succès',
        data: {
          pdf,
          subject: {
            id: subject._id,
            name: subject.name,
            totalPdfs: subject.contentStats.totalPdfs
          }
        }
      });

    } catch (error) {
      console.error('❌ Erreur upload PDF:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);
// ========================================
// SUPPRIMER FICHIER (optionnel)
// ========================================
router.delete(
  "/file/:publicId",
  requireAuthExpress, // ← CHANGÉ ICI
  async (req, res) => {
    try {
      const { publicId } = req.params;
      const { resourceType } = req.query;

      await deleteFile(publicId, resourceType || "video");

      res.json({
        success: true,
        message: "Fichier supprimé",
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  },
);

module.exports = router;
