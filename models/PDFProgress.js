// models/PDFProgress.js
const mongoose = require('mongoose');

const pdfProgressSchema = new mongoose.Schema({
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
  pdfId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },

  // Pages lues
  pagesRead: [{
    type: Number
  }],

  // Dernière page visitée
  lastPage: {
    type: Number,
    default: 1
  },

  // Pourcentage de lecture
  completionPercentage: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },

  // PDF lu entièrement ?
  completed: {
    type: Boolean,
    default: false
  },

  lastReadAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

pdfProgressSchema.index({ student: 1, pdfId: 1 }, { unique: true });

module.exports = mongoose.model('PDFProgress', pdfProgressSchema);