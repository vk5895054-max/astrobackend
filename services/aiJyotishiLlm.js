// Text-only AI provider wrapper for AI Jyotishi chats. API keys stay here —
// the client never receives a provider key or a raw provider error.
const { GoogleGenAI } = require("@google/genai");
const Groq = require("groq-sdk");
const { withResponseLanguage } = require("./aiLanguageService");

const GEMINI_MODEL = process.env.GOOGLE_MODEL || "gemini-3.5-flash";
const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "nvidia/nemotron-3.5-lightning:free";
const TIMEOUT_MS = 30000;

let cachedGroq = null;
let cachedGemini = null;

const getGroq = () => {
  if (!process.env.GROQ_API_KEY) return null;
  if (!cachedGroq) cachedGroq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return cachedGroq;
};
const getGemini = () => {
  if (!process.env.GEMINI_API_KEY) return null;
  if (!cachedGemini) cachedGemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return cachedGemini;
};

// `history` is [{role: 'user'|'assistant', content: string}] and always ends
// with the newest user message.
const buildMessages = ({ systemPrompt, kundliContext, locale, history }) => {
  const system = withResponseLanguage(
    `${systemPrompt}\n\nDepartments ke aadhar par di gayi kundli data (sirf isse istemal karo):\n${kundliContext}`,
    locale,
  );
  return { system, conversation: history.slice(-12) };
};

const callGroq = async (client, { system, conversation }) => {
  const response = await client.chat.completions.create(
    {
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: system },
        ...conversation.map((message) => ({
          role: message.role === "assistant" ? "assistant" : "user",
          content: message.content,
        })),
      ],
      max_tokens: 500,
      temperature: 0.7,
    },
    { timeout: TIMEOUT_MS },
  );
  return response.choices?.[0]?.message?.content || "";
};

const callGemini = async (client, { system, conversation }) => {
  const response = await client.models.generateContent({
    model: GEMINI_MODEL,
    contents: conversation.map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    })),
    config: { systemInstruction: system, maxOutputTokens: 500, temperature: 0.7 },
  });
  return response.text || "";
};

const callOpenRouter = async ({ system, conversation }) => {
  if (process.env.OPENROUTER_ENABLED !== "true" || !process.env.OPENROUTER_API_KEY) return null;
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.CLIENT_URL || "http://localhost:5173",
      "X-Title": "AweraOne AI Jyotishi",
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [{ role: "system", content: system }, ...conversation],
      max_tokens: 500,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`OpenRouter ${response.status}`);
  const json = await response.json();
  return json.choices?.[0]?.message?.content || "";
};

const generateReply = async (input) => {
  const prepared = buildMessages(input);
  const providers = [
    { name: "groq", call: () => {
      const client = getGroq();
      return client ? callGroq(client, prepared) : null;
    } },
    { name: "gemini", call: () => {
      const client = getGemini();
      return client ? callGemini(client, prepared) : null;
    } },
    { name: "openrouter", call: () => callOpenRouter(prepared) },
  ];

  const errors = [];
  for (const provider of providers) {
    try {
      const text = await provider.call();
      if (text && String(text).trim()) return String(text).trim();
      errors.push(`${provider.name}: empty response`);
    } catch (error) {
      errors.push(`${provider.name}: ${error?.message || "failed"}`);
      console.error(`[ai-jyotishi] ${provider.name} failed:`, error?.message || error);
    }
  }
  const error = new Error("AI reply unavailable");
  error.code = "AI_REPLY_FAILED";
  error.statusCode = 503;
  error.expose = true;
  error.providerErrors = errors;
  throw error;
};

module.exports = { generateReply, buildMessages };
