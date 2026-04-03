const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');
const { PDFDocument } = require('pdf-lib');
const pdfParse = require('pdf-parse');

require('dotenv').config();

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
 * Upload PDF vers Cloudinary avec calcul automatique du pageCount
 */
const uploadPDFToCloudinary = async (fileBuffer) => {
  let pageCount = 0;
  try {
    const pdfData = await pdfParse(fileBuffer);
    pageCount = pdfData.numpages;
  } catch (err) {
    console.warn('⚠️ pdf-parse échoué:', err.message);
  }

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'raw',
        folder: 'ed-platform/pdfs',
        access_mode: 'public',        // ✅ forcer accès public
        type: 'upload',               // ✅ type upload = accès libre
      },
      (error, result) => {
        if (error) {
          console.error('❌ Erreur upload PDF Cloudinary:', error);
          reject(error);
        } else {
          // ✅ Construire manuellement l'URL publique raw
          const publicUrl = `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/raw/upload/${result.public_id}`;
          
          console.log('✅ PDF uploadé:', publicUrl, '| Pages:', pageCount);
          resolve({
            url: publicUrl,            // ✅ URL publique garantie
            publicId: result.public_id,
            fileSize: result.bytes || 0,
            pageCount: pageCount
          });
        }
      }
    );

    streamifier.createReadStream(fileBuffer).pipe(uploadStream);
  });
};

/**
 * Upload image vers Cloudinary
 */
const uploadImageToCloudinary = async (fileBuffer) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'image',
        folder: 'ed-platform/thumbnails',
        quality: 'auto',
        fetch_format: 'auto'
      },
      (error, result) => {
        if (error) {
          console.error('❌ Erreur upload image Cloudinary:', error);
          reject(error);
        } else {
          console.log('✅ Image uploadée sur Cloudinary:', result.secure_url);
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
            format: result.format,
            fileSize: result.bytes || 0,
            width: result.width || 0,
            height: result.height || 0
          });
        }
      }
    );

    streamifier.createReadStream(fileBuffer).pipe(uploadStream);
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

/**
 * Générer URL thumbnail automatique depuis une vidéo Cloudinary
 */
const generateVideoThumbnailUrl = (videoPublicId) => {
  return cloudinary.url(videoPublicId, {
    resource_type: 'video',
    format: 'jpg',
    transformation: [{ start_offset: '1' }]
  });
};

module.exports = {
  uploadVideoToCloudinary,
  uploadPDFToCloudinary,
  uploadImageToCloudinary,
  deleteFileFromCloudinary,
  generateVideoThumbnailUrl
};