const jwt = require('jsonwebtoken');
const User = require('../models/User');

const authenticate = async (req) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return { isAuth: false, user: null };
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    
    if (!user || user.status !== 'ACTIVE') {
      return { isAuth: false, user: null };
    }

    return { isAuth: true, user };
  } catch (error) {
    return { isAuth: false, user: null };
  }
};

const requireAuth = (context) => {
  if (!context.isAuth) {
    throw new Error('Non authentifié');
  }
};

const requireRole = (context, allowedRoles) => {
  requireAuth(context);
  
  if (!allowedRoles.includes(context.user.role)) {
    throw new Error('Accès non autorisé');
  }
};

const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: '30d'
  });
};

module.exports = {
  authenticate,
  requireAuth,
  requireRole,
  generateToken
};