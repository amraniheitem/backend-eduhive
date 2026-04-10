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
            if (
                msg.includes("429") ||
                msg.includes("quota") ||
                msg.includes("Too Many Requests") ||
                msg.includes("RESOURCE_EXHAUSTED")
            ) {
                console.log(`⚠️ Quota atteint sur ${modelName}`);
                exhaustedModels.add(modelName);
                currentModelIndex = (currentModelIndex + 1) % MODELS_FALLBACK.length;

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

console.log("🔥 gemini.service.js avec fallback + retry + multilingue chargé");

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
            client
                .get(targetUrl, (res) => {
                    if (
                        [301, 302, 307, 308].includes(res.statusCode) &&
                        res.headers.location
                    ) {
                        return downloadUrl(res.headers.location)
                            .then(resolve)
                            .catch(reject);
                    }
                    const chunks = [];
                    res.on("data", (chunk) => chunks.push(chunk));
                    res.on("end", () => {
                        if (res.statusCode === 200) {
                            const buffer = Buffer.concat(chunks);
                            const base64 = buffer.toString("base64");
                            const mimeType =
                                res.headers["content-type"] ||
                                "application/octet-stream";
                            resolve({ base64, mimeType });
                        } else {
                            reject(
                                new Error(
                                    `Status: ${res.statusCode} for ${targetUrl}`
                                )
                            );
                        }
                    });
                    res.on("error", reject);
                })
                .on("error", reject);
        });
    }

    // Stratégie 1 : URL originale directe
    try {
        console.log("📥 Tentative 1 : URL originale directe...");
        const result = await downloadUrl(url);
        console.log(`✅ Téléchargement OK via URL originale: ${result.mimeType}`);
        return result;
    } catch (err1) {
        console.log(
            `⚠️ URL originale échouée (${err1.message}), tentative suivante...`
        );
    }

    // Stratégie 2 : URL non signée
    try {
        const finalPublicId =
            publicId ||
            url
                .split("/upload/")[1]
                ?.replace(/^v\d+\//, "")
                ?.replace(/^s--[^/]+--\//, "");

        if (finalPublicId) {
            const isPdf =
                url.includes(".pdf") || url.includes("/raw/");
            const resourceType = isPdf ? "raw" : "video";

            const unsignedUrl = cloudinary.url(finalPublicId, {
                resource_type: resourceType,
                type: "upload",
                secure: true,
            });

            console.log("📥 Tentative 2 : URL non signée:", unsignedUrl);
            const result = await downloadUrl(unsignedUrl);
            console.log(
                `✅ Téléchargement OK via URL non signée: ${result.mimeType}`
            );
            return result;
        }
    } catch (err2) {
        console.log(
            `⚠️ URL non signée échouée (${err2.message}), tentative suivante...`
        );
    }

    // Stratégie 3 : URL signée (dernier recours)
    const finalPublicId =
        publicId ||
        url
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
// LANGUES : LABELS ET INSTRUCTIONS
// ========================================

const LANG_CONFIG = {
    ar: {
        // Analyse PDF
        pdfPrompt: `حلّل هذا المستند التعليمي بالتفصيل. أعد JSON بهذا الشكل بالضبط:
{
  "extractedText": "النص الكامل المستخرج من المستند",
  "themes": ["الموضوع 1", "الموضوع 2"],
  "keyPoints": ["النقطة الرئيسية 1", "النقطة الرئيسية 2"],
  "summary": "ملخص موجز للمستند",
  "estimatedDifficulty": "easy|medium|hard"
}
أعد JSON فقط، بدون أي نص إضافي.`,

        // Transcription
        transcribePrompt: `انسخ هذا التسجيل الصوتي بأمانة. هذا طالب يتذكر ما حفظه من درس.
أعد JSON بهذا الشكل بالضبط:
{
  "transcription": "النص المنسوخ بأمانة",
  "language": "ar",
  "confidence": 0.95,
  "isEmpty": false
}
إذا كان الصوت فارغاً أو غير مسموع، اجعل isEmpty = true و transcription = "".
أعد JSON فقط، بدون أي نص إضافي.`,

        // Correction arabe
        correctPrompt: (raw, context) => `أنت خبير في تصحيح النصوص العربية. مهمتك: تصحيح نص شفهي تم تحويله آلياً إلى نص مكتوب.

السياق: طالب يستذكر درساً أكاديمياً.

النص الأصلي (قد يحتوي على أخطاء إملائية أو لفظية):
${raw}

سياق الدرس (للمساعدة في التصحيح):
${context.substring(0, 600)}

التعليمات:
1. صحّح الأخطاء الإملائية والنحوية الواضحة فقط
2. أضف تشكيلاً جزئياً للكلمات الغامضة عند الضرورة
3. حافظ على المعنى الأصلي للطالب — لا تضف معلومات جديدة
4. لا تُكمل الجمل الناقصة

أعد JSON فقط:
{
  "corrected": "النص المصحح",
  "corrections": ["وصف التصحيح 1", "وصف التصحيح 2"],
  "confidence": 0.90
}`,

        // Détection lacunes
        lacunesInstruction: "أنت خبير تربوي. قارن محتوى الدرس مع استذكار الطالب.",
        courseLabel: "محتوى الدرس:",
        themesLabel: "مواضيع الدرس:",
        recitationLabel: "استذكار الطالب:",
        lacunesJsonGuide: `أعد JSON فقط:
{
  "lacunes": [
    { "topic": "اسم الموضوع", "description": "ما يفتقده الطالب", "severity": "low|medium|high" }
  ],
  "masteredTopics": ["موضوع متقن"],
  "globalUnderstanding": 65,
  "feedback": "تغذية راجعة تشجيعية"
}
globalUnderstanding = نقطة من 0 إلى 100. أعد JSON فقط.`,

        // Génération questions
        questionsInstruction: (count) =>
            `أنت أستاذ خبير. اصنع ${count} أسئلة مستهدفة على الثغرات.`,
        gapsLabel: "الثغرات:",
        courseContextLabel: "الدرس (سياق):",
        questionsJsonGuide: `أعد JSON فقط:
{
  "questions": [
    {
      "questionText": "نص السؤال",
      "type": "open|mcq|true_false",
      "options": ["أ", "ب", "ج", "د"],
      "correctAnswer": "الجواب الصحيح",
      "topic": "الموضوع المستهدف",
      "difficulty": "easy|medium|hard",
      "isLacune": true,
      "explanation": "شرح الجواب"
    }
  ]
}
open → options = [] | true_false → ["صح","خطأ"] | mcq → 4 خيارات. أعد JSON فقط.`,

        // Évaluation réponse
        evaluateInstruction: "أنت مصحح متفهم. قيّم إجابة الطالب.",
        questionLabel: "السؤال:",
        expectedLabel: "الإجابة المتوقعة:",
        studentLabel: "إجابة الطالب:",
        evaluateJsonGuide: `أعد JSON فقط:
{
  "isCorrect": true,
  "score": 75,
  "feedback": "تغذية راجعة تشجيعية",
  "hint": "تلميح إذا كانت الإجابة خاطئة، وإلا null"
}
isCorrect = true إذا كان score >= 60. أعد JSON فقط.`,
    },

    en: {
        pdfPrompt: `Analyze this course document in detail. Return a JSON with exactly this structure:
{
  "extractedText": "The full text extracted from the document",
  "themes": ["theme1", "theme2"],
  "keyPoints": ["key point 1", "key point 2"],
  "summary": "A concise summary of the document",
  "estimatedDifficulty": "easy|medium|hard"
}
Return ONLY the JSON, no additional text.`,

        transcribePrompt: `Transcribe this audio recording faithfully. A student is reciting what they memorized from a course.
Return a JSON with exactly this structure:
{
  "transcription": "The faithfully transcribed text",
  "language": "en",
  "confidence": 0.95,
  "isEmpty": false
}
If the audio is empty or inaudible, set isEmpty to true and transcription to "".
Return ONLY the JSON, no additional text.`,

        lacunesInstruction:
            "You are a pedagogical expert. Compare the course content with the student's recitation.",
        courseLabel: "COURSE CONTENT:",
        themesLabel: "COURSE THEMES:",
        recitationLabel: "STUDENT RECITATION:",
        lacunesJsonGuide: `Return a JSON:
{
  "lacunes": [
    { "topic": "topic name", "description": "what is missing", "severity": "low|medium|high" }
  ],
  "masteredTopics": ["well-mastered topic"],
  "globalUnderstanding": 65,
  "feedback": "Encouraging feedback"
}
globalUnderstanding = score from 0 to 100. Return ONLY the JSON.`,

        questionsInstruction: (count) =>
            `You are an expert teacher. Generate ${count} targeted questions on the gaps.`,
        gapsLabel: "GAPS:",
        courseContextLabel: "COURSE (context):",
        questionsJsonGuide: `Return a JSON:
{
  "questions": [
    {
      "questionText": "The question",
      "type": "open|mcq|true_false",
      "options": ["A", "B", "C", "D"],
      "correctAnswer": "The correct answer",
      "topic": "Targeted theme",
      "difficulty": "easy|medium|hard",
      "isLacune": true,
      "explanation": "Explanation"
    }
  ]
}
open → options = [] | true_false → ["True","False"] | mcq → 4 options. Return ONLY the JSON.`,

        evaluateInstruction:
            "You are a supportive grader. Evaluate the student's answer.",
        questionLabel: "QUESTION:",
        expectedLabel: "EXPECTED ANSWER:",
        studentLabel: "STUDENT ANSWER:",
        evaluateJsonGuide: `Return a JSON:
{
  "isCorrect": true,
  "score": 75,
  "feedback": "Encouraging feedback",
  "hint": "Hint if incorrect, otherwise null"
}
isCorrect = true if score >= 60. Return ONLY the JSON.`,
    },

    fr: {
        pdfPrompt: `Analyse ce document PDF de cours en détail. Retourne un JSON avec exactement cette structure :
{
  "extractedText": "Le texte complet extrait du document",
  "themes": ["thème1", "thème2"],
  "keyPoints": ["point clé 1", "point clé 2"],
  "summary": "Un résumé concis du document",
  "estimatedDifficulty": "easy|medium|hard"
}
Retourne UNIQUEMENT le JSON, sans texte additionnel.`,

        transcribePrompt: `Transcris fidèlement cet enregistrement audio. C'est un étudiant qui récite ce qu'il a mémorisé d'un cours.
Retourne un JSON avec exactement cette structure :
{
  "transcription": "Le texte transcrit fidèlement",
  "language": "fr|ar|en",
  "confidence": 0.95,
  "isEmpty": false
}
Si l'audio est vide ou inaudible, mets isEmpty à true et transcription à "".
Retourne UNIQUEMENT le JSON, sans texte additionnel.`,

        lacunesInstruction:
            "Tu es un expert pédagogique. Compare le contenu d'un cours avec la récitation d'un étudiant.",
        courseLabel: "CONTENU DU COURS :",
        themesLabel: "THÈMES DU COURS :",
        recitationLabel: "RÉCITATION DE L'ÉTUDIANT :",
        lacunesJsonGuide: `Retourne un JSON :
{
  "lacunes": [
    { "topic": "nom du thème", "description": "ce qui manque", "severity": "low|medium|high" }
  ],
  "masteredTopics": ["thème bien maîtrisé"],
  "globalUnderstanding": 65,
  "feedback": "Feedback encourageant"
}
globalUnderstanding = score de 0 à 100. Retourne UNIQUEMENT le JSON.`,

        questionsInstruction: (count) =>
            `Tu es un professeur expert. Génère ${count} questions ciblées sur les lacunes.`,
        gapsLabel: "LACUNES :",
        courseContextLabel: "COURS (contexte) :",
        questionsJsonGuide: `Retourne un JSON :
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
open → options = [] | true_false → ["Vrai","Faux"] | mcq → 4 options. Retourne UNIQUEMENT le JSON.`,

        evaluateInstruction:
            "Tu es un correcteur bienveillant. Évalue la réponse d'un étudiant.",
        questionLabel: "QUESTION :",
        expectedLabel: "RÉPONSE ATTENDUE :",
        studentLabel: "RÉPONSE ÉTUDIANT :",
        evaluateJsonGuide: `Retourne un JSON :
{
  "isCorrect": true,
  "score": 75,
  "feedback": "Feedback encourageant",
  "hint": "Indice si incorrect, sinon null"
}
isCorrect = true si score >= 60. Retourne UNIQUEMENT le JSON.`,
    },
};

function getLang(language) {
    return LANG_CONFIG[language] || LANG_CONFIG["fr"];
}

// ========================================
// FONCTION 0 : CORRECTION TRANSCRIPTION ARABE
// ========================================

async function correctArabicTranscription(rawTranscription, courseContext = "") {
    try {
        const lang = getLang("ar");
        const result = await callWithRetry((model) =>
            model.generateContent({
                contents: [
                    {
                        role: "user",
                        parts: [
                            {
                                text: lang.correctPrompt(rawTranscription, courseContext),
                            },
                        ],
                    },
                ],
            })
        );

        const response = result.response;
        const parsed = safeParseJSON(response.text());
        const tokensUsed = response.usageMetadata?.totalTokenCount || 0;

        console.log(
            `✅ Correction arabe: ${parsed.corrections?.length || 0} corrections — ${tokensUsed} tokens`
        );

        return {
            corrected: parsed.corrected || rawTranscription,
            corrections: parsed.corrections || [],
            confidence: parsed.confidence || 0,
            tokensUsed,
        };
    } catch (error) {
        console.error("Erreur correctArabicTranscription:", error);
        // En cas d'erreur, on retourne la transcription brute sans planter
        return {
            corrected: rawTranscription,
            corrections: [],
            confidence: 0,
            tokensUsed: 0,
        };
    }
}

// ========================================
// FONCTION 1 : ANALYSE PDF
// ========================================

async function analyzePDF(pdfUrl, publicId, language = "fr") {
    try {
        console.log("📄 Téléchargement PDF...");
        const { base64 } = await urlToBase64(pdfUrl, publicId);

        const lang = getLang(language);

        const result = await callWithRetry((model) =>
            model.generateContent([
                {
                    inlineData: {
                        data: base64,
                        mimeType: "application/pdf",
                    },
                },
                {
                    text: lang.pdfPrompt,
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

async function transcribeAudio(audioUrl, publicId, courseContext = "") {
    try {
        console.log("🎤 Téléchargement audio...");
        const { base64, mimeType } = await urlToBase64(audioUrl, publicId);

        // Détermination du MIME type audio
        let audioMime = "audio/mpeg";
        if (audioUrl.includes(".3gp") || mimeType.includes("3gp"))
            audioMime = "video/3gpp";
        else if (audioUrl.includes(".wav") || mimeType.includes("wav"))
            audioMime = "audio/wav";
        else if (audioUrl.includes(".ogg") || mimeType.includes("ogg"))
            audioMime = "audio/ogg";
        else if (audioUrl.includes(".webm") || mimeType.includes("webm"))
            audioMime = "audio/webm";
        else if (audioUrl.includes(".m4a") || mimeType.includes("m4a"))
            audioMime = "audio/mp4";
        else if (mimeType.includes("audio") || mimeType.includes("video"))
            audioMime = mimeType;

        console.log(`🎵 Format audio: ${audioMime}`);

        // On utilise le prompt fr par défaut pour la transcription initiale
        // car on ne connaît pas encore la langue
        const lang = getLang("fr");

        const result = await callWithRetry((model) =>
            model.generateContent([
                {
                    inlineData: { data: base64, mimeType: audioMime },
                },
                {
                    text: lang.transcribePrompt,
                },
            ])
        );

        const response = result.response;
        const text = response.text();
        const parsed = safeParseJSON(text);
        const tokensUsed = response.usageMetadata?.totalTokenCount || 0;

        const detectedLanguage = parsed.language || "fr";
        let finalTranscription = parsed.transcription || "";
        let rawTranscription = finalTranscription;
        let correctionsMade = [];
        let correctionTokens = 0;

        // ✅ Correction automatique si langue arabe détectée
        if (detectedLanguage === "ar" && finalTranscription.trim().length > 10) {
            console.log("🔤 Correction transcription arabe en cours...");
            const correction = await correctArabicTranscription(
                finalTranscription,
                courseContext
            );
            finalTranscription = correction.corrected;
            correctionsMade = correction.corrections;
            correctionTokens = correction.tokensUsed;
        }

        console.log(
            `✅ Audio transcrit (${detectedLanguage}) — ${tokensUsed + correctionTokens} tokens`
        );

        return {
            transcription: finalTranscription,
            rawTranscription,                       // Transcription brute avant correction
            language: detectedLanguage,
            confidence: parsed.confidence || 0,
            isEmpty: parsed.isEmpty || false,
            corrections: correctionsMade,
            tokensUsed: tokensUsed + correctionTokens,
        };
    } catch (error) {
        console.error("Erreur transcribeAudio:", error);
        throw new Error(`Erreur transcription audio: ${error.message}`);
    }
}

// ========================================
// FONCTION 3 : DÉTECTION LACUNES
// ========================================

async function detectLacunes(extractedText, transcription, themes, language = "fr") {
    try {
        if (!transcription || transcription.trim().length < 10) {
            const lang = getLang(language);
            return {
                lacunes: themes.map((t) => ({
                    topic: t,
                    description:
                        language === "ar"
                            ? "لم يتناول الطالب هذا الموضوع في استذكاره"
                            : language === "en"
                            ? "The student did not address this topic in their recitation"
                            : "L'étudiant n'a pas abordé ce thème dans sa récitation",
                    severity: "high",
                })),
                masteredTopics: [],
                globalUnderstanding: 0,
                feedback:
                    language === "ar"
                        ? "لم يقدم الطالب استذكاراً كافياً."
                        : language === "en"
                        ? "The student did not provide sufficient recitation."
                        : "L'étudiant n'a pas fourni de récitation suffisante.",
                tokensUsed: 0,
            };
        }

        const lang = getLang(language);

        const result = await callWithRetry((model) =>
            model.generateContent({
                contents: [
                    {
                        role: "user",
                        parts: [
                            {
                                text: `${lang.lacunesInstruction}

${lang.courseLabel}
${extractedText.substring(0, 3000)}

${lang.themesLabel}
${themes.join(", ")}

${lang.recitationLabel}
${transcription}

${lang.lacunesJsonGuide}`,
                            },
                        ],
                    },
                ],
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

async function generateQuestions(lacunes, extractedText, questionCount = 5, language = "fr") {
    try {
        const lang = getLang(language);

        const lacunesText = lacunes
            .map((l) => `- ${l.topic} (${l.severity}): ${l.description}`)
            .join("\n");

        const result = await callWithRetry((model) =>
            model.generateContent({
                contents: [
                    {
                        role: "user",
                        parts: [
                            {
                                text: `${lang.questionsInstruction(questionCount)}

${lang.gapsLabel}
${lacunesText}

${lang.courseContextLabel}
${extractedText.substring(0, 2000)}

${lang.questionsJsonGuide}`,
                            },
                        ],
                    },
                ],
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

async function evaluateAnswer(questionText, correctAnswer, studentAnswer, language = "fr") {
    try {
        const lang = getLang(language);

        const result = await callWithRetry((model) =>
            model.generateContent({
                contents: [
                    {
                        role: "user",
                        parts: [
                            {
                                text: `${lang.evaluateInstruction}

${lang.questionLabel} ${questionText}
${lang.expectedLabel} ${correctAnswer}
${lang.studentLabel} ${studentAnswer}

${lang.evaluateJsonGuide}`,
                            },
                        ],
                    },
                ],
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

async function processMemorySession(
    pdfUrl,
    pdfPublicId,
    audioUrl,
    audioPublicId,
    onStepComplete,
    language = "fr"   // Langue par défaut, sera écrasée après détection audio
) {
    let totalTokensUsed = 0;

    try {
        // ── Étape 1/4 : Analyse du PDF ────────────────────────────────────
        console.log("📄 Étape 1/4 : Analyse du PDF...");
        const pdfAnalysis = await analyzePDF(pdfUrl, pdfPublicId, language);
        totalTokensUsed += pdfAnalysis.tokensUsed;
        await onStepComplete("pdf_analyzed", {
            extractedText: pdfAnalysis.extractedText,
            themes: pdfAnalysis.themes,
            keyPoints: pdfAnalysis.keyPoints,
            summary: pdfAnalysis.summary,
            estimatedDifficulty: pdfAnalysis.estimatedDifficulty,
            tokensUsed: pdfAnalysis.tokensUsed,
        });

        // ── Étape 2/4 : Transcription audio ──────────────────────────────
        console.log("🎤 Étape 2/4 : Transcription audio...");
        const audioTranscription = await transcribeAudio(
            audioUrl,
            audioPublicId,
            pdfAnalysis.extractedText   // Contexte PDF pour améliorer la correction arabe
        );
        totalTokensUsed += audioTranscription.tokensUsed;

        // ✅ La langue réelle est déterminée par la transcription audio
        const detectedLanguage = audioTranscription.language || language;

        await onStepComplete("audio_transcribed", {
            transcription: audioTranscription.transcription,
            rawTranscription: audioTranscription.rawTranscription,
            language: detectedLanguage,
            confidence: audioTranscription.confidence,
            isEmpty: audioTranscription.isEmpty,
            corrections: audioTranscription.corrections,
            tokensUsed: audioTranscription.tokensUsed,
        });

        // ── Étape 3/4 : Détection des lacunes ────────────────────────────
        console.log("🔍 Étape 3/4 : Détection des lacunes...");
        const lacunesResult = await detectLacunes(
            pdfAnalysis.extractedText,
            audioTranscription.transcription,
            pdfAnalysis.themes,
            detectedLanguage              // ✅ Langue détectée
        );
        totalTokensUsed += lacunesResult.tokensUsed;
        await onStepComplete("lacunes_detected", {
            lacunes: lacunesResult.lacunes,
            masteredTopics: lacunesResult.masteredTopics,
            globalUnderstanding: lacunesResult.globalUnderstanding,
            feedback: lacunesResult.feedback,
            tokensUsed: lacunesResult.tokensUsed,
        });

        // ── Étape 4/4 : Génération des questions ─────────────────────────
        console.log("❓ Étape 4/4 : Génération des questions...");
        const questionsResult = await generateQuestions(
            lacunesResult.lacunes,
            pdfAnalysis.extractedText,
            5,
            detectedLanguage              // ✅ Langue détectée
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
            detectedLanguage,
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
    correctArabicTranscription,
};