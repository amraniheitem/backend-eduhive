const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function test(modelName) {
    try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent("Hello?");
        console.log(`✅ ${modelName} works`);
    } catch (e) {
        console.log(`❌ ${modelName} failed: ${e.message}`);
    }
}

async function run() {
    await test("gemini-2.0-flash");
    await test("gemini-1.5-flash-002");
    await test("gemini-1.5-flash");
    await test("gemini-1.5-pro");
    await test("gemini-pro");
    await test("gemini-1.5-flash-latest");
}
run();
