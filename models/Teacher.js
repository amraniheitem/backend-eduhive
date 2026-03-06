const mongoose = require("mongoose");

const teacherSchema = new mongoose.Schema(
  {
    // Référence vers User
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    // INFORMATIONS SPÉCIFIQUES PROFESSEUR
    subjects: [
      {
        type: String,
        trim: true,
        // Exemples: "MATHS", "PHYSICS", "FRENCH", "ARABIC", etc.
      },
    ],
    educationLevels: [
      {
        type: String,
        enum: ["PRIMAIRE", "CEM", "LYCEE", "SUPERIEUR"],
      },
    ],

    // POINTS DU PROFESSEUR
    credit: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalEarnings: {
      type: Number,
      default: 0,
      min: 0,
    },
    withdrawable: {
      type: Number,
      default: 0,
      min: 0,
    },

    // INFORMATIONS BANCAIRES
    bankInfo: {
      accountHolder: {
        type: String,
        trim: true,
      },
      iban: {
        type: String,
        trim: true,
      },
      bankName: {
        type: String,
        trim: true,
      },
    },
    ratingsStats: {
      averageRating: {
        type: Number,
        default: 0,
        min: 0,
        max: 5,
      },
      totalRatings: {
        type: Number,
        default: 0,
      },
    },
    // RELATIONS DU PROFESSEUR
    selectedSubjects: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Subject",
        },
      ],
      default: [], // ← IMPORTANT
    },

    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

// Index pour recherche rapide
teacherSchema.index({ userId: 1 });

module.exports = mongoose.model("Teacher", teacherSchema);
