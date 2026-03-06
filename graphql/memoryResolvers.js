// graphql/memoryResolvers.js

const MemorySession = require('../models/MemorySession');
const Student = require('../models/Student');
const { requireAuth } = require('../Middleware/auth');
const {
    processMemorySession,
    transcribeAudio,
    detectLacunes,
    generateQuestions,
    evaluateAnswer
} = require('../services/gemini.service');

const memoryResolvers = {
    Query: {
        // ========================================
        // MES SESSIONS DE MÉMORISATION
        // ========================================
        myMemorySessions: async (_, { status, limit = 10, offset = 0 }, context) => {
            requireAuth(context);

            const student = await Student.findOne({ userId: context.user._id });
            if (!student) {
                throw new Error('Profil étudiant non trouvé');
            }

            const filter = { studentId: student._id };
            if (status) {
                filter.status = status;
            }

            return await MemorySession.find(filter)
                .sort({ createdAt: -1 })
                .skip(offset)
                .limit(limit);
        },

        // ========================================
        // UNE SESSION SPÉCIFIQUE
        // ========================================
        memorySession: async (_, { sessionId }, context) => {
            requireAuth(context);

            const student = await Student.findOne({ userId: context.user._id });
            if (!student) {
                throw new Error('Profil étudiant non trouvé');
            }

            const session = await MemorySession.findById(sessionId);
            if (!session) {
                throw new Error('Session non trouvée');
            }

            if (session.studentId.toString() !== student._id.toString()) {
                throw new Error('Accès refusé : cette session ne vous appartient pas');
            }

            return session;
        },

        // ========================================
        // STATS GLOBALES DE MÉMORISATION
        // ========================================
        memoryStats: async (_, __, context) => {
            requireAuth(context);

            const student = await Student.findOne({ userId: context.user._id });
            if (!student) {
                throw new Error('Profil étudiant non trouvé');
            }

            const sessions = await MemorySession.find({ studentId: student._id });

            const totalSessions = sessions.length;
            const completedSessions = sessions.filter(s => s.status === 'completed').length;

            const sessionsWithScore = sessions.filter(s => s.stats.answeredQuestions > 0);
            const averageScore = sessionsWithScore.length > 0
                ? Math.round(sessionsWithScore.reduce((sum, s) => sum + s.stats.globalScore, 0) / sessionsWithScore.length)
                : 0;

            const totalTimeSpent = sessions.reduce((sum, s) => sum + (s.stats.timeSpent || 0), 0);

            // Trouver les thèmes les plus échoués
            const topicFailCounts = {};
            for (const session of sessions) {
                for (const lacune of session.lacunes) {
                    if (lacune.severity === 'high' || lacune.severity === 'medium') {
                        topicFailCounts[lacune.topic] = (topicFailCounts[lacune.topic] || 0) + 1;
                    }
                }
            }

            const mostMissedTopics = Object.entries(topicFailCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([topic]) => topic);

            return {
                totalSessions,
                completedSessions,
                averageScore,
                totalTimeSpent,
                mostMissedTopics
            };
        }
    },

    Mutation: {
        // ========================================
        // CRÉER UNE SESSION DE MÉMORISATION
        // ========================================
        createMemorySession: async (_, args, context) => {
            requireAuth(context);

            const {
                title,
                pdfUrl, pdfPublicId, fileName, fileSize,
                audioUrl, audioPublicId, audioDuration
            } = args;

            const student = await Student.findOne({ userId: context.user._id });
            if (!student) {
                throw new Error('Profil étudiant non trouvé');
            }

            // Créer la session initiale
            const session = await MemorySession.create({
                studentId: student._id,
                userId: context.user._id,
                title: title || 'Session sans titre',
                status: 'created',
                pdf: {
                    url: pdfUrl,
                    publicId: pdfPublicId,
                    fileName,
                    fileSize: fileSize || 0,
                    uploadedAt: new Date()
                },
                voiceRecords: [{
                    url: audioUrl,
                    publicId: audioPublicId,
                    duration: audioDuration || 0,
                    recordedAt: new Date()
                }],
                startedAt: new Date()
            });

            // Lancer le traitement IA avec callback pour sauvegarder à chaque étape
            try {
                await processMemorySession(pdfUrl, pdfPublicId, audioUrl, audioPublicId, async (step, data) => {
                    switch (step) {
                        case 'pdf_analyzed':
                            session.pdf.extractedText = data.extractedText;
                            session.status = 'analyzed';
                            session.aiMeta.pdfAnalyzedAt = new Date();
                            session.aiMeta.totalTokensUsed = (session.aiMeta.totalTokensUsed || 0) + (data.tokensUsed || 0);
                            session.computeStats();
                            await session.save();
                            break;

                        case 'audio_transcribed':
                            if (session.voiceRecords.length > 0) {
                                session.voiceRecords[0].transcription = data.transcription;
                                session.voiceRecords[0].transcribedAt = new Date();
                            }
                            session.aiMeta.totalTokensUsed = (session.aiMeta.totalTokensUsed || 0) + (data.tokensUsed || 0);
                            session.computeStats();
                            await session.save();
                            break;

                        case 'lacunes_detected':
                            session.lacunes = data.lacunes;
                            session.status = 'in_progress';
                            session.aiMeta.totalTokensUsed = (session.aiMeta.totalTokensUsed || 0) + (data.tokensUsed || 0);
                            session.computeStats();
                            await session.save();
                            break;

                        case 'questions_generated':
                            session.questions = data.questions;
                            session.aiMeta.questionsGeneratedAt = new Date();
                            session.aiMeta.totalTokensUsed = (session.aiMeta.totalTokensUsed || 0) + (data.tokensUsed || 0);
                            session.computeStats();
                            await session.save();
                            break;

                        case 'failed':
                            session.status = 'failed';
                            await session.save();
                            break;
                    }
                });
            } catch (error) {
                session.status = 'failed';
                await session.save();
                throw new Error(`Erreur traitement IA: ${error.message}`);
            }

            // Recharger la session complète
            return await MemorySession.findById(session._id);
        },

        // ========================================
        // AJOUTER UN ENREGISTREMENT VOCAL
        // ========================================
        addVoiceRecord: async (_, { sessionId, audioUrl, audioPublicId, audioDuration }, context) => {
            requireAuth(context);

            const student = await Student.findOne({ userId: context.user._id });
            if (!student) {
                throw new Error('Profil étudiant non trouvé');
            }

            const session = await MemorySession.findById(sessionId);
            if (!session) {
                throw new Error('Session non trouvée');
            }

            if (session.studentId.toString() !== student._id.toString()) {
                throw new Error('Accès refusé : cette session ne vous appartient pas');
            }

            // Transcrire le nouvel audio
            const transcriptionResult = await transcribeAudio(audioUrl, audioPublicId);

            // Ajouter le voice record
            session.voiceRecords.push({
                url: audioUrl,
                publicId: audioPublicId,
                duration: audioDuration || 0,
                transcription: transcriptionResult.transcription,
                transcribedAt: new Date(),
                recordedAt: new Date()
            });

            // Combiner toutes les transcriptions
            const allTranscriptions = session.voiceRecords
                .map(vr => vr.transcription || '')
                .filter(t => t.length > 0)
                .join('\n\n');

            // Extraire les thèmes du texte PDF
            const themes = session.lacunes.map(l => l.topic);
            const extractedText = session.pdf.extractedText || '';

            // Re-détecter les lacunes
            const lacunesResult = await detectLacunes(extractedText, allTranscriptions, themes);
            session.lacunes = lacunesResult.lacunes;

            // Regénérer les questions
            const questionsResult = await generateQuestions(lacunesResult.lacunes, extractedText, 5);
            session.questions = questionsResult.questions;
            session.answers = []; // Reset des réponses

            // Mettre à jour les tokens
            session.aiMeta.totalTokensUsed = (session.aiMeta.totalTokensUsed || 0) +
                (transcriptionResult.tokensUsed || 0) + (lacunesResult.tokensUsed || 0) + (questionsResult.tokensUsed || 0);
            session.aiMeta.questionsGeneratedAt = new Date();

            session.status = 'in_progress';
            session.computeStats();
            await session.save();

            return session;
        },

        // ========================================
        // SOUMETTRE UNE RÉPONSE
        // ========================================
        submitAnswer: async (_, { sessionId, questionId, answerText, answerVoiceUrl }, context) => {
            requireAuth(context);

            const student = await Student.findOne({ userId: context.user._id });
            if (!student) {
                throw new Error('Profil étudiant non trouvé');
            }

            const session = await MemorySession.findById(sessionId);
            if (!session) {
                throw new Error('Session non trouvée');
            }

            if (session.studentId.toString() !== student._id.toString()) {
                throw new Error('Accès refusé : cette session ne vous appartient pas');
            }

            // Trouver la question
            const question = session.questions.id(questionId);
            if (!question) {
                throw new Error('Question non trouvée dans cette session');
            }

            // Vérifier si déjà répondu
            const alreadyAnswered = session.answers.some(
                a => a.questionId.toString() === questionId.toString()
            );
            if (alreadyAnswered) {
                throw new Error('Vous avez déjà répondu à cette question');
            }

            // Évaluer la réponse avec Gemini
            const evaluation = await evaluateAnswer(
                question.questionText,
                question.correctAnswer || '',
                answerText || ''
            );

            // Ajouter la réponse
            session.answers.push({
                questionId: question._id,
                questionText: question.questionText,
                answerText: answerText || '',
                answerVoiceUrl: answerVoiceUrl || null,
                isCorrect: evaluation.isCorrect,
                scoreObtained: evaluation.score,
                aiFeedback: evaluation.feedback,
                hint: evaluation.hint,
                answeredAt: new Date()
            });

            // Mettre à jour les tokens
            session.aiMeta.totalTokensUsed = (session.aiMeta.totalTokensUsed || 0) + (evaluation.tokensUsed || 0);

            // Recalculer les stats
            session.computeStats();

            // Si toutes les questions sont répondues → session complétée
            if (session.answers.length >= session.questions.length) {
                session.status = 'completed';
                session.completedAt = new Date();
            }

            await session.save();

            return session;
        },

        // ========================================
        // SUPPRIMER UNE SESSION
        // ========================================
        deleteMemorySession: async (_, { sessionId }, context) => {
            requireAuth(context);

            const student = await Student.findOne({ userId: context.user._id });
            if (!student) {
                throw new Error('Profil étudiant non trouvé');
            }

            const session = await MemorySession.findById(sessionId);
            if (!session) {
                throw new Error('Session non trouvée');
            }

            if (session.studentId.toString() !== student._id.toString()) {
                throw new Error('Accès refusé : cette session ne vous appartient pas');
            }

            await MemorySession.findByIdAndDelete(sessionId);
            return true;
        }
    }
};

module.exports = memoryResolvers;
