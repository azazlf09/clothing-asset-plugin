// 四档反推 system prompt —— 依据 PROMPT_SPEC.md v1
// 每档返回：给模型的完整指令文本（含图片读取指示 + 输出 JSON 契约）
//
// 双语原生模板：
//   lang=en → 走英文模板（MODES_EN），prompt 与标签均英文原生产出
//   lang=zh → 走中文模板（MODES_ZH），prompt 与标签均中文原生产出（不经翻译层）
// 默认 lang=zh（用户偏好中文优先）。

// 结尾固定收束句（随语言切换；full_scene 不带收束句，见 buildInstruction）
const TAIL = {
  en: "End the prompt text with: 'realistic textures, no logos, no readable text'.",
  zh: "提示词以这句中文收尾:真实材质质感,无 logo,无可辨识文字。",
};

// 标签语言指令（独立于 prompt 语言，由 tagLang 控制，默认中文）
// —— 均为「模型自由产出」，不限定受控词表。
const TAGS_INSTRUCTION = {
  en: '"suggestedTags" MUST be an array of up to 8 short lowercase english keywords (1-2 words each), freely chosen to best describe this image, covering style/scene/season/color/material/category. Example: ["vintage","autumn","brown","leather","commute","knit"]. This applies regardless of the prompt language.',
  zh: '"suggestedTags" 字段必须是一个数组,里面每一项都是 2-4 个汉字的简体中文短标签,由你根据这张图自由拟定(不限定固定词表),最多 8 个,覆盖风格/场景/季节/色系/材质/品类等维度。严禁英文/拼音/中英混写。示例:["复古","秋季","棕色","皮革","通勤","针织","宽松","条纹"]。无论 prompt 用什么语言书写,这些标签都必须是纯中文。',
};

const OUTPUT_CONTRACT_EN = `Output STRICT JSON only (no markdown fences, no prose), shape:
{"mode": "<the mode>", "category": "male" | "female", "prompt": "<image-generation prompt>", "suggestedTags": [<see tags instruction>]}`;

const OUTPUT_CONTRACT_ZH = `只输出严格的 JSON(不要 markdown 代码围栏,不要任何解释文字),结构如下:
{"mode": "<档位>", "category": "male" 或 "female", "prompt": "<出图提示词>", "suggestedTags": [<见标签说明>]}`;

