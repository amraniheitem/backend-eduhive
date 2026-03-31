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

async function callWithRetry(callFn, maxRetries = 12) {
    const exhaustedModels = new Set();

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        const modelName = MODELS_FALLBACK[currentModelIndex];

        if (exhaustedModels.size >= MODELS_FALLBACK.length) {
            console.log(`⏳ Tous les modèles épuisés, attente de 40s...`);
            await new Promise((r) => setTimeout(r, 40000));
            exhaustedModels.clear();
        }

        if (exhaustedModels.has(modelName)) {
            currentModelIndex = (currentModelIndex + 1) % MODELS_FALLBACK.length;
            continue;
        }

        try {
            console.log(`🔄 Tentative ${attempt + 1}/${maxRetries} avec ${modelName}...`);
            return await callFn(getModel());
        } catch (err) {
            const msg = err.message || "";

            if (msg.includes("404") || msg.includes("not found")) {
                console.log(`❌ ${modelName} non trouvé, rotation...`);
                exhaustedModels.add(modelName);
                currentModelIndex = (currentModelIndex + 1) % MODELS_FALLBACK.length;
                continue;
            }

            if (msg.includes("429") || msg.includes("quota") || msg.includes("Too Many Requests") || msg.includes("RESOURCE_EXHAUSTED")) {
                console.log(`⚠️ Quota atteint sur ${modelName}`);
                exhaustedModels.add(modelName);
                currentModelIndex = (currentModelIndex + 1) % MODELS_FALLBACK.length;
                if (exhaustedModels.size < MODELS_FALLBACK.length) {
                    console.log(`🔄 Rotation vers ${MODELS_FALLBACK[currentModelIndex]}...`);
                }
                continue;
            }

            throw err;
        }
    }
    throw new Error("Aucun modèle Gemini disponible après plusieurs tentatives");
}

console.log("🔥 gemini.service.js avec fallback + retry + langue dynamique chargé");

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

    function downloadUrl(targetUrl) {
        return new Promise((resolve, reject) => {
            const client = targetUrl.startsWith("https") ? https : http;
            client.get(targetUrl, (res) => {
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

    try {
        console.log("📥 Tentative 1 : URL originale directe...");
        const result = await downloadUrl(url);
        console.log(`✅ Téléchargement OK via URL originale: ${result.mimeType}`);
        return result;
    } catch (err1) {
        console.log(`⚠️ URL originale échouée (${err1.message}), tentative suivante...`);
    }

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
// ✅ MODIFIÉ : détecte la langue du document
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
                    // ✅ Ajout du champ "language" pour détecter la langue du PDF
                    text: `Analyse ce document PDF. JSON only:
{
  "extractedText": "texte complet extrait",
  "themes": ["thème1", "thème2"],
  "keyPoints": ["point1", "point2"],
  "summary": "résumé court",
  "estimatedDifficulty": "easy|medium|hard",
  "language": "fr|ar|en|es|de"
}`,
                },
            ])
        );

        const response = result.response;
        const text = response.text();
        const parsed = safeParseJSON(text);
        const tokensUsed = response.usageMetadata?.totalTokenCount || 0;

        // ✅ language est maintenant retourné
        const language = parsed.language || "fr";
        console.log(`✅ PDF analysé — langue: ${language} — ${tokensUsed} tokens`);

        return {
            extractedText: parsed.extractedText || "",
            themes: parsed.themes || [],
            keyPoints: parsed.keyPoints || [],
            summary: parsed.summary || "",
            estimatedDifficulty: parsed.estimatedDifficulty || "medium",
            language,
            tokensUsed,
        };
    } catch (error) {
        console.error("Erreur analyzePDF:", error);
        throw new Error(`Erreur analyse PDF: ${error.message}`);
    }
}

// ========================================
// FONCTION 2 : TRANSCRIPTION AUDIO
// ✅ MODIFIÉ : prompt adapté à la langue du PDF
// ========================================

