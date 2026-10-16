export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };

    const jsonResponse = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    if (request.method !== "POST") {
      return jsonResponse({
        error: "Use POST to generate questions."
      }, 405);
    }

    if (!env.OPENAI_API_KEY) {
      return jsonResponse({
        error: "AI service is not configured."
      }, 500);
    }

    try {
      const body = await request.json();

      const subject = String(body.subject || "").trim();
      const topic = String(body.topic || "").trim();
      const difficulty = String(body.difficulty || "Medium").trim();
      const quantity = Number(body.quantity);

      if (!subject || !topic) {
        return jsonResponse({
          error: "Subject and topic are required."
        }, 400);
      }

      if (
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 20
      ) {
        return jsonResponse({
          error: "Quantity must be between 1 and 20."
        }, 400);
      }

      const prompt = `
Generate exactly ${quantity} educational multiple-choice questions.

Subject: ${subject}
Topic: ${topic}
Difficulty: ${difficulty}

Requirements:
- Each question must have exactly four options.
- There must be exactly one correct answer.
- Include a clear explanation.
- Make the questions suitable for learning and practice.
- Return valid JSON only, using this format:
{
  "questions": [
    {
      "questionText": "Question text",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswerIndex": 0,
      "explanation": "Explanation"
    }
  ]
}

The correctAnswerIndex must be 0, 1, 2, or 3.
`;

      const aiResponse = await fetch(
        "https://api.openai.com/v1/responses",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "gpt-6-astra",
            instructions:
              "You are an expert educational question generator. " +
              "Follow the requested JSON format exactly.",
            input: prompt,
            text: {
              format: {
                type: "json_object"
              }
            }
          })
        }
      );

      const result = await aiResponse.json();

      if (!aiResponse.ok) {
        return jsonResponse({
          error: "The AI service could not generate questions."
        }, 502);
      }

      const outputText = (result.output || [])
        .filter(item => item.type === "message")
        .flatMap(item => item.content || [])
        .filter(item => item.type === "output_text")
        .map(item => item.text)
        .join("");

      if (!outputText) {
        return jsonResponse({
          error: "The AI returned an empty response."
        }, 502);
      }

      const parsed = JSON.parse(outputText);

      if (
        !Array.isArray(parsed.questions) ||
        parsed.questions.length !== quantity
      ) {
        return jsonResponse({
          error: "The AI returned an unexpected number of questions."
        }, 502);
      }

      for (const question of parsed.questions) {
        if (
          typeof question.questionText !== "string" ||
          !Array.isArray(question.options) ||
          question.options.length !== 4 ||
          !Number.isInteger(question.correctAnswerIndex) ||
          question.correctAnswerIndex < 0 ||
          question.correctAnswerIndex > 3 ||
          typeof question.explanation !== "string"
        ) {
          return jsonResponse({
            error: "The AI returned an invalid question format."
          }, 502);
        }
      }

      return jsonResponse({
        success: true,
        subject,
        topic,
        difficulty,
        questions: parsed.questions
      });

    } catch (error) {
      return jsonResponse({
        error: "An unexpected error occurred."
      }, 500);
    }
  }
};
