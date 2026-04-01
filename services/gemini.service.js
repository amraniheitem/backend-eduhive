// services/gemini.service.js

const { GoogleGenerativeAI } = require("@google/generative-ai");
const cloudinary = require("cloudinary").v2;

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ========================================
// MODÈLES AVEC FALLBACK AUTOMATIQUE
// ========================================
const MODELS_FALLBACK = [
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-2.0-flash-001",
    "gemini-2.0-flash-lite",
    "gemini-2.5-flash-lite",
    "gemini-2.5-pro",
];

let currentModelIndex = 0;

function getModel() {
    const modelName = MODELS_FALLBACK[currentModelIndex];
    console.log(`📌 Modèle actif: ${modelName}`);
    return genAI.getGenerativeModel({ model: modelName });
}

// Wrapper intelligent : retry sur 429, rotation sur quota/404
async function callWithRetry(callFn, maxRetries = 12) {
    const exhaustedModels = new Set();

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        const modelName = MODELS_FALLBACK[currentModelIndex];

        // Si tous les modèles sont épuisés, attendre puis réinitialiser
        if (exhaustedModels.size >= MODELS_FALLBACK.length) {
            console.log(`⏳ Tous les modèles épuisés, attente de 40s...`);
            await new Promise((r) => setTimeout(r, 40000));
            exhaustedModels.clear();
        }

        // Sauter les modèles déjà épuisés
        if (exhaustedModels.has(modelName)) {
            currentModelIndex = (currentModelIndex + 1) % MODELS_FALLBACK.length;
            continue;
        }

        try {
            console.log(`🔄 Tentative ${attempt + 1}/${maxRetries} avec ${modelName}...`);
            return await callFn(getModel());
        } catch (err) {
            const msg = err.message || "";

            // 404 / not found → modèle inexistant, marquer et passer au suivant
            if (msg.includes("404") || msg.includes("not found")) {
                console.log(`❌ ${modelName} non trouvé, rotation...`);
                exhaustedModels.add(modelName);
                currentModelIndex = (currentModelIndex + 1) % MODELS_FALLBACK.length;
                continue;
            }

            // 429 / quota → marquer et passer au suivant
            if (msg.includes("429") || msg.includes("quota") || msg.includes("Too Many Requests") || msg.includes("RESOURCE_EXHAUSTED")) {
                console.log(`⚠️ Quota atteint sur ${modelName}`);
                exhaustedModels.add(modelName);
                currentModelIndex = (currentModelIndex + 1) % MODELS_FALLBACK.length;

                // Si pas tous épuisés, essayer le suivant immédiatement
                if (exhaustedModels.size < MODELS_FALLBACK.length) {
                    console.log(`🔄 Rotation vers ${MODELS_FALLBACK[currentModelIndex]}...`);
                }
                continue;
            }

            // Autre erreur → propager directement
            throw err;
        }
    }
    throw new Error("Aucun modèle Gemini disponible après plusieurs tentatives");
}

console.log("🔥 gemini.service.js avec fallback + retry automatique chargé");

// ========================================
// UTILITAIRES
// ========================================

