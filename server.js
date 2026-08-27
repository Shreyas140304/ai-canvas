const express = require("express");
const cors = require("cors");
require("dotenv").config();

const { GoogleGenAI } = require("@google/genai");

const app = express();

const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Gemini
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// Serve your frontend
app.use(express.static(__dirname));

// Test route
app.get("/", (req, res) => {
  res.send("AI Canvas backend is running");
});

// AI route
app.post("/api/ai", async (req, res) => {
  try {
    console.log("AI request received");

    const image = req.body.image;

    console.log("Image received:", !!image);

    if (!image) {
      return res.status(400).json({
        success: false,
        error: "No image received",
      });
    }

    const base64Image = image.replace(/^data:image\/\w+;base64,/, "");

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: "image/png",
                data: base64Image,
              },
            },
            {
              text: `
You are an AI assistant inside a digital drawing canvas.

Analyze the user's handwritten drawing carefully.

If it contains a question, equation, diagram, or mathematical problem:
- Understand the user's intent.
- Solve the problem.
- Give a clear step-by-step explanation.
- Do not assume information that is not visible.

If it is not a question:
- Explain what the drawing represents.

Return ONLY valid JSON in this exact format:

{
  "title": "short title",
  "content": "clear explanation",
  "type": "text"
}
`,
            },
          ],
        },
      ],
    });

    console.log("Gemini response received");
    console.log("GEMINI TEXT:");
    console.log(response.text);

    let aiText = response.text.trim();

    aiText = aiText.replace(/^```json\s*/, "").replace(/\s*```$/, "");

    let aiResponse;

    try {
      aiResponse = JSON.parse(aiText);
    } catch (error) {
      console.error("Could not parse Gemini JSON:", error);

      return res.status(500).json({
        success: false,
        error: "Invalid response from Gemini",
      });
    }

    res.json({
      success: true,
      response: {
        type: aiResponse.type,
        title: aiResponse.title,
        content: aiResponse.content,
        x: 700,
        y: 100,
        width: 300,
        height: 150,
      },
    });
  } catch (error) {
    console.error("Gemini error:", error);

    res.status(500).json({
      success: false,
      error: "Gemini request failed",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
