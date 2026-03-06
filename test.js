// test.js
require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

model.generateContent("qui est meilleur messi ou ronaldo")
    .then(r => console.log("✅ IA répond:", r.response.text()))
    .catch(e => console.log("❌ Erreur:", e.message.substring(0, 200)));