async function urlToBase64(url, publicId) {
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

    const https = require("https");
    const http = require("http");

    // Helper: download a URL and return { base64, mimeType }
    function downloadUrl(targetUrl) {
        return new Promise((resolve, reject) => {
            const client = targetUrl.startsWith("https") ? https : http;
            client.get(targetUrl, (res) => {
                // Follow redirects (301, 302, 307, 308)
                if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
                    return downloadUrl(res.headers.location).then(resolve).catch(reject);
                }
                const chunks = [];
                res.on("data", (chunk) => chunks.push(chunk));
                res.on("end", () => {
                    if (res.statusCode === 200) {
                        const buffer = Buffer.concat(chunks);
                        const base64 = buffer.toString("base64");
                        const mimeType = res.headers["content-type"] || "application/octet-stream";
                        resolve({ base64, mimeType });
                    } else {
                        reject(new Error(`Status: ${res.statusCode} for ${targetUrl}`));
                    }
                });
                res.on("error", reject);
            }).on("error", reject);
        });
    }

    // Stratégie 1 : Essayer l'URL originale directement
    try {
        console.log("📥 Tentative 1 : URL originale directe...");
        const result = await downloadUrl(url);
        console.log(`✅ Téléchargement OK via URL originale: ${result.mimeType}`);
        return result;
    } catch (err1) {
        console.log(`⚠️ URL originale échouée (${err1.message}), tentative suivante...`);
    }

    // Stratégie 2 : URL non signée (sans signature)
    try {
        const finalPublicId = publicId || url
            .split("/upload/")[1]
            ?.replace(/^v\d+\//, "")
            ?.replace(/^s--[^/]+--\//, "");

        if (finalPublicId) {
            const isPdf = url.includes(".pdf") || url.includes("/raw/");
            const resourceType = isPdf ? "raw" : "video";

            const unsignedUrl = cloudinary.url(finalPublicId, {
                resource_type: resourceType,
                type: "upload",
                secure: true,
            });

            console.log("📥 Tentative 2 : URL non signée:", unsignedUrl);
            const result = await downloadUrl(unsignedUrl);
            console.log(`✅ Téléchargement OK via URL non signée: ${result.mimeType}`);
            return result;
        }
    } catch (err2) {
        console.log(`⚠️ URL non signée échouée (${err2.message}), tentative suivante...`);
    }

    // Stratégie 3 : URL signée (dernier recours)
    const finalPublicId = publicId || url
        .split("/upload/")[1]
        ?.replace(/^v\d+\//, "")
        ?.replace(/^s--[^/]+--\//, "");

    if (!finalPublicId) throw new Error("PublicId non trouvé dans l'URL");

    const isPdf = url.includes(".pdf") || url.includes("/raw/");
    const resourceType = isPdf ? "raw" : "video";

    const signedUrl = cloudinary.url(finalPublicId, {
        resource_type: resourceType,
        type: "upload",
        sign_url: true,
        secure: true,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
    });

    console.log("📥 Tentative 3 : URL signée:", signedUrl);
    const result = await downloadUrl(signedUrl);
    console.log(`✅ Téléchargement OK via URL signée: ${result.mimeType}`);
    return result;
}

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
// FONCTION 1 : ANALYSE PDF
// ========================================

async function analyzePDF(pdfUrl, publicId) {
    try {
        console.log("📄 Téléchargement PDF...");
        const { base64 } = await urlToBase64(pdfUrl, publicId);

        const result = await callWithRetry((model) =>
            model.generateContent([
                {
                    inlineData: {
                        data: base64,
                        mimeType: "application/pdf",
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
Retourne UNIQUEMENT le JSON, sans texte additionnel.`,
                },
            ])
        );

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
// FONCTION 2 : TRANSCRIPTION AUDIO
// ========================================

async function transcribeAudio(audioUrl, publicId) {
    try {
        console.log("🎤 Téléchargement audio...");
        const { base64, mimeType } = await urlToBase64(audioUrl, publicId);

        let audioMime = "audio/mpeg";
        if (audioUrl.includes(".3gp") || mimeType.includes("3gp")) audioMime = "video/3gpp";
        else if (audioUrl.includes(".wav") || mimeType.includes("wav")) audioMime = "audio/wav";
        else if (audioUrl.includes(".ogg") || mimeType.includes("ogg")) audioMime = "audio/ogg";
        else if (audioUrl.includes(".webm") || mimeType.includes("webm")) audioMime = "audio/webm";
        else if (audioUrl.includes(".m4a") || mimeType.includes("m4a")) audioMime = "audio/mp4";
        else if (mimeType.includes("audio") || mimeType.includes("video")) audioMime = mimeType;

        console.log(`🎵 Format audio: ${audioMime}`);

        const result = await callWithRetry((model) =>
            model.generateContent([
                {
                    inlineData: { data: base64, mimeType: audioMime },
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
            ])
        );

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
// FONCTION 3 : DÉTECTION LACUNES
// ========================================

async function detectLacunes(extractedText, transcription, themes) {
    try {
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

        const result = await callWithRetry((model) =>
            model.generateContent({
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
            })
        );

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
// FONCTION 4 : GÉNÉRATION QUESTIONS
// ========================================

async function generateQuestions(lacunes, extractedText, questionCount = 5) {
    try {
        const lacunesText = lacunes
            .map((l) => `- ${l.topic} (${l.severity}): ${l.description}`)
            .join("\n");

        const result = await callWithRetry((model) =>
            model.generateContent({
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
            })
        );

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
// FONCTION 5 : ÉVALUATION RÉPONSE
// ========================================

async function evaluateAnswer(questionText, correctAnswer, studentAnswer) {
    try {
        const result = await callWithRetry((model) =>
            model.generateContent({
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
            })
        );

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

module.exports = {
    analyzePDF,
    transcribeAudio,
    detectLacunes,
    generateQuestions,
    evaluateAnswer,
    processMemorySession,
};