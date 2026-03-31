// test_stt.js — Test STT isolé + diagnostic lacunes
// Usage: node test_stt.js

require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
const path = require("path");

// ── CONFIG ──────────────────────────────────────────────────────────────────
const AUDIO_PATH = "C:/Users/dell/Downloads/Memorisation.m4a";

// Remplace par ta clé si pas de .env
const GEMINI_API_KEY = "AIzaSyCjRNsBme1cNuElloKH52q6KRGuDpxtRbI";

const MODELS_TO_TRY = [
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-2.0-flash-001",
];

// ── UTILS ────────────────────────────────────────────────────────────────────
function readAudioAsBase64(filePath) {
    const abs = path.resolve(filePath);
    if (!fs.existsSync(abs)) {
        throw new Error(`Fichier introuvable: ${abs}`);
    }
    const buffer = fs.readFileSync(abs);
    const base64 = buffer.toString("base64");
    const ext = path.extname(filePath).toLowerCase();
    const mimeMap = {
        ".m4a": "audio/mp4",
        ".mp3": "audio/mpeg",
        ".wav": "audio/wav",
        ".ogg": "audio/ogg",
        ".webm": "audio/webm",
        ".3gp": "video/3gpp",
        ".mp4": "video/mp4",
    };
    const mimeType = mimeMap[ext] || "audio/mp4";
    console.log(`📁 Fichier: ${abs}`);
    console.log(`📦 Taille: ${(buffer.length / 1024).toFixed(1)} KB`);
    console.log(`🎵 MIME: ${mimeType}`);
    return { base64, mimeType };
}

// ── TEST 1 : STT SIMPLE ──────────────────────────────────────────────────────
async function testSTT(genAI, modelName) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`🧪 TEST STT avec ${modelName}`);
    console.log("=".repeat(60));

    const { base64, mimeType } = readAudioAsBase64(AUDIO_PATH);
    const model = genAI.getGenerativeModel({ model: modelName });

    // Prompt minimal — juste transcrire
    const result = await model.generateContent([
        { inlineData: { data: base64, mimeType } },
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
    ]);

    const raw = result.response.text();
    const tokens = result.response.usageMetadata?.totalTokenCount || 0;

    console.log(`\n📝 RÉPONSE BRUTE (${tokens} tokens):`);
    console.log(raw);

    // Parse
    try {
        let cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
        const parsed = JSON.parse(cleaned);
        console.log("\n✅ JSON PARSÉ:");
        console.log(JSON.stringify(parsed, null, 2));

        if (!parsed.transcription || parsed.transcription.trim().length < 5) {
            console.log("\n⚠️  PROBLÈME DÉTECTÉ: transcription vide ou trop courte!");
            console.log("   → C'est probablement pourquoi lacunes = []");
            console.log("   → Vérifie que l'audio contient bien de la parole");
        } else {
            console.log(`\n✅ Transcription OK (${parsed.transcription.length} chars)`);
        }

        return parsed;
    } catch (e) {
        console.log(`\n❌ Erreur parsing JSON: ${e.message}`);
        console.log("   → La réponse brute n'est pas du JSON valide");
        return null;
    }
}

