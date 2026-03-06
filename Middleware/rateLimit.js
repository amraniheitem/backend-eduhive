// middleware/rateLimit.js
const rateLimit = require('express-rate-limit');

const ratingsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // max 10 évaluations par 15 min
  message: 'Trop d\'évaluations. Réessayez plus tard.'
});

module.exports = { ratingsLimiter };