// ===================== 英文原生模板 =====================
const MODES_EN = {
  clothing_only: `MODE = clothing_only.
Describe ONLY the clothing outfit, head-to-toe, each garment as: color + fabric/material + silhouette/fit + construction detail. Order: cap/headwear -> top -> mid layer/outerwear -> bottom -> shoes -> bag -> accessories(glasses/jewelry/belt).
Explicitly IGNORE the person's identity, face, hairstyle, skin, body and the background. Do NOT describe pose, scene, environment or lighting.`,

  with_model: `MODE = with_model.
Write the prompt in 3 blocks separated by newlines:
(1) Person: "A full-body fashion editorial portrait of a young [ethnicity] [woman/man] with [skin][build]. [hair]. [headwear/glasses]."
(2) Outfit: "She/He wears " + full head-to-toe garment description (color+fabric+silhouette+detail).
(3) Pose + composition + lighting: relaxed standing pose, gaze, centered composition, seamless pure white studio background, clean high-key editorial lighting (soft frontal key, gentle fill, faint shadow beneath shoes). Add "no props".`,

  ghost_mannequin: `MODE = ghost_mannequin.
Write the prompt in 3 blocks separated by newlines:
(1) "Full-body front-view fashion product image of a headless transparent clear acrylic mannequin wearing the complete outfit; no head, no face, no hair, no skin, no human model. Neutral upright stance, transparent mannequin arms relaxed at both sides." (if a bag exists: one transparent hand holds it).
(2) Full head-to-toe garment description; put any cap "displayed on the mannequin's neck stump".
(3) "Centered full-length composition, all garments fully visible, seamless pure white studio background, clean high-key e-commerce lighting, soft even frontal illumination, faint grounding shadow, sharp realistic textures and transparent acrylic. No props."`,

  full_scene: `MODE = full_scene. THIS IS NOT A CLOTHING-CATALOG MODE. IGNORE any garment-listing template you have used before.
Your ONLY job: describe the WHOLE image as a single natural, flowing image-generation prompt that fully captures the scene as a photograph — subject, environment, mood, lighting, camera, style — all together.

MUST include (weave naturally, do NOT use bullet points, do NOT use section headings, do NOT enumerate garments head-to-toe):
- The subject/people (gender cue, approximate age, ethnicity cue, hair, expression, pose, body language, gaze).
- The clothing as it appears in the scene (a natural short phrase — e.g. "wearing a cream trench coat over a black turtleneck and dark jeans" — NOT a head-to-toe checklist).
- The scene and environment (indoor/outdoor, location type, props, architecture, weather, time of day, background depth).
- The camera and composition (shot type — full-body / medium / close-up / wide, angle, framing, depth of field).
- The lighting and mood (main light source and direction, color temperature, contrast, atmosphere).
- The photographic style / aesthetic (film-look, editorial, street snapshot, cinematic, documentary, color grading).

FORBIDDEN in this mode:
- Do NOT list garments item-by-item (no "cap -> top -> outerwear -> bottom -> shoes -> bag" order).
- Do NOT ignore the background, scene, lighting or camera — those are the point of this mode.
- Do NOT add an e-commerce closer like "realistic textures, no logos, no readable text" — that belongs to clothing modes.
- Do NOT split into numbered blocks (1)(2)(3).

Write the whole thing as ONE continuous descriptive paragraph, the way a photographer would brief an image-generation model to recreate this exact photograph.`,
};

// ===================== 中文原生模板 =====================
// 原生产出中文 prompt，不经翻译层。结构约束与英文档一一对应。
const MODES_ZH = {
  // 档 A —— 纯服装(默认)。只描述服装,不反推人物/场景。
  clothing_only: `档位 = clothing_only(纯服装)。
只描述这套服装本身,从头到脚逐件写,每件按:颜色 + 面料/材质 + 版型/廓形 + 工艺细节。顺序:帽子/头饰 → 上衣 → 中层/外套 → 下装 → 鞋 → 包 → 配饰(眼镜/首饰/腰带)。
明确忽略人物的身份、五官、发型、肤色、体型以及背景环境。不要描述姿势、场景、环境或光影。整体用自然流畅的中文短语连缀,不要分块编号。`,

  // 档 B —— 白底带人(真人模特棚拍)
  with_model: `档位 = with_model(白底带人)。
用中文写,分 3 段(用换行分隔):
(1) 人物:「一张全身时尚大片,一位年轻的[族裔][女性/男性],[肤色][身形]。[发型]。[头饰/眼镜]。」
(2) 服装:「身穿 」+ 从头到脚完整的服装描述(颜色+面料+廓形+细节)。
(3) 姿势 + 构图 + 光影:自然放松的站姿、眼神方向、居中构图、无缝纯白棚拍背景、干净的高调棚拍布光(柔和正面主光、轻微补光、鞋下浅淡投影)。补一句「无多余道具」。`,

  // 档 C —— 白底假人(幽灵模特/透明亚克力隐形模特)
  ghost_mannequin: `档位 = ghost_mannequin(白底假人/幽灵模特)。
用中文写,分 3 段(用换行分隔):
(1)「一张全身正面的服装产品图:一具无头透明亚克力隐形模特穿着整套服装;没有头、没有脸、没有头发、没有皮肤、没有真人。中性直立站姿,透明模特手臂自然垂于两侧。」(若有包:一只透明的手拎着它)。
(2) 从头到脚完整的服装描述;若有帽子写成「陈列在模特颈部断口上方」。
(3)「居中全身构图,所有服装完整可见,无缝纯白棚拍背景,干净的高调电商布光,柔和均匀的正面照明,浅淡落地投影,清晰真实的材质质感与透明亚克力。无多余道具。」`,

  // 档 D —— 反推全图(不套模板,整图完整描述)
  full_scene: `档位 = full_scene(反推全图)。这不是服装清单模式。忽略之前任何"逐件列服装"的模板。
你唯一的任务:把整张图当作一张照片,写成一段自然连贯的中文出图提示词,完整还原画面——人物、环境、氛围、光影、镜头、风格,全都揉在一起写。

必须包含(自然融入行文,不要用符号列点,不要用小标题,不要从头到脚罗列每件衣服):
- 主体/人物(性别、大致年龄、族裔感、发型、表情、姿势、肢体语言、眼神)。
- 服装在画面中的样子(用一句自然短语带过——例如「身穿米色风衣内搭黑色高领和深色牛仔裤」——不要逐件清单)。
- 场景与环境(室内/室外、地点类型、道具、建筑、天气、时间、背景纵深)。
- 镜头与构图(景别——全身/中景/特写/大远景、角度、取景、景深)。
- 光影与氛围(主光源方向、色温、对比、氛围感)。
- 摄影风格/美学(胶片感、时尚大片、街拍、电影感、纪实、调色倾向)。

本档禁止:
- 不要逐件罗列服装(不要出现"帽子→上衣→外套→下装→鞋→包"这种顺序)。
- 不要忽略背景、场景、光影、镜头——这些正是本档的重点。
- 不要加"真实材质质感,无 logo,无可辨识文字"这类电商收束句(那是服装档的)。
- 不要分成 (1)(2)(3) 编号段落。

整段写成一气呵成的中文描述,就像摄影师向出图模型交代如何复刻这张照片。`,
};

