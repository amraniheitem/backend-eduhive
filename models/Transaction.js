const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
    },
    videoId: {
      type: mongoose.Schema.Types.ObjectId,
    },
    pdfId: {
      type: mongoose.Schema.Types.ObjectId,
    },

    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    type: {
      type: String,
      enum: ["PURCHASE", "SUBJECT_BUY", "AI_USE", "WITHDRAWAL", "REFUND", "VIDEO_WATCH", "PDF_READ"],
      required: true,
    },
    teacherCut: {
      type: Number,
      default: 0,
    },
    companyCut: {
      type: Number,
      default: 0,
    },
    description: {
      type: String,
    },
    status: {
      type: String,
      enum: ["PENDING", "COMPLETED", "FAILED", "CANCELLED"],
      default: "COMPLETED",
    },
    paymentMethod: {
      type: String,
      enum: ["CARD", "PAYPAL", "BANK_TRANSFER", "POINTS"],
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    ipAddress: String,
    userAgent: String,

    // Pour refunds
    refundedTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
    },
  },
  {
    timestamps: true,
  },
);

// Index pour recherche
transactionSchema.index({ student: 1, createdAt: -1 });
transactionSchema.index({ teacher: 1, createdAt: -1 });
transactionSchema.index({ type: 1, createdAt: -1 });

module.exports = mongoose.model("Transaction", transactionSchema);
