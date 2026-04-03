// routes/upload.routes.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const { requireAuthExpress } = require("../Middleware/auth");

// ========================================
// CONFIGURATION CLOUDINARY
// ========================================

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ========================================
// CONFIGURATION MULTER (stockage mémoire)
// ========================================

const uploadPDF = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype === "application/pdf") {
            cb(null, true);
        } else {
            cb(new Error("Seuls les fichiers PDF sont acceptés"), false);
        }
    },
});

const uploadAudio = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
    fileFilter: (req, file, cb) => {
        const allowedMimes = [
            "audio/mpeg",
            "audio/mp3",
            "audio/wav",
            "audio/m4a",
            "audio/ogg",
            "audio/webm",
            "audio/x-m4a",
            "audio/mp4",
            "video/3gpp",      // ✅ .3gp mobile Android
            "video/3gpp2",     // ✅ .3g2 mobile
            "video/3gp",       // ✅ variante
            "application/octet-stream", // ✅ fallback format inconnu
        ];
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(
                new Error(
                    `Format audio non supporté: ${file.mimetype}. Formats acceptés: mp3, wav, m4a, ogg, webm, 3gp`
                ),
                false
            );
        }
    },
});

// ========================================
// HELPER : Upload buffer vers Cloudinary
// ========================================

function uploadToCloudinary(buffer, options) {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            options,
            (error, result) => {
                if (error) reject(error);
                else resolve(result);
            }
        );
        stream.end(buffer);
    });
}

// ========================================
// POST /upload/pdf
// ========================================

router.post("/pdf", requireAuthExpress, uploadPDF.single("pdf"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Aucun fichier PDF envoyé. Utilisez le champ "pdf".',
            });
        }

        console.log("📄 Upload PDF - User:", req.user.email);
        console.log("📄 Fichier:", req.file.originalname, "- Taille:", req.file.size, "bytes");

        const result = await uploadToCloudinary(req.file.buffer, {
            folder: "memory_sessions/pdfs",
            resource_type: "image",
            type: "upload",
            access_mode: "public",  // ✅ fichier public accessible sans auth
            format: "pdf",
            public_id: `pdf_${Date.now()}_${req.user.id}`,
        });

        // ✅ Sauvegarde temporaire en mémoire pour l'IA
        global.bufferCache = global.bufferCache || new Map();
        global.bufferCache.set(result.public_id, {
            base64: req.file.buffer.toString("base64"),
            mimeType: "application/pdf",
            expiresAt: Date.now() + 3600000 // 1 heure
        });

        console.log("✅ PDF uploadé:", result.secure_url);

        return res.status(200).json({
            success: true,
            data: {
                url: result.secure_url,
                publicId: result.public_id,
                fileName: req.file.originalname,
                fileSize: req.file.size,
                format: "pdf",
            },
        });
    } catch (error) {
        console.error("❌ Erreur upload PDF:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Erreur lors de l'upload du PDF",
        });
    }
});

// ========================================
// POST /upload/audio
// ========================================

router.post("/audio", requireAuthExpress, uploadAudio.single("audio"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Aucun fichier audio envoyé. Utilisez le champ "audio".',
            });
        }

        console.log("🎤 Upload Audio - User:", req.user.email);
        console.log("🎤 Fichier:", req.file.originalname, "- Taille:", req.file.size, "bytes");
        console.log("🎤 MimeType:", req.file.mimetype);

        const result = await uploadToCloudinary(req.file.buffer, {
            folder: "memory_sessions/audios",
            resource_type: "video",
            type: "upload",
            access_mode: "public",
            format: "mp4",  // 👈 force mp4 au lieu de 3gp
            public_id: `audio_${Date.now()}_${req.user.id}`,
        });


        // ✅ Sauvegarde temporaire en mémoire pour l'IA
        global.bufferCache = global.bufferCache || new Map();
        global.bufferCache.set(result.public_id, {
            base64: req.file.buffer.toString("base64"),
            mimeType: req.file.mimetype || "audio/mpeg",
            expiresAt: Date.now() + 3600000 // 1 heure
        });

        console.log("✅ Audio uploadé:", result.secure_url);

        return res.status(200).json({
            success: true,
            data: {
                url: result.secure_url,
                publicId: result.public_id,
                duration: Math.round(result.duration || 0),
                format: result.format || "mp3",
                fileSize: req.file.size,
            },
        });
    } catch (error) {
        console.error("❌ Erreur upload Audio:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Erreur lors de l'upload de l'audio",
        });
    }
});

module.exports = router;