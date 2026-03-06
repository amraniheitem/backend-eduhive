// services/gemini.service.js

const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require("axios");
const cloudinary = require("cloudinary").v2;

// ========================================
// CONFIGURATION CLOUDINARY (pour URL signées)
// ========================================
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ========================================
// INITIALISATION GEMINI
// ========================================

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
console.log("🔥 gemini.service.js VERSION CORRIGÉE chargée");
// ========================================
// UTILITAIRES
// ========================================

/**
 * Télécharge un fichier Cloudinary en base64
 * 1. Vérifie d'abord le cache mémoire global (bufferCache)
 * 2. Sinon, génère une URL signée Cloudinary pour téléchargement
 */
async function urlToBase64(url, publicId) {
    // 1. Vérifier le cache mémoire en priorité
    if (publicId && global.bufferCache && global.bufferCache.has(publicId)) {
        const cached = global.bufferCache.get(publicId);
        if (cached.expiresAt > Date.now()) {
            console.log(`🚀 Cache HIT pour ${publicId}`);
            return { base64: cached.base64, mimeType: cached.mimeType };
        }
        global.bufferCache.delete(publicId);
        console.log(`⚠️ Cache expiré pour ${publicId}`);
    }
    console.log(`❌ Cache MISS pour ${publicId} — tentative HTTP...`);

    return new Promise((resolve, reject) => {
        // Fallback: extraction du publicId si non fourni (backwards compatibility)
        const finalPublicId = publicId || url
            .split("/upload/")[1]
            ?.replace(/^v\d+\//, "");

        if (!finalPublicId) return reject(new Error("PublicId non trouvé dans l'URL"));

        // Détermine resource_type (raw pour pdf, video pour audio)
        const isPdf = url.includes(".pdf") || url.includes("/raw/");
        const resourceType = isPdf ? "raw" : "video";

        const signedUrl = cloudinary.url(finalPublicId, {
            resource_type: resourceType,
            type: "upload",
            sign_url: true,
            secure: true,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
        });

        console.log("🔑 URL signée générée:", signedUrl);

        const https = require("https");
        const http = require("http");
        const client = signedUrl.startsWith("https") ? https : http;

        client.get(signedUrl, (res) => {
            const chunks = [];
            res.on("data", (chunk) => chunks.push(chunk));
            res.on("end", () => {
                if (res.statusCode === 200) {
                    const buffer = Buffer.concat(chunks);
                    const base64 = buffer.toString("base64");
                    const mimeType = res.headers["content-type"] || "application/octet-stream";
                    console.log(`✅ Téléchargement OK via URL signée: ${mimeType}`);
                    resolve({ base64, mimeType });
                } else {
                    reject(new Error(`Status: ${res.statusCode} for ${signedUrl}`));
                }
            });
            res.on("error", reject);
        }).on("error", reject);
    });
}
/**
 * Parse JSON en nettoyant les backticks markdown de Gemini
 */
function safeParseJSON(text) {
    try {
        let cleaned = text.trim();
        cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, "");
        cleaned = cleaned.replace(/\n?```\s*$/i, "");
        cleaned = cleaned.trim();
        return JSON.parse(cleaned);
    } catch (error) {
        throw new Error(
            `Erreur parsing JSON: ${error.message}. Reçu: ${text.substring(0, 200)}`
        );
    }
}

// ========================================
// FONCTION 1 : ANALYSE PDF (Gemini Vision)
// ========================================

async function analyzePDF(pdfUrl, publicId) {
    try {
        console.log("📄 Téléchargement PDF...");
        const { base64 } = await urlToBase64(pdfUrl, publicId);

        const result = await model.generateContent([
            {
                inlineData: {
                    data: base64,
                    mimeType: "application/pdf", // toujours PDF
                },
            },
            {
                text: `Analyse ce document PDF de cours en détail. Retourne un JSON avec exactement cette structure :
{
  "extractedText": "Le texte complet extrait du document",
  "themes": ["thème1", "thème2"],
  "keyPoints": ["point clé 1", "point clé 2"],
  "summary": "Un résumé concis du document",
  "estimatedDifficulty": "easy|medium|hard"
}

Sois très précis dans l'extraction du texte. Identifie tous les thèmes et concepts importants.
Retourne UNIQUEMENT le JSON, sans texte additionnel.`,
            },
        ]);

        const response = result.response;
        const text = response.text();
        const parsed = safeParseJSON(text);
        const tokensUsed = response.usageMetadata?.totalTokenCount || 0;

        console.log(`✅ PDF analysé — ${tokensUsed} tokens`);

        return {
            extractedText: parsed.extractedText || "",
            themes: parsed.themes || [],
            keyPoints: parsed.keyPoints || [],
            summary: parsed.summary || "",
            estimatedDifficulty: parsed.estimatedDifficulty || "medium",
            tokensUsed,
        };
    } catch (error) {
        console.error("Erreur analyzePDF:", error);
        throw new Error(`Erreur analyse PDF: ${error.message}`);
    }
}

// ========================================
// FONCTION 2 : TRANSCRIPTION AUDIO (Gemini)
// ========================================

async function transcribeAudio(audioUrl, publicId) {
    try {
        console.log("🎤 Téléchargement audio...");
        const { base64, mimeType } = await urlToBase64(audioUrl, publicId);

        // Déterminer le bon MIME type pour Gemini
        let audioMime = "audio/mpeg"; // défaut
        if (audioUrl.includes(".3gp") || mimeType.includes("3gp")) {
            audioMime = "video/3gpp";
        } else if (audioUrl.includes(".wav") || mimeType.includes("wav")) {
            audioMime = "audio/wav";
        } else if (audioUrl.includes(".ogg") || mimeType.includes("ogg")) {
            audioMime = "audio/ogg";
        } else if (audioUrl.includes(".webm") || mimeType.includes("webm")) {
            audioMime = "audio/webm";
        } else if (audioUrl.includes(".m4a") || mimeType.includes("m4a")) {
            audioMime = "audio/mp4";
        } else if (mimeType.includes("audio") || mimeType.includes("video")) {
            audioMime = mimeType;
        }

        console.log(`🎵 Format audio: ${audioMime}`);

        const result = await model.generateContent([
            {
                inlineData: {
                    data: base64,
                    mimeType: audioMime,
                },
            },
            {
                text: `Transcris fidèlement cet enregistrement audio. C'est un étudiant qui récite ce qu'il a mémorisé d'un cours.
Retourne un JSON avec exactement cette structure :
{
  "transcription": "Le texte transcrit fidèlement",
  "language": "fr|ar|en",
  "confidence": 0.95,
  "isEmpty": false
}

Si l'audio est vide ou inaudible, mets isEmpty à true et transcription à "".
Retourne UNIQUEMENT le JSON, sans texte additionnel.`,
            },
        ]);

        const response = result.response;
        const text = response.text();
        const parsed = safeParseJSON(text);
        const tokensUsed = response.usageMetadata?.totalTokenCount || 0;

        console.log(`✅ Audio transcrit — ${tokensUsed} tokens`);

        return {
            transcription: parsed.transcription || "",
            language: parsed.language || "fr",
            confidence: parsed.confidence || 0,
            isEmpty: parsed.isEmpty || false,
            tokensUsed,
        };
    } catch (error) {
        console.error("Erreur transcribeAudio:", error);
        throw new Error(`Erreur transcription audio: ${error.message}`);
    }
}

// ========================================
// FONCTION 3 : DÉTECTION LACUNES (Gemini Text)
// ========================================

async function detectLacunes(extractedText, transcription, themes) {
    try {
        // Transcription vide → tout est lacune
        if (!transcription || transcription.trim().length < 10) {
            return {
                lacunes: themes.map((t) => ({
                    topic: t,
                    description: "L'étudiant n'a pas abordé ce thème dans sa récitation",
                    severity: "high",
                })),
                masteredTopics: [],
                globalUnderstanding: 0,
                feedback: "L'étudiant n'a pas fourni de récitation suffisante.",
                tokensUsed: 0,
            };
        }

        const result = await model.generateContent({
            contents: [{
                role: "user",
                parts: [{
                    text: `Tu es un expert pédagogique. Compare le contenu d'un cours avec la récitation d'un étudiant.

CONTENU DU COURS :
${extractedText.substring(0, 3000)}

THÈMES DU COURS :
${themes.join(", ")}

RÉCITATION DE L'ÉTUDIANT :
${transcription}

Retourne un JSON :
{
  "lacunes": [
    { "topic": "nom du thème", "description": "ce qui manque", "severity": "low|medium|high" }
  ],
  "masteredTopics": ["thème bien maîtrisé"],
  "globalUnderstanding": 65,
  "feedback": "Feedback encourageant"
}

globalUnderstanding = score de 0 à 100.
Retourne UNIQUEMENT le JSON.`,
                }],
            }],
        });

        const response = result.response;
        const parsed = safeParseJSON(response.text());
        const tokensUsed = response.usageMetadata?.totalTokenCount || 0;

        console.log(`✅ Lacunes détectées — ${tokensUsed} tokens`);

        return {
            lacunes: parsed.lacunes || [],
            masteredTopics: parsed.masteredTopics || [],
            globalUnderstanding: parsed.globalUnderstanding || 0,
            feedback: parsed.feedback || "",
            tokensUsed,
        };
    } catch (error) {
        console.error("Erreur detectLacunes:", error);
        throw new Error(`Erreur détection lacunes: ${error.message}`);
    }
}

// ========================================
// FONCTION 4 : GÉNÉRATION QUESTIONS (Gemini Text)
// ========================================

async function generateQuestions(lacunes, extractedText, questionCount = 5) {
    try {
        const lacunesText = lacunes
            .map((l) => `- ${l.topic} (${l.severity}): ${l.description}`)
            .join("\n");

        const result = await model.generateContent({
            contents: [{
                role: "user",
                parts: [{
                    text: `Tu es un professeur expert. Génère ${questionCount} questions ciblées sur les lacunes.

LACUNES :
${lacunesText}

COURS (contexte) :
${extractedText.substring(0, 2000)}

Retourne un JSON :
{
  "questions": [
    {
      "questionText": "La question",
      "type": "open|mcq|true_false",
      "options": ["A", "B", "C", "D"],
      "correctAnswer": "La bonne réponse",
      "topic": "Thème ciblé",
      "difficulty": "easy|medium|hard",
      "isLacune": true,
      "explanation": "Explication"
    }
  ]
}

open → options = [] | true_false → ["Vrai","Faux"] | mcq → 4 options.
Retourne UNIQUEMENT le JSON.`,
                }],
            }],
        });

        const response = result.response;
        const parsed = safeParseJSON(response.text());
        const tokensUsed = response.usageMetadata?.totalTokenCount || 0;

        console.log(`✅ Questions générées — ${tokensUsed} tokens`);

        return {
            questions: (parsed.questions || []).map((q) => ({
                ...q,
                generatedAt: new Date(),
            })),
            tokensUsed,
        };
    } catch (error) {
        console.error("Erreur generateQuestions:", error);
        throw new Error(`Erreur génération questions: ${error.message}`);
    }
}

// ========================================
// FONCTION 5 : ÉVALUATION RÉPONSE (Gemini Text)
// ========================================

async function evaluateAnswer(questionText, correctAnswer, studentAnswer) {
    try {
        const result = await model.generateContent({
            contents: [{
                role: "user",
                parts: [{
                    text: `Tu es un correcteur bienveillant. Évalue la réponse d'un étudiant.

QUESTION : ${questionText}
RÉPONSE ATTENDUE : ${correctAnswer}
RÉPONSE ÉTUDIANT : ${studentAnswer}

Retourne un JSON :
{
  "isCorrect": true,
  "score": 75,
  "feedback": "Feedback encourageant",
  "hint": "Indice si incorrect, sinon null"
}

isCorrect = true si score >= 60. Retourne UNIQUEMENT le JSON.`,
                }],
            }],
        });

        const response = result.response;
        const parsed = safeParseJSON(response.text());
        const tokensUsed = response.usageMetadata?.totalTokenCount || 0;
        const score = parsed.score || 0;

        return {
            isCorrect: score >= 60,
            score,
            feedback: parsed.feedback || "",
            hint: parsed.hint || null,
            tokensUsed,
        };
    } catch (error) {
        console.error("Erreur evaluateAnswer:", error);
        throw new Error(`Erreur évaluation réponse: ${error.message}`);
    }
}

// ========================================
// FONCTION 6 : ORCHESTRATION COMPLÈTE
// ========================================

async function processMemorySession(pdfUrl, pdfPublicId, audioUrl, audioPublicId, onStepComplete) {
    let totalTokensUsed = 0;

    try {
        // ÉTAPE 1 — Analyse PDF
        console.log("📄 Étape 1/4 : Analyse du PDF...");
        const pdfAnalysis = await analyzePDF(pdfUrl, pdfPublicId);
        totalTokensUsed += pdfAnalysis.tokensUsed;
        await onStepComplete("pdf_analyzed", {
            extractedText: pdfAnalysis.extractedText,
            themes: pdfAnalysis.themes,
            keyPoints: pdfAnalysis.keyPoints,
            summary: pdfAnalysis.summary,
            estimatedDifficulty: pdfAnalysis.estimatedDifficulty,
            tokensUsed: pdfAnalysis.tokensUsed,
        });

        // ÉTAPE 2 — Transcription audio
        console.log("🎤 Étape 2/4 : Transcription audio...");
        const audioTranscription = await transcribeAudio(audioUrl, audioPublicId);
        totalTokensUsed += audioTranscription.tokensUsed;
        await onStepComplete("audio_transcribed", {
            transcription: audioTranscription.transcription,
            language: audioTranscription.language,
            confidence: audioTranscription.confidence,
            isEmpty: audioTranscription.isEmpty,
            tokensUsed: audioTranscription.tokensUsed,
        });

        // ÉTAPE 3 — Détection lacunes
        console.log("🔍 Étape 3/4 : Détection des lacunes...");
        const lacunesResult = await detectLacunes(
            pdfAnalysis.extractedText,
            audioTranscription.transcription,
            pdfAnalysis.themes
        );
        totalTokensUsed += lacunesResult.tokensUsed;
        await onStepComplete("lacunes_detected", {
            lacunes: lacunesResult.lacunes,
            masteredTopics: lacunesResult.masteredTopics,
            globalUnderstanding: lacunesResult.globalUnderstanding,
            feedback: lacunesResult.feedback,
            tokensUsed: lacunesResult.tokensUsed,
        });

        // ÉTAPE 4 — Génération questions
        console.log("❓ Étape 4/4 : Génération des questions...");
        const questionsResult = await generateQuestions(
            lacunesResult.lacunes,
            pdfAnalysis.extractedText,
            5
        );
        totalTokensUsed += questionsResult.tokensUsed;
        await onStepComplete("questions_generated", {
            questions: questionsResult.questions,
            tokensUsed: questionsResult.tokensUsed,
        });

        console.log(`✅ Session terminée — Total: ${totalTokensUsed} tokens`);

        return {
            pdfAnalysis,
            audioTranscription,
            lacunes: lacunesResult,
            questions: questionsResult,
            totalTokensUsed,
        };
    } catch (error) {
        console.error("❌ Erreur processMemorySession:", error);
        await onStepComplete("failed", { error: error.message });
        throw error;
    }
}

// ========================================
// EXPORTS
// ========================================

module.exports = {
    analyzePDF,
    transcribeAudio,
    detectLacunes,
    generateQuestions,
    evaluateAnswer,
    processMemorySession,
};