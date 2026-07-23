// 三档反推 system prompt —— 依据 PROMPT_SPEC.md v1
// 每档返回：给模型的完整指令文本（含图片读取指示 + 输出 JSON 契约）

// 结尾固定收束句（随语言切换）
const TAIL = {
  en: "End the prompt text with: 'realistic textures, no logos, no readable text'.",
  zh: "提示词全文用简体中文，并以这句中文收尾：真实材质质感，无 logo，无可辨识文字。",
};

// 语言指令：决定 prompt 字段用什么语言书写
const LANG_INSTRUCTION = {
  en: 'Write the entire "prompt" value in natural ENGLISH.',
  zh: '重要："prompt" 字段的值必须整体用简体中文书写。上文英文模板句仅用于说明结构，请把它们转述为自然流畅的中文，不要在 prompt 里夹带英文句子（专有品类词可保留）。"suggestedTags" 仍保持英文小写关键词，便于标签检索统一。',
};

const OUTPUT_CONTRACT = `Output STRICT JSON only (no markdown fences, no prose), shape:
{"mode": "<the mode>", "category": "male" | "female", "prompt": "<image-generation prompt in the required language>", "suggestedTags": ["up to 8 lowercase english keywords: style/scene/season/color/material"]}`;

const MODES = {
  // 档 A —— 纯服装（默认）。用户已确认：不反推场景。
  clothing_only: `MODE = clothing_only.
Describe ONLY the clothing outfit, head-to-toe, each garment as: color + fabric/material + silhouette/fit + construction detail. Order: cap/headwear -> top -> mid layer/outerwear -> bottom -> shoes -> bag -> accessories(glasses/jewelry/belt).
Explicitly IGNORE the person's identity, face, hairstyle, skin, body and the background. Do NOT describe pose, scene, environment or lighting.`,

  // 档 B —— 白底带人（真人模特棚拍 editorial）
  with_model: `MODE = with_model.
Write the prompt in 3 blocks separated by newlines:
(1) Person: "A full-body fashion editorial portrait of a young [ethnicity] [woman/man] with [skin][build]. [hair]. [headwear/glasses]."
(2) Outfit: "She/He wears " + full head-to-toe garment description (color+fabric+silhouette+detail).
(3) Pose + composition + lighting: relaxed standing pose, gaze, centered composition, seamless pure white studio background, clean high-key editorial lighting (soft frontal key, gentle fill, faint shadow beneath shoes). Add "no props".`,

  // 档 C —— 白底假人（幽灵模特 / 透明亚克力隐形模特）
  ghost_mannequin: `MODE = ghost_mannequin.
Write the prompt in 3 blocks separated by newlines:
(1) "Full-body front-view fashion product image of a headless transparent clear acrylic mannequin wearing the complete outfit; no head, no face, no hair, no skin, no human model. Neutral upright stance, transparent mannequin arms relaxed at both sides." (if a bag exists: one transparent hand holds it).
(2) Full head-to-toe garment description; put any cap "displayed on the mannequin's neck stump".
(3) "Centered full-length composition, all garments fully visible, seamless pure white studio background, clean high-key e-commerce lighting, soft even frontal illumination, faint grounding shadow, sharp realistic textures and transparent acrylic. No props."`,
};

const MODE_KEYS = Object.keys(MODES);

// 组装最终发给模型的完整指令（imagePath 为本地临时文件绝对路径；lang: "en" | "zh"）
function buildInstruction(mode, imagePath, lang) {
  const l = lang === "zh" ? "zh" : "en";
  const modeSpec = MODES[mode] || MODES.clothing_only;
  const realMode = MODES[mode] ? mode : "clothing_only";
  return `You are a fashion prompt reverse-engineer. Read the image file at:
${imagePath}

Then produce an image-generation prompt following the mode below, and detect the garment's target gender.

${modeSpec}

${TAIL[l]}

${LANG_INSTRUCTION[l]}

${OUTPUT_CONTRACT}
Set "mode" to "${realMode}".`;
}

module.exports = { MODES, MODE_KEYS, buildInstruction };
