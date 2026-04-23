// Use this URL structure to avoid 404s
const response = await fetch(`${GEMINI_BASE}/gemini-2.0-flash:streamGenerateContent?alt=sse`, {
  method: "POST",
  headers: { 
    "Content-Type": "application/json", 
    "x-goog-api-key": geminiKey 
  },
  body: JSON.stringify({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 2048,
    }
  }),
});