const MODE_KEYS = Object.keys(MODES_EN);

// 组装最终发给模型的完整指令
//   imagePath: 本地临时文件绝对路径
//   lang:    prompt 字段语言 "en" | "zh"（默认 zh）
//   tagLang: 标签语言 "en" | "zh"（默认 zh）
function buildInstruction(mode, imagePath, lang, tagLang) {
  const l = lang === "en" ? "en" : "zh"; // 默认中文
  const tl = tagLang === "en" ? "en" : "zh"; // 默认中文
  const MODES = l === "zh" ? MODES_ZH : MODES_EN;
  const modeSpec = MODES[mode] || MODES.clothing_only;
  const realMode = MODES[mode] ? mode : "clothing_only";
  // full_scene 不带电商收束句
  const tailLine = realMode === "full_scene" ? "" : TAIL[l] + "\n\n";
  const contract = l === "zh" ? OUTPUT_CONTRACT_ZH : OUTPUT_CONTRACT_EN;

  if (l === "zh") {
    return `你是一个视觉提示词反推助手。请读取这个图片文件:
${imagePath}

然后按下面的档位要求,产出一段出图提示词,并判断服装/画面的目标性别(full_scene 档按主体人物判断 "female" 或 "male";若无明显人物,也选最接近的一个)。

${modeSpec}

${tailLine}重要:"prompt" 字段的值必须整体用简体中文书写,自然流畅,不要夹带英文句子(专有品类名如 Y2K、A字裙 等可保留)。

===== 标签语言(独立于上面的 prompt 语言) =====
${TAGS_INSTRUCTION[tl]}
================================================

${contract}
把 "mode" 设为 "${realMode}"。`;
  }

  // 英文
  const LANG_LINE = 'Write the entire "prompt" value in natural ENGLISH.';
  return `You are a visual prompt reverse-engineer. Read the image file at:
${imagePath}

Then produce an image-generation prompt following the mode below, and detect the garment's target gender (for full_scene use "female" or "male" based on the main subject; if no clear person, still pick the closer one).

${modeSpec}

${tailLine}${LANG_LINE}

===== TAGS LANGUAGE (independent of the prompt language above) =====
${TAGS_INSTRUCTION[tl]}
====================================================================

${contract}
Set "mode" to "${realMode}".`;
}

module.exports = { MODES: MODES_EN, MODE_KEYS, buildInstruction };
