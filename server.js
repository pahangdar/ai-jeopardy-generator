import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import Groq from "groq-sdk";

dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Initialize Groq SDK
const groq = new Groq({ apiKey: process.env.GROQ_CLOUD_API_KEY });

/**
 * POST /generate-questions
 * Input: { categories: ["Science", "History", "Music"] }
 * Output: Structured JSON for each category with 5 questions (100–500 points)
 */
app.post("/generate-questions-old", async (req, res) => {
  const { categories } = req.body;

  if (!categories || !Array.isArray(categories) || categories.length === 0) {
    return res.status(400).json({ error: "Categories array is required" });
  }

  // Build a strong, deterministic system prompt
  const systemPrompt = `
You are an expert trivia question generator for a Jeopardy-style quiz game.
You must produce a JSON array of categories.
Each category must contain exactly 5 questions, one for each point value: 100, 200, 300, 400, 500.

Rules:
- Each question must have 4 answer options (A, B, C, D).
- Only one option must be the correct answer.
- The "answer" must exactly match one of the options.
- Questions should increase in difficulty with higher point values.
- The output must be valid JSON with this exact format:

[
  {
    "category": "Science",
    "questions": [
      { "points": 100, "question": "...", "options": ["A", "B", "C", "D"], "answer": "..." },
      { "points": 200, "question": "...", "options": ["A", "B", "C", "D"], "answer": "..." },
      ...
      { "points": 500, "question": "...", "options": ["A", "B", "C", "D"], "answer": "..." }
    ]
  }
]
`;

  const userPrompt = `
Generate Jeopardy-style questions for the following categories:
${categories.map((c, i) => `${i + 1}. ${c}`).join("\n")}
Remember to vary question difficulty by points (100 easy → 500 hard).
Return ONLY the JSON array, no explanations or markdown.
`;

  try {
    const aiResponse = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 1500,
    });

    const rawOutput = aiResponse.choices[0].message.content.trim();

    // Try to parse JSON safely
    let jsonData;
    try {
      jsonData = JSON.parse(rawOutput);
    } catch (parseError) {
      console.error("AI returned invalid JSON. Raw output:", rawOutput);
      return res.status(500).json({ error: "AI returned invalid JSON", rawOutput });
    }

    res.json({ jeopardyData: jsonData });
  } catch (error) {
    console.error("Error generating questions:", error);
    res.status(500).json({ error: "AI request failed" });
  }
});

app.post("/generate-questions", async (req, res) => {
  const { categories } = req.body;
  if (!categories || !Array.isArray(categories) || categories.length === 0) {
    return res.status(400).json({ error: "A list of categories is required" });
  }

  const difficultyMapping = {
    100: "very easy",
    200: "easy",
    300: "medium",
    400: "hard",
    500: "very hard",
  };

  const prompt = `
You are a Jeopardy question generator. 
For each given category, generate exactly 5 questions with increasing difficulty and corresponding points:
100, 200, 300, 400, 500.
Each question must have exactly 4 multiple-choice options and ONE correct answer.

Difficulty rules:
- 100 → very very easy
- 200 → very easy
- 300 → easy
- 400 → medium
- 500 → hard

Output STRICTLY as a valid JSON array of this structure:
[
  {
    "category": "CategoryName",
    "questions": [
      { "points": 100, "question": "...", "options": ["A", "B", "C", "D"], "answer": "..." },
      ...
    ]
  }
]

Do not include any explanations, markdown, or text outside JSON.
Categories: ${JSON.stringify(categories)}
`;

  try {
    const aiResponse = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 1500,

    });

    let output = aiResponse.choices[0].message.content.trim();

    // --- CLEANUP STEP ---
    // Remove unwanted markdown-like formatting
    output = output.replace(/```json|```/g, "").trim();

    // Try to auto-close truncated JSON
    if (!output.endsWith("]")) {
      output += "]";
    }

    // Try parsing safely
    let jeopardyData;
    try {
      jeopardyData = JSON.parse(output);
    } catch (err) {
      console.error("Raw AI output parse error:", err.message);
      return res.status(500).json({
        error: "AI returned invalid JSON",
        rawOutput: output,
      });
    }

    res.json({ jeopardyData });
  } catch (error) {
    console.error("AI Error:", error);
    res.status(500).json({ error: "AI request failed" });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Jeopardy Question Generator API running on port ${PORT}`);
});
