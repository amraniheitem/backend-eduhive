const mongoose = require("mongoose");

const subjectSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    price: {
      type: Number,
      required: true,
      default: 50,
      min: 0,
    },
    category: {
      type: String,
      trim: true,
    },
    level: {
      type: String,
      enum: ["PRIMAIRE", "COLLEGE", "LYCEE", "SUPERIEUR"],
      default: "LYCEE",
    },
    year: {
      type: String,
      trim: true
      // Ex: "1", "2", "3", etc. pour correspondre au currentYear de l'étudiant
    },
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE", "DRAFT"],
      default: "ACTIVE",
    },
    stats: {
      totalSales: {
        type: Number,
        default: 0,
      },
      revenue: {
        type: Number,
        default: 0,
      },
      studentsEnrolled: {
        type: Number,
        default: 0,
      },
      teachersCount: {
        type: Number,
        default: 0,
      },
    },
    assignedTeachers: [
      {
        teacherId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Teacher",
          required: true,
        },
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        assignedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    enrolledStudents: [
      {
        studentId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Student",
          required: true,
        },
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        enrolledAt: {
          type: Date,
          default: Date.now,
        },
        progress: {
          type: Number,
          default: 0,
          min: 0,
          max: 100,
        },
      },
    ],
    videos: [
      {
        title: {
          type: String,
          required: true,
        },
        description: String,

        // Cloudinary URLs
        url: {
          type: String,
          required: true,
        },
        publicId: {
          type: String,
          required: true,
        },

        // Métadonnées vidéo
        duration: {
          type: Number,
          default: 0, // en secondes
        },
        fileSize: {
          type: Number,
          default: 0, // en bytes
        },
        format: String, // mp4, mov, etc.
        width: Number,
        height: Number,

        // Info upload
        uploadedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Teacher",
          required: true,
        },
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
        order: {
          type: Number,
          default: 0,
        },
        price: {
          type: Number,
          default: 0,
          min: 0,
        },
      },
    ],
    contentStats: {
      totalVideos: { type: Number, default: 0 },
      totalPdfs: { type: Number, default: 0 },
      totalDuration: { type: Number, default: 0 },
      totalSize: { type: Number, default: 0 }
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
      ratingDistribution: {
        1: { type: Number, default: 0 },
        2: { type: Number, default: 0 },
        3: { type: Number, default: 0 },
        4: { type: Number, default: 0 },
        5: { type: Number, default: 0 },
      },
    }, // ========================================
    // PDFs (NOUVEAU)
    // ========================================
    pdfs: [
      {
        title: {
          type: String,
          required: true,
        },
        description: String,

        // Cloudinary URLs
        url: {
          type: String,
          required: true,
        },
        publicId: {
          type: String,
          required: true,
        },

        // Métadonnées PDF
        fileSize: {
          type: Number,
          default: 0,
        },
        pageCount: {
          type: Number,
          default: 0,
        },

        // Info upload
        uploadedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Teacher",
          required: true,
        },
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
        price: {
          type: Number,
          default: 0,
          min: 0,
        },
      },
    ],

    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

// Index pour recherche
subjectSchema.index({ name: "text", description: "text" });

module.exports = mongoose.model("Subject", subjectSchema);
