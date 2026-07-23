// 远程多模态 provider 适配：OpenAI 兼容 / Anthropic / Gemini
// 统一输入 (imageBase64, mode, cfg) -> 统一输出 {mode,category,prompt,suggestedTags}
// Node18 内置 fetch。图片直接以 base64 作为多模态输入，无需临时文件。
const { buildInstruction } = require("../prompts");

function toB64(imageBase64) {
  return String(imageBase64).replace(/^data:image\/\w+;base64,/, "");
}
function dataUrl(imageBase64) {
  const b64 = toB64(imageBase64);
  return "data:image/png;base64," + b64;
}
function extractJson(text) {
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  if (s === -1 || e === -1 || e < s) return null;
  try { return JSON.parse(text.slice(s, e + 1)); } catch { return null; }
}
function normalize(json, mode) {
  return {
    mode: (json && json.mode) || mode || "clothing_only",
    category: json && json.category === "male" ? "male" : "female",
    prompt: String((json && json.prompt) || "").trim(),
    suggestedTags: json && Array.isArray(json.suggestedTags)
      ? json.suggestedTags.map((t) => String(t).toLowerCase().trim()).filter(Boolean).slice(0, 8)
      : [],
  };
}
// 反推指令：远程 provider 无需读文件，图片单独作为多模态输入
function instructionNoPath(mode, lang) {
  return buildInstruction(mode, "(the attached image)", lang === "zh" ? "zh" : "en");
}

// ---- OpenAI 兼容 (/v1/chat/completions)：覆盖 OpenAI/中转站/LM Studio/Ollama 等 ----
async function openai(imageBase64, mode, cfg) {
  const url = (cfg.baseURL || "https://api.openai.com/v1").replace(/\/$/, "") + "/chat/completions";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + (cfg.apiKey || ""),
    },
    body: JSON.stringify({
      model: cfg.model || "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: instructionNoPath(mode, cfg.lang) },
            { type: "image_url", image_url: { url: dataUrl(imageBase64) } },
          ],
        },
      ],
      temperature: 0.4,
    }),
  });
  if (!res.ok) throw new Error("OpenAI 兼容接口 " + res.status + ": " + (await res.text()).slice(0, 200));
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || "";
  return normalize(extractJson(text), mode);
}

// ---- Anthropic Messages API ----
async function anthropic(imageBase64, mode, cfg) {
  const url = (cfg.baseURL || "https://api.anthropic.com").replace(/\/$/, "") + "/v1/messages";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": cfg.apiKey || "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: cfg.model || "claude-3-5-sonnet-latest",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: instructionNoPath(mode, cfg.lang) },
            { type: "image", source: { type: "base64", media_type: "image/png", data: toB64(imageBase64) } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error("Anthropic 接口 " + res.status + ": " + (await res.text()).slice(0, 200));
  const data = await res.json();
  const text = (data.content || []).map((c) => c.text || "").join("");
  return normalize(extractJson(text), mode);
}

// ---- Google Gemini (generateContent) ----
async function gemini(imageBase64, mode, cfg) {
  const model = cfg.model || "gemini-1.5-flash";
  const base = (cfg.baseURL || "https://generativelanguage.googleapis.com").replace(/\/$/, "");
  const url = `${base}/v1beta/models/${model}:generateContent?key=${cfg.apiKey || ""}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            { text: instructionNoPath(mode, cfg.lang) },
            { inline_data: { mime_type: "image/png", data: toB64(imageBase64) } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error("Gemini 接口 " + res.status + ": " + (await res.text()).slice(0, 200));
  const data = await res.json();
  const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
  return normalize(extractJson(text), mode);
}

module.exports = { openai, anthropic, gemini };
