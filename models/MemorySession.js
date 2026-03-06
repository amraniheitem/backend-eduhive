// models/MemorySession.js

const mongoose = require('mongoose');

// ========================================
// SUB-SCHEMAS
// ========================================

const PDFDocumentSchema = new mongoose.Schema({
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    fileName: { type: String, required: true },
    fileSize: { type: Number },
    pageCount: { type: Number },
    extractedText: { type: String },
    uploadedAt: { type: Date, default: Date.now }
}, { _id: false });

const VoiceRecordSchema = new mongoose.Schema({
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    duration: { type: Number },
    transcription: { type: String },
    transcribedAt: { type: Date },
    recordedAt: { type: Date, default: Date.now }
});

const QuestionSchema = new mongoose.Schema({
    questionText: { type: String, required: true },
    type: {
        type: String,
        enum: ['open', 'mcq', 'true_false'],
        required: true
    },
    options: [String],
    correctAnswer: { type: String },
    topic: { type: String },
    difficulty: {
        type: String,
        enum: ['easy', 'medium', 'hard'],
        default: 'medium'
    },
    isLacune: { type: Boolean, default: false },
    explanation: { type: String },
    generatedAt: { type: Date, default: Date.now }
});

const StudentAnswerSchema = new mongoose.Schema({
    questionId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },
    questionText: { type: String },
    answerText: { type: String },
    answerVoiceUrl: { type: String },
    isCorrect: { type: Boolean },
    scoreObtained: { type: Number, min: 0, max: 100 },
    aiFeedback: { type: String },
    hint: { type: String },
    answeredAt: { type: Date, default: Date.now }
});

const LacuneSummarySchema = new mongoose.Schema({
    topic: { type: String, required: true },
    description: { type: String },
    severity: {
        type: String,
        enum: ['low', 'medium', 'high'],
        default: 'medium'
    }
}, { _id: false });

// ========================================
// MAIN SCHEMA
// ========================================

const memorySessionSchema = new mongoose.Schema({
    studentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student',
        required: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    title: {
        type: String,
        default: 'Session sans titre'
    },
    status: {
        type: String,
        enum: ['created', 'analyzed', 'in_progress', 'completed', 'failed'],
        default: 'created'
    },

    // PDF du cours
    pdf: {
        type: PDFDocumentSchema,
        required: true
    },

    // Enregistrements vocaux
    voiceRecords: [VoiceRecordSchema],

    // Questions générées par l'IA
    questions: [QuestionSchema],

    // Réponses de l'étudiant
    answers: [StudentAnswerSchema],

    // Lacunes détectées
    lacunes: [LacuneSummarySchema],

    // Statistiques calculées
    stats: {
        totalQuestions: { type: Number, default: 0 },
        answeredQuestions: { type: Number, default: 0 },
        correctAnswers: { type: Number, default: 0 },
        globalScore: { type: Number, default: 0 },
        lacunesCount: { type: Number, default: 0 },
        timeSpent: { type: Number, default: 0 } // en secondes
    },

    // Métadonnées IA
    aiMeta: {
        pdfAnalyzedAt: { type: Date },
        questionsGeneratedAt: { type: Date },
        totalTokensUsed: { type: Number, default: 0 }
    },

    startedAt: { type: Date },
    completedAt: { type: Date }
}, {
    timestamps: true
});

// ========================================
// INSTANCE METHODS
// ========================================

memorySessionSchema.methods.computeStats = function () {
    const totalQuestions = this.questions.length;
    const answeredQuestions = this.answers.length;
    const correctAnswers = this.answers.filter(a => a.isCorrect).length;
    const globalScore = answeredQuestions > 0
        ? Math.round(this.answers.reduce((sum, a) => sum + (a.scoreObtained || 0), 0) / answeredQuestions)
        : 0;
    const lacunesCount = this.lacunes.length;

    this.stats = {
        totalQuestions,
        answeredQuestions,
        correctAnswers,
        globalScore,
        lacunesCount,
        timeSpent: this.stats.timeSpent || 0
    };

    return this.stats;
};

// ========================================
// INDEXES
// ========================================

memorySessionSchema.index({ studentId: 1, createdAt: -1 });
memorySessionSchema.index({ userId: 1, status: 1 });

module.exports = mongoose.model('MemorySession', memorySessionSchema);
