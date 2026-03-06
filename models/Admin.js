const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema({
  // Référence vers User
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },

  // INFORMATIONS SPÉCIFIQUES ADMIN
  department: {
    type: String,
    trim: true
    // Exemples: "FINANCE", "SUPPORT", "CONTENT", "GENERAL"
  },
  permissions: [{
    type: String,
    // Exemples: "MANAGE_USERS", "VIEW_TRANSACTIONS", "MANAGE_CONTENT", "ALL"
  }],
  lastLogin: {
    type: Date,
    default: Date.now
  },

  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index pour recherche rapide
adminSchema.index({ userId: 1 });

module.exports = mongoose.model('Admin', adminSchema);