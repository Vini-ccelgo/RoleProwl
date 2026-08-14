import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY?.trim();
if (!apiKey) {
  console.error("GEMINI_API_KEY is required for the opt-in live smoke test.");
  process.exitCode = 1;
} else {
  const model =
    process.env.ROLEPROWL_GEMINI_MODEL_LITE?.trim() || "gemini-3.5-flash-lite";
  const client = new GoogleGenAI({ apiKey });
  const response = await client.models.generateContent({
    model,
    contents:
      "This is fictional test data. Return a health result for fixture fictional-candidate-avery-quill-v1.",
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          fixtureId: { type: "string" },
          synthetic: { type: "boolean" },
          status: { type: "string", enum: ["ok"] },
        },
        required: ["fixtureId", "synthetic", "status"],
      },
      systemInstruction:
        "Return only the requested structured result. Do not infer or request real personal data.",
    },
  });
  const result = JSON.parse(response.text ?? "null");
  if (
    result?.fixtureId !== "fictional-candidate-avery-quill-v1" ||
    result?.synthetic !== true ||
    result?.status !== "ok"
  )
    throw new Error("Gemini returned an invalid synthetic smoke response.");
  console.log(`Gemini synthetic structured smoke passed with ${model}.`);
}
