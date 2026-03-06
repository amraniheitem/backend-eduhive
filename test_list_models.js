const axios = require('axios');
require("dotenv").config();

async function run() {
    try {
        const res = await axios.get(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`);
        console.log("Models:", res.data.models.map(m => m.name).join("\n"));
    } catch (e) {
        console.log("Error:", e.response?.data || e.message);
    }
}
run();
