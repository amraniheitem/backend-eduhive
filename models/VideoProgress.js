// models/VideoProgress.js
const mongoose = require('mongoose');

const videoProgressSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true
  },
  subject: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject',
    required: true
  },
  videoId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },

  // Temps de visionnage (en secondes)
  watchedTime: {
    type: Number,
    default: 0,
    min: 0
  },

  // Pourcentage de complétion
  completionPercentage: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },

  // Vidéo terminée ?
  completed: {
    type: Boolean,
    default: false
  },

  // Dernière position (pour reprendre où on s'est arrêté)
  lastPosition: {
    type: Number,
    default: 0
  },

  lastWatchedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index unique : un étudiant ne peut avoir qu'un seul progress par vidéo
videoProgressSchema.index({ student: 1, videoId: 1 }, { unique: true });

module.exports = mongoose.model('VideoProgress', videoProgressSchema);