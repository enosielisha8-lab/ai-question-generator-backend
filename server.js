const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 3000;

// Health check: confirms that the server is running.
app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "AI Question Generator API is running."
    });
});

app.get("/health", (req, res) => {
    res.json({ success: true });
});

// Generate multiple-choice questions using AI.
app.post("/generate", async (req, res) => {
    try {
        const { subject, topic, difficulty, quantity } = req.body;

        if (
            !subject ||
            !topic ||
            !difficulty ||
            !Number.isInteger(quantity) ||
            quantity < 1 ||
            quantity > 20
        ) {
            return res.status(400).json({
                success: false,
                message: "Provide subject, topic, difficulty, and a quantity from 1 to 20."
            });
        }

        const apiKey = process.env.OPENAI_API_KEY;

        if (!apiKey) {
            return res.status(500).json({
                success: false,
                message: "The AI API key has not been configured on the server."
            });
        }

        const prompt = `
Generate exactly ${quantity} original multiple-choice questions.

Subject: ${subject}
Topic: ${topic}
Difficulty: ${difficulty}

Requirements:
- Each question must have exactly four options.
- Only one option must be correct.
- correctAnswerIndex must be a number from 0 to 3.
- Provide a short, accurate explanation.
- Questions must match the specified subject, topic and difficulty.
- Avoid repeating questions.

Return valid JSON in this exact structure:
{
  "questions": [
    {
      "questionText": "Question text",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswerIndex": 0,
      "explanation": "Explanation of the correct answer."
    }
  ]
}
`;

        const aiResponse = await fetch(
            "https://api.openai.com/v1/responses",
            {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: "gpt-4.1-mini",
                    instructions: "You are an educational question generator. Follow the requested JSON structure exactly.",
                    input: prompt,
                    text: {
                        format: {
                            type: "json_object"
                        }
                    }
                })
            }
        );

        const responseData = await aiResponse.json();

        if (!aiResponse.ok) {
            console.error("AI API error:", responseData);

            return res.status(502).json({
                success: false,
                message: "The AI service could not generate questions. Check the server configuration and API account."
            });
        }

        let outputText = "";

        for (const item of responseData.output || []) {
            if (item.type === "message") {
                for (const content of item.content || []) {
                    if (content.type === "output_text") {
                        outputText += content.text;
                    }
                }
            }
        }

        if (!outputText) {
            throw new Error("The AI returned no question data.");
        }

        const generatedData = JSON.parse(outputText);
        const questions = generatedData.questions;

        if (
            !Array.isArray(questions) ||
            questions.length !== quantity ||
            questions.some(q =>
                typeof q.questionText !== "string" ||
                !Array.isArray(q.options) ||
                q.options.length !== 4 ||
                !Number.isInteger(q.correctAnswerIndex) ||
                q.correctAnswerIndex < 0 ||
                q.correctAnswerIndex > 3 ||
                typeof q.explanation !== "string"
            )
        ) {
            throw new Error("The AI returned questions in an invalid format.");
        }

        return res.json({
            success: true,
            subject,
            topic,
            difficulty,
            questions
        });

    } catch (error) {
        console.error("Generation error:", error.message);

        return res.status(500).json({
            success: false,
            message: "An error occurred while generating questions."
        });
    }
});

// Handle unknown endpoints.
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: "Endpoint not found."
    });
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`AI Question Generator API listening on port ${PORT}`);
});
