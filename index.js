import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { OpenAI } from "openai";
import { createRequire } from "module";

dotenv.config();

const require = createRequire(import.meta.url);
const pdfParse = (...args) => require("pdf-parse")(...args);

const app = express();

app.use(cors());
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ limit: "100mb", extended: true }));

const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

app.get("/", (req, res) => {
  res.json({ status: "OK 🚀 Server running" });
});

app.post("/generate", async (req, res) => {
  try {
    let { content, pdfBase64 } = req.body;

    if (pdfBase64) {
      try {
        const cleanBase64 = pdfBase64.includes(",")
          ? pdfBase64.split(",")[1]
          : pdfBase64;

        const buffer = Buffer.from(cleanBase64, "base64");
        const pdfData = await pdfParse(buffer);
        content = pdfData?.text || "";
      } catch (err) {
        console.error("PDF ERROR:", err);
        return res.status(400).json({ error: "Failed to read PDF file" });
      }
    }

    if (!content || content.trim().length < 5) {
      return res.status(400).json({ error: "No valid content provided" });
    }

    // TRUNCATE CONTENT TO FIT TOKEN LIMIT (roughly 4000 chars = ~1000 tokens)
    const maxChars = 12000;
    if (content.length > maxChars) {
      content = content.substring(0, maxChars) + "\n\n[Content truncated to fit token limit]";
    }

    const completion = await client.chat.completions.create({
      model: "llama-3.1-8b-instant",
      temperature: 0.7,
      max_tokens: 2000,
      messages: [
        {
          role: "system",
          content: `Return ONLY valid JSON (no markdown):

{
  "summary": "3-5 sentence summary",
  "flashcards": [
    { "front": "Question", "back": "Answer" }
  ],
  "quiz": [
    {
      "question": "Question?",
      "options": ["A", "B", "C", "D"],
      "correct": 0
    }
  ]
}

Rules:
- 6 flashcards
- 5 quiz questions
- strict JSON only`,
        },
        { role: "user", content },
      ],
    });

    let raw = completion.choices?.[0]?.message?.content || "";
    raw = raw.replace(/```json|```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      console.error("JSON ERROR:", raw);
      return res.status(500).json({ error: "AI returned invalid JSON" });
    }

    return res.json(parsed);

  } catch (err) {
    console.error("SERVER ERROR:", err);
    return res.status(500).json({
      error: err.message || "Internal server error",
    });
  }
});

const PORT = 5000;

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});