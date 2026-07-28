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
// 与 cli.js 保持同一份英中兜底词表(tagLang=zh 时对全英标签做映射,匹配不到即丢弃)
const EN2ZH_TAG = {
  vintage: "复古", retro: "复古", modern: "现代", minimal: "极简", minimalist: "极简",
  casual: "休闲", formal: "正装", business: "商务", streetwear: "街头", street: "街头",
  y2k: "y2k", boho: "波西米亚", elegant: "优雅", chic: "时髦", edgy: "个性",
  spring: "春季", summer: "夏季", autumn: "秋季", fall: "秋季", winter: "冬季",
  black: "黑色", white: "白色", gray: "灰色", grey: "灰色", red: "红色", pink: "粉色",
  blue: "蓝色", green: "绿色", brown: "棕色", beige: "米色", ivory: "米色", cream: "米色",
  yellow: "黄色", orange: "橙色", purple: "紫色", navy: "藏青",
  leather: "皮革", denim: "牛仔", cotton: "棉质", wool: "羊毛", silk: "丝绸",
  knit: "针织", knitted: "针织", linen: "亚麻", satin: "缎面", lace: "蕾丝",
  velvet: "丝绒", tweed: "粗花呢", cashmere: "羊绒", fleece: "抓绒",
  loose: "宽松", oversized: "宽松", fitted: "修身", slim: "修身", tailored: "剪裁",
  stripe: "条纹", stripes: "条纹", plaid: "格纹", check: "格纹", checkered: "格纹",
  floral: "碎花", solid: "纯色", print: "印花", printed: "印花",
  commute: "通勤", office: "职场", weekend: "休闲", party: "派对", date: "约会",
  outdoor: "户外", indoor: "室内", travel: "旅行", vacation: "度假",
  womenswear: "女装", menswear: "男装", unisex: "中性",
  coat: "外套", jacket: "夹克", trench: "风衣", overcoat: "外套",
  dress: "连衣裙", skirt: "半裙", pants: "长裤", jeans: "牛仔", trousers: "长裤",
  shirt: "衬衫", blouse: "衬衫", tshirt: "t 恤", sweater: "毛衣", cardigan: "开衫",
  boots: "靴子", sneakers: "运动鞋", heels: "高跟鞋", flats: "平底鞋", sandals: "凉鞋",
  bag: "包包", handbag: "手提包", scarf: "围巾", hat: "帽子", cap: "帽子",
  herringbone: "人字纹", houndstooth: "千鸟格", corduroy: "灯芯绒",
};
function isPureEn(s) { return !/[一-龥]/.test(String(s)); }

function normalize(json, mode, tagLang) {
  let tags = json && Array.isArray(json.suggestedTags)
    ? json.suggestedTags.map((t) => String(t).trim()).filter(Boolean)
    : [];
  if (tagLang === "zh") {
    tags = tags
      .map((t) => {
        if (!isPureEn(t)) return t;
        const key = t.toLowerCase().replace(/[-_\s]/g, "");
        return EN2ZH_TAG[key] || null;
      })
      .filter(Boolean);
  } else {
    tags = tags.map((t) => t.toLowerCase());
  }
  tags = Array.from(new Set(tags)).slice(0, 8);
  return {
    mode: (json && json.mode) || mode || "clothing_only",
    category: json && json.category === "male" ? "male" : "female",
    prompt: String((json && json.prompt) || "").trim(),
    suggestedTags: tags,
  };
}
// 反推指令：远程 provider 无需读文件，图片单独作为多模态输入
function instructionNoPath(mode, lang, tagLang) {
  return buildInstruction(mode, "(the attached image)", lang === "zh" ? "zh" : "en", tagLang === "en" ? "en" : "zh");
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
            { type: "text", text: instructionNoPath(mode, cfg.lang, cfg.tagLang) },
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
  return normalize(extractJson(text), mode, cfg.tagLang === "en" ? "en" : "zh");
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
            { type: "text", text: instructionNoPath(mode, cfg.lang, cfg.tagLang) },
            { type: "image", source: { type: "base64", media_type: "image/png", data: toB64(imageBase64) } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error("Anthropic 接口 " + res.status + ": " + (await res.text()).slice(0, 200));
  const data = await res.json();
  const text = (data.content || []).map((c) => c.text || "").join("");
  return normalize(extractJson(text), mode, cfg.tagLang === "en" ? "en" : "zh");
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
            { text: instructionNoPath(mode, cfg.lang, cfg.tagLang) },
            { inline_data: { mime_type: "image/png", data: toB64(imageBase64) } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error("Gemini 接口 " + res.status + ": " + (await res.text()).slice(0, 200));
  const data = await res.json();
  const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
  return normalize(extractJson(text), mode, cfg.tagLang === "en" ? "en" : "zh");
}

module.exports = { openai, anthropic, gemini };
