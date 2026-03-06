// services/uploadService.js
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');

require('dotenv').config();

// Configuration Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

/**
 * Upload vidéo vers Cloudinary
 */
const uploadVideoToCloudinary = async (fileStream) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'video',
        folder: 'ed-platform/videos',
        quality: 'auto',
        fetch_format: 'auto'
      },
      (error, result) => {
        if (error) {
          console.error('❌ Erreur upload vidéo Cloudinary:', error);
          reject(error);
        } else {
          console.log('✅ Vidéo uploadée sur Cloudinary:', result.secure_url);
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
            format: result.format,
            duration: result.duration || 0,
            fileSize: result.bytes || 0,
            width: result.width || 0,
            height: result.height || 0
          });
        }
      }
    );

    streamifier.createReadStream(fileStream).pipe(uploadStream);
  });
};

/**
 * Upload PDF vers Cloudinary
 */
const uploadPDFToCloudinary = async (fileStream) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'raw',
        folder: 'ed-platform/pdfs',
        format: 'pdf'
      },
      (error, result) => {
        if (error) {
          console.error('❌ Erreur upload PDF Cloudinary:', error);
          reject(error);
        } else {
          console.log('✅ PDF uploadé sur Cloudinary:', result.secure_url);
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
            format: result.format,
            fileSize: result.bytes || 0
          });
        }
      }
    );

    streamifier.createReadStream(fileStream).pipe(uploadStream);
  });
};

/**
 * Supprimer fichier de Cloudinary
 */
const deleteFileFromCloudinary = async (publicId, resourceType = 'video') => {
  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType
    });
    console.log('✅ Fichier supprimé de Cloudinary:', publicId);
    return result;
  } catch (error) {
    console.error('❌ Erreur suppression Cloudinary:', error);
    throw error;
  }
};

module.exports = {
  uploadVideoToCloudinary,
  uploadPDFToCloudinary,
  deleteFileFromCloudinary
};