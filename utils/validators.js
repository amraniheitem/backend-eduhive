// Valider email
const isValidEmail = (email) => {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
};

// Valider téléphone
const isValidPhone = (phone) => {
  const regex = /^(\+\d{1,3}[- ]?)?\d{10}$/;
  return regex.test(phone);
};

// Valider mot de passe
const isValidPassword = (password) => {
  return password && password.length >= 6;
};

// Valider montant
const isValidAmount = (amount) => {
  return typeof amount === 'number' && amount >= 0;
};

// Valider crédit suffisant
const hasSufficientCredit = (userCredit, requiredAmount) => {
  return userCredit >= requiredAmount;
};

// Sanitize input
const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  return input.trim().replace(/[<>]/g, '');
};

// Valider fichier upload
const isValidFileType = (filename, allowedTypes) => {
  const ext = filename.split('.').pop().toLowerCase();
  return allowedTypes.includes(ext);
};

// Valider taille fichier
const isValidFileSize = (fileSize, maxSizeMB = 50) => {
  const maxBytes = maxSizeMB * 1024 * 1024;
  return fileSize <= maxBytes;
};
const isValidRating = (rating) => {
  return Number.isInteger(rating) && rating >= 1 && rating <= 5;
};

const isValidComment = (comment) => {
  if (!comment) return true; // optionnel
  return comment.length > 0 && comment.length <= 1000;
};


module.exports = {
  isValidEmail,
  isValidPhone,
  isValidPassword,
  isValidAmount,
  hasSufficientCredit,
  sanitizeInput,
  isValidFileType,
  isValidFileSize,
  isValidComment,
  isValidRating
};