async function transcribeAudio(audioUrl, publicId, lang = "fr") {
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
                    text: `Transcris fidèlement cet audio.
Retourne UNIQUEMENT ce JSON (sans markdown) :
{
  "transcription": "le texte transcrit",
  "language": "ar|fr|en",
  "confidence": 0.95,
  "isEmpty": false,
  "detectedContent": "courte description de ce que tu as entendu"
}`,
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
            language: parsed.language || lang,
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
// ✅ MODIFIÉ : répond dans la langue du PDF
// ========================================

async function detectLacunes(extractedText, transcription, themes, lang = "fr") {
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
                        // ✅ Prompt raccourci, langue transmise dynamiquement
                        text: `Expert pedagogue. Compare course vs student recitation. Answer in ${lang}. JSON only:
COURSE: ${extractedText.substring(0, 2000)}
THEMES: ${themes.join(", ")}
RECITATION: ${transcription}
{"lacunes":[{"topic":"","description":"","severity":"low|medium|high"}],"masteredTopics":[],"globalUnderstanding":0,"feedback":""}
globalUnderstanding = 0-100.`,
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
// ✅ MODIFIÉ : questions générées dans la langue du PDF
// ========================================

async function generateQuestions(lacunes, extractedText, questionCount = 5, lang = "fr") {
    try {
        const lacunesText = lacunes
            .map((l) => `- ${l.topic} (${l.severity}): ${l.description}`)
            .join("\n");

        const result = await callWithRetry((model) =>
            model.generateContent({
                contents: [{
                    role: "user",
                    parts: [{
                        // ✅ Prompt raccourci, langue transmise dynamiquement
                        text: `Expert teacher. Generate ${questionCount} questions targeting gaps. Language: ${lang}. JSON only:
GAPS: ${lacunesText}
COURSE: ${extractedText.substring(0, 1500)}
{"questions":[{"questionText":"","type":"open|mcq|true_false","options":[],"correctAnswer":"","topic":"","difficulty":"easy|medium|hard","isLacune":true,"explanation":""}]}
open→options=[] | true_false→["Vrai","Faux"] | mcq→4 options.`,
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
// ✅ MODIFIÉ : feedback dans la langue du PDF
// ========================================

async function evaluateAnswer(questionText, correctAnswer, studentAnswer, lang = "fr") {
    try {
        const result = await callWithRetry((model) =>
            model.generateContent({
                contents: [{
                    role: "user",
                    parts: [{
                        // ✅ Prompt raccourci, langue transmise dynamiquement
                        text: `Evaluate student answer. Answer in ${lang}. JSON only:
Q: ${questionText}
EXPECTED: ${correctAnswer}
STUDENT: ${studentAnswer}
{"isCorrect":true,"score":75,"feedback":"...","hint":null}
isCorrect=true if score>=60. hint=null if correct.`,
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
// ✅ MODIFIÉ : lang propagée à toutes les étapes
// ========================================

async function processMemorySession(pdfUrl, pdfPublicId, audioUrl, audioPublicId, onStepComplete) {
    let totalTokensUsed = 0;

    try {
        console.log("📄 Étape 1/4 : Analyse du PDF...");
        const pdfAnalysis = await analyzePDF(pdfUrl, pdfPublicId);
        totalTokensUsed += pdfAnalysis.tokensUsed;

        // ✅ On récupère la langue ici et on la propage à toutes les étapes suivantes
        const lang = pdfAnalysis.language || "fr";
        console.log(`🌍 Langue détectée: ${lang}`);

        await onStepComplete("pdf_analyzed", {
            extractedText: pdfAnalysis.extractedText,
            themes: pdfAnalysis.themes,
            keyPoints: pdfAnalysis.keyPoints,
            summary: pdfAnalysis.summary,
            estimatedDifficulty: pdfAnalysis.estimatedDifficulty,
            language: lang,
            tokensUsed: pdfAnalysis.tokensUsed,
        });

        console.log("🎤 Étape 2/4 : Transcription audio...");
        // ✅ lang passée ici
        const audioTranscription = await transcribeAudio(audioUrl, audioPublicId, lang);
        totalTokensUsed += audioTranscription.tokensUsed;
        await onStepComplete("audio_transcribed", {
            transcription: audioTranscription.transcription,
            language: audioTranscription.language,
            confidence: audioTranscription.confidence,
            isEmpty: audioTranscription.isEmpty,
            tokensUsed: audioTranscription.tokensUsed,
        });

        // Utiliser la langue de l'audio si détectée, sinon la langue du PDF
        const finalLang = audioTranscription.language || lang;

        console.log("🔍 Étape 3/4 : Détection des lacunes...");
        // ✅ lang passée ici (langue de l'audio)
        const lacunesResult = await detectLacunes(
            pdfAnalysis.extractedText,
            audioTranscription.transcription,
            pdfAnalysis.themes,
            finalLang
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
        // ✅ lang passée ici (langue de l'audio)
        const questionsResult = await generateQuestions(
            lacunesResult.lacunes,
            pdfAnalysis.extractedText,
            5,
            finalLang
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