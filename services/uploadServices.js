const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');
const { PDFDocument } = require('pdf-lib');

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
  // ✅ Extraire pageCount depuis le buffer AVANT l'upload
  let pageCount = 0;
  try {
    const pdfDoc = await PDFDocument.load(fileBuffer);
    pageCount = pdfDoc.getPageCount();
    console.log('📄 Nombre de pages détecté:', pageCount);
  } catch (err) {
    console.warn('⚠️ Impossible de lire le nombre de pages:', err.message);
  }

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'image',
        folder: 'ed-platform/pdfs',
        format: 'pdf',
        access_mode: 'public'
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
            fileSize: result.bytes || 0,
            pageCount: pageCount // ✅ vrai nombre de pages
          });
        }
      }
    );

    // ✅ fileBuffer est un Buffer, streamifier le convertit en stream
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