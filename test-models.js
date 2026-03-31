// Quick test - can be deleted after verification
const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function testModel() {
    const modelName = "gemini-2.5-flash";
    console.log(`🔄 Testing: ${modelName}`);
    const model = genAI.getGenerativeModel({ model: modelName });
    const result = await model.generateContent("Dis bonjour");
    console.log(`✅ OK: ${result.response.text()}`);
}

testModel().catch(console.error);
