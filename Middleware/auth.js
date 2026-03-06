// Middleware/auth.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// ========================================
// Pour GraphQL (context)
// ========================================
const authenticate = async (req) => {
  try {
    const authHeader = req.headers.authorization || '';
    
    if (!authHeader.startsWith('Bearer ')) {
      return { user: null };
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    
    return { user };
  } catch (error) {
    console.error('Auth error:', error.message);
    return { user: null };
  }
};

// ========================================
// Pour Express REST (middleware)
// ========================================
const requireAuthExpress = async (req, res, next) => {
  try {
    console.log('🔐 requireAuthExpress appelé');
    console.log('🔐 Headers:', req.headers);
    
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      console.log('❌ Pas de header Authorization');
      return res.status(401).json({
        success: false,
        error: 'Token manquant. Ajoutez "Authorization: Bearer YOUR_TOKEN"'
      });
    }

    if (!authHeader.startsWith('Bearer ')) {
      console.log('❌ Header Authorization invalide:', authHeader);
      return res.status(401).json({
        success: false,
        error: 'Format du token invalide. Utilisez "Bearer YOUR_TOKEN"'
      });
    }

    const token = authHeader.split(' ')[1];
    console.log('🔐 Token extrait:', token.substring(0, 20) + '...');

    if (!process.env.JWT_SECRET) {
      console.error('❌ JWT_SECRET non défini dans .env');
      return res.status(500).json({
        success: false,
        error: 'Erreur serveur: JWT_SECRET manquant'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('✅ Token décodé:', decoded);

    const user = await User.findById(decoded.userId);
    
    if (!user) {
      console.log('❌ User non trouvé:', decoded.userId);
      return res.status(401).json({
        success: false,
        error: 'Utilisateur non trouvé'
      });
    }

    console.log('✅ User authentifié:', user.email, user.role);

    req.user = user;
    next();
    
  } catch (error) {
    console.error('❌ Erreur dans requireAuthExpress:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: 'Token invalide'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token expiré'
      });
    }
    
    return res.status(500).json({
      success: false,
      error: 'Erreur serveur: ' + error.message
    });
  }
};

const requireRoleExpress = (allowedRoles) => {
  return (req, res, next) => {
    console.log('🔒 requireRoleExpress - User:', req.user?.email, 'Role:', req.user?.role);
    console.log('🔒 Roles autorisés:', allowedRoles);
    
    if (!req.user) {
      console.log('❌ Pas de req.user');
      return res.status(401).json({
        success: false,
        error: 'Non authentifié'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      console.log('❌ Rôle non autorisé');
      return res.status(403).json({
        success: false,
        error: `Accès refusé. Rôle requis: ${allowedRoles.join(', ')}. Votre rôle: ${req.user.role}`
      });
    }

    console.log('✅ Rôle autorisé');
    next();
  };
};

// ========================================
// Pour GraphQL (context)
// ========================================
const requireAuth = (context) => {
  if (!context.user) {
    throw new Error('Non authentifié. Veuillez vous connecter.');
  }
};

const requireRole = (context, allowedRoles) => {
  requireAuth(context);
  
  if (!allowedRoles.includes(context.user.role)) {
    throw new Error(`Accès refusé. Rôle requis: ${allowedRoles.join(', ')}`);
  }
};

// ========================================
// Génération de token
// ========================================
const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
};

// ========================================
// EXPORTS
// ========================================
module.exports = {
  authenticate,          // ← Pour GraphQL context
  requireAuth,           // ← Pour GraphQL resolvers
  requireRole,           // ← Pour GraphQL resolvers
  requireAuthExpress,    // ← Pour Express routes
  requireRoleExpress,    // ← Pour Express routes
  generateToken          // ← Pour login/register
};