// ── TEST 2 : STT AVEC PROMPT DE TON SERVICE ──────────────────────────────────
async function testSTTOriginal(genAI, modelName) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`🧪 TEST STT (prompt original de gemini.service.js) avec ${modelName}`);
    console.log("=".repeat(60));

    const { base64, mimeType } = readAudioAsBase64(AUDIO_PATH);
    const model = genAI.getGenerativeModel({ model: modelName });

    // Prompt exactement comme dans ton service actuel
    const result = await model.generateContent([
        { inlineData: { data: base64, mimeType } },
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

    const raw = result.response.text();
    console.log(`\n📝 RÉPONSE BRUTE:`);
    console.log(raw);

    try {
        let cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
        const parsed = JSON.parse(cleaned);
        console.log("\n✅ JSON:");
        console.log(JSON.stringify(parsed, null, 2));

        // DIAGNOSTIC
        console.log("\n🔍 DIAGNOSTIC:");
        if (parsed.isEmpty === true) {
            console.log("❌ isEmpty = true → Gemini considère l'audio comme vide");
            console.log("   → detectLacunes reçoit transcription vide");
            console.log("   → TOUTES les lacunes sont créées automatiquement sans comparaison réelle");
            console.log("   → globalUnderstanding = 0");
        } else if (!parsed.transcription || parsed.transcription.length < 10) {
            console.log("❌ transcription trop courte ou vide");
            console.log("   → Même effet: lacunes génériques, pas personnalisées");
        } else {
            console.log("✅ Transcription correcte — le problème est ailleurs");
            console.log(`   → Langue détectée: ${parsed.language}`);
            console.log(`   → Longueur: ${parsed.transcription.length} caractères`);
        }

        return parsed;
    } catch (e) {
        console.log(`❌ Parse error: ${e.message}`);
        return null;
    }
}

// ── TEST 3 : AUDIO URL CLOUDINARY (comme en prod) ────────────────────────────
async function testCloudinaryAudio(genAI, modelName) {
    const audioUrl = "https://res.cloudinary.com/dqch2phmq/video/upload/v1774996536/memory_sessions/audios/audio_1774996536140_69a97c246409e6603b477105.mp4";

    console.log(`\n${"=".repeat(60)}`);
    console.log(`🧪 TEST AUDIO CLOUDINARY avec ${modelName}`);
    console.log("=".repeat(60));
    console.log(`URL: ${audioUrl}`);

    // Télécharger l'audio depuis Cloudinary
    const https = require("https");
    const http = require("http");

    function download(url) {
        return new Promise((resolve, reject) => {
            const client = url.startsWith("https") ? https : http;
            client.get(url, (res) => {
                if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
                    return download(res.headers.location).then(resolve).catch(reject);
                }
                const chunks = [];
                res.on("data", (c) => chunks.push(c));
                res.on("end", () => {
                    if (res.statusCode === 200) {
                        const buf = Buffer.concat(chunks);
                        resolve({
                            base64: buf.toString("base64"),
                            mimeType: res.headers["content-type"] || "video/mp4",
                            size: buf.length,
                        });
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}`));
                    }
                });
                res.on("error", reject);
            }).on("error", reject);
        });
    }

    try {
        console.log("⬇️  Téléchargement depuis Cloudinary...");
        const { base64, mimeType, size } = await download(audioUrl);
        console.log(`✅ Téléchargé: ${(size / 1024).toFixed(1)} KB — MIME: ${mimeType}`);

        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent([
            { inlineData: { data: base64, mimeType } },
            {
                text: `Transcris cet audio. JSON uniquement:
{"transcription":"...","language":"ar|fr|en","confidence":0.9,"isEmpty":false,"detectedContent":"description courte"}`,
            },
        ]);

        const raw = result.response.text();
        console.log("\n📝 RÉPONSE:");
        console.log(raw);

        let cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
        const parsed = JSON.parse(cleaned);
        console.log("\n✅ JSON parsé:");
        console.log(JSON.stringify(parsed, null, 2));

        return parsed;
    } catch (e) {
        console.log(`❌ Erreur: ${e.message}`);
        return null;
    }
}

// ── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
    console.log("🚀 DIAGNOSTIC STT — GEMINI SERVICE");
    console.log(`⏰ ${new Date().toISOString()}\n`);

    if (!GEMINI_API_KEY || GEMINI_API_KEY === "METS_TA_CLE_ICI") {
        console.error("❌ Clé API manquante! Mets GEMINI_API_KEY dans .env ou dans le script");
        process.exit(1);
    }

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    let modelUsed = null;

    // Essayer les modèles jusqu'à ce qu'un marche
    for (const modelName of MODELS_TO_TRY) {
        try {
            console.log(`\n🔄 Tentative avec ${modelName}...`);

            // TEST 1: Fichier local
            if (fs.existsSync(path.resolve(AUDIO_PATH))) {
                const r1 = await testSTT(genAI, modelName);
                if (r1 !== null) {
                    await testSTTOriginal(genAI, modelName);
                    modelUsed = modelName;
                    break;
                }
            } else {
                console.log(`⚠️  Fichier local non trouvé: ${AUDIO_PATH}`);
                console.log("   → Test sur l'URL Cloudinary directement...");
                const r3 = await testCloudinaryAudio(genAI, modelName);
                if (r3 !== null) {
                    modelUsed = modelName;
                    break;
                }
            }
        } catch (err) {
            const msg = err.message || "";
            if (msg.includes("429") || msg.includes("quota") || msg.includes("RESOURCE_EXHAUSTED")) {
                console.log(`⚠️  Quota atteint sur ${modelName}, rotation...`);
                continue;
            }
            if (msg.includes("404") || msg.includes("not found")) {
                console.log(`❌ ${modelName} non disponible, rotation...`);
                continue;
            }
            console.error(`❌ Erreur inattendue sur ${modelName}:`, err.message);
            continue;
        }
    }

    // TEST Cloudinary en plus si fichier local trouvé
    if (modelUsed && fs.existsSync(path.resolve(AUDIO_PATH))) {
        try {
            await testCloudinaryAudio(genAI, modelUsed);
        } catch (e) {
            console.log(`⚠️  Test Cloudinary échoué: ${e.message}`);
        }
    }

    console.log("\n" + "=".repeat(60));
    console.log("📊 RÉSUMÉ DU DIAGNOSTIC");
    console.log("=".repeat(60));
    console.log(`Modèle utilisé: ${modelUsed || "aucun"}`);
    console.log(`\nCauses possibles si lacunes = [] :`);
    console.log("  1. isEmpty=true → audio vide ou inaudible pour Gemini");
    console.log("  2. transcription trop courte (<10 chars)");
    console.log("  3. langue non reconnue → comparaison PDF/audio échoue");
    console.log("  4. audio Cloudinary non accessible (URL signée expirée)");
    console.log("  5. MIME type incorrect (mp4 au lieu d'audio/mp4)");
}

main().catch((err) => {
    console.error("💥 Erreur fatale:", err);
    process.exit(1);
});