# 反推提示词规范（三档）· v1

> 从 6 套素材（女1-3 / 男1-3，各含 原图 + 外景 + 白底带人 + 白底假人 + 三套txt）拆解归纳。
> 用途：驱动插件的服装提示词反推功能。产出语言 = **英文**（用于出图）。
> 最后更新：2026-07-22

---

## 0. 核心洞察：一个「服装内核」+ 三种「外壳」

三档提示词共享**同一份服装单品描述（garment core）**，区别只在外层包裹：

```
                    ┌─ 档1 纯服装(外景)   = 服装内核 + 无壳
  [服装内核] ───────┼─ 档2 白底带人       = 真人壳 + 服装内核 + 姿势/棚拍光影
   (从头到脚         └─ 档3 白底假人       = 透明假人壳 + 服装内核 + 电商光影
    逐件描述)
```

**服装内核结构**（从上到下逐件，每件 = 颜色 + 材质/面料 + 版型/廓形 + 工艺/细节）：
1. 头部：帽 / 头饰 / 耳饰（cap / earmuffs）
2. 上装：T恤 / 衬衫 / blouse / 针织衫
3. 中层：外套 / 背心 / blazer / vest / tie
4. 下装：裙 / 裤
5. 足部：鞋 / 靴
6. 包袋：bag / tote
7. 配饰：眼镜 / 首饰（bracelet / rings / earrings）/ 腰带 / 领带

**通用收尾（所有档统一）**：
`[整体风格定位aesthetic], [色板palette 逐色列举]; realistic [材质列表] textures; no logos, no readable text` （档2/档3 再加 `no props`）

---

## 1. 档 A · 纯服装（素材名「外景」）— 默认档

- **用途**：最通用的服装反推，服装内核本体，可复用于任意生成场景。
- **排除**：人物长相、姿势、场景、光影（Karpathy 铁律：显式忽略 identity/face/body）。
- **模板骨架**：
  ```
  [Aesthetic定位] outfit in [色板]:
  [服装内核 · 逐件颜色+材质+版型+细节];
  [cohesive styling 一句总结], [palette 再列举];
  realistic [材质] textures, no logos, no readable text.
  ```
- **实例**（女1）：`Vintage boho streetwear outfit: dark brown patchwork newsboy cap in distressed leather...; ...; Cohesive early-2000s boho punk styling, muted earthy palette of cream, espresso brown, rust orange, charcoal, and aged bronze; realistic fabric textures, no brand logos, no readable text.`
- 对应用户最初「模式A 只描述服装」。

## 2. 档 B · 白底带人（模特棚拍 editorial）

- **三段式**（空行分隔）：
  1. **人物**：`A full-body fashion editorial portrait of a young [East Asian] [woman/man] with [肤色][体型]. [发型描述]. [头饰/眼镜].`
  2. **服装**：`She/He wears [服装内核].`
  3. **姿势+构图+光影**：`[Relaxed ... standing pose, 手/身体朝向, gaze]. Centered composition against a seamless pure white studio background. Clean high-key editorial lighting, [key light / fill / shadow]. Realistic [材质] textures. No logos, no readable text, no props.`
- **可选强化块**（女2/男3 使用）：严格纯白 `#FFFFFF`——
  `The entire visible background and floor are solid true white #FFFFFF: no cream, no beige, no gray, no gradient, no wall texture, no environmental setting, no horizon line. Neutral daylight-balanced high-key lighting, no warm color cast; only a very faint soft white-on-white contact shadow beneath the [shoes].`
  → 当模型爱加环境色时启用。
- 对应用户「模式B 全要素」。若要**外景**版，替换第3段场景描述即可（人物+服装内核不变）。

## 3. 档 C · 白底假人（幽灵模特 / 透明亚克力隐形模特）

- **三段式**：
  1. **假人定义**：`Full-body front-view fashion product image of a headless transparent clear acrylic mannequin wearing the complete outfit; no head, no face, no hair, no skin, no human model. Neutral upright stance, transparent mannequin arms relaxed naturally at both sides. [若持包: one transparent hand holds ...].`
  2. **服装**：服装内核（帽子写 `displayed on the mannequin's neck stump`）。
  3. **构图+电商光影**：`Centered full-length composition, all garments and accessories fully visible, seamless pure white studio background, clean high-key e-commerce lighting, soft even frontal illumination, faint grounding shadow beneath the [shoes], sharply detailed realistic [材质] and transparent acrylic textures. No logos, no readable text, no props.`
- 对应用户「模式C ghost_body」。

---

## 4. 反推系统提示词（插件调用模板 · 草案）

插件把网页图片 + 选定档位喂给模型，要求输出对应档 JSON。核心 system prompt：

```
You are a fashion prompt reverse-engineer. Given an input image, output an
English image-generation prompt describing ONLY the clothing outfit, following
the requested MODE. Describe garments head-to-toe: color + fabric/material +
silhouette/fit + construction detail. Always end with: realistic textures,
no logos, no readable text.

RULES:
- MODE=clothing_only : describe ONLY the outfit. Explicitly IGNORE the person's
  identity, face, hairstyle, body, and background. No pose, no scene, no lighting.
- MODE=with_model : 3 blocks — (1) person(gender/skin/build/hair/accessory)
  (2) "wears" + outfit (3) pose + centered composition + seamless pure white
  studio + high-key lighting. End with "no props".
- MODE=ghost_mannequin : 3 blocks — (1) headless transparent acrylic mannequin,
  no head/face/hair/skin (2) outfit, cap on neck stump (3) e-commerce high-key
  lighting + pure white bg. End with "no props".

Also output: category (male|female), and up to 8 suggestedTags (style/scene/
season/color/material keywords, lowercase English).

Output strict JSON: { "mode", "category", "prompt", "suggestedTags":[] }
```

> ⚠️ 待你确认后定稿；受控字段目前只有 `category=male|female`（其余走自由标签，见标签系统）。
