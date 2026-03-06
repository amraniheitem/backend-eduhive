// models/Rating.js
const mongoose = require('mongoose');

const ratingSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true
  },
  studentUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  targetType: {
    type: String,
    enum: ['VIDEO', 'PDF', 'SUBJECT', 'TEACHER'],
    required: true
  },
  
  // IDs des cibles
  video: {
    type: mongoose.Schema.Types.ObjectId,
    // Pas de ref car c'est un subdocument dans Subject
  },
  pdf: {
    type: mongoose.Schema.Types.ObjectId,
    // Pas de ref car c'est un subdocument dans Subject
  },
  subject: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject'
  },
  teacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Teacher'
  },

  // Note (1-5 étoiles)
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },

  // Commentaire optionnel
  comment: {
    type: String,
    maxlength: 1000
  },

  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index pour éviter double notation
ratingSchema.index({ 
  student: 1, 
  targetType: 1, 
  video: 1, 
  pdf: 1, 
  subject: 1, 
  teacher: 1 
}, { 
  unique: true,
  sparse: true 
});

// Index pour recherche rapide
ratingSchema.index({ subject: 1 });
ratingSchema.index({ teacher: 1 });

module.exports = mongoose.model('Rating', ratingSchema);