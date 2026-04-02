const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  // Référence vers User
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },

  // INFORMATIONS SPÉCIFIQUES ÉTUDIANT
  parentName: {
    type: String,
    required: true,
    trim: true
  },
  educationLevel: {
    type: String,
    enum: ['PRIMAIRE', 'CEM', 'LYCEE', 'SUPERIEUR'],
    required: true
  },

  // POINTS DE L'ÉTUDIANT
  credit: {
    type: Number,
    default: 100, // 100 points gratuits à l'inscription
    min: 0
  },

  // RELATIONS DE L'ÉTUDIANT
  enrolledSubjects: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject'
  }],

  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index pour recherche rapide
studentSchema.index({ userId: 1 });

module.exports = mongoose.model('Student', studentSchema);