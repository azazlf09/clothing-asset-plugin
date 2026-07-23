# 服装资产库浏览器插件 · 项目追踪文档

> 本文件是本项目的**唯一权威追踪文档**，每次推进开发、变更决策、完成里程碑后**必须同步更新**。
> 最后更新：2026-07-22（拆解三档提示词规范 + Eagle式标签 + API兼容方案）· 状态：🟢 提示词规范已到位，schema 可定稿，M0/M1 可开工
>
> 范围收敛：**插件当前只负责「提示词反推 + 图片保存/管理」**，不做图像生成/抠图处理。

---

## 一、项目概述

一个浏览器插件：在网页上看到好看的服装搭配时，**一键保存图片进资产库**，并**自动反推服装提示词**（默认只描述服装、不描述人物长相，可选全要素反推）。底层反推复用本地 Claude Code CLI 的后台 API key。

**核心价值链（任一环断则产品价值归零）：**

```
[浏览器侧边栏] 取图 →① 反推适配层(API优先/Native可选) →② 多模态模型(带图三档反推)
                                                              │
   [资产库检索] ←③ 入库+Eagle式标签 ← 结构化JSON(prompt+category+tags) ┘
```

---

## 二、原始需求清单（用户提出）

1. 保存图片至资产库。
2. 保存时反推服装提示词（**默认只反推服装、不描述人物长相**；**可选**对整体反推）。
3. 底层反推用本地 Claude Code CLI 的后台 API key。
4. 未进库时为**侧边栏**：负责图片保存、反推、上标签等操作；侧边栏唤醒**动态挤占**浏览器界面（不遮挡网页内容）；支持自定义设置（如快捷键唤醒）。
5. 侧边栏有入口按钮进入**资产库**：用于预览、一键复制提示词 / 提示词+图片；支持增删；增加功能支持反推与上标签；**分类导航要做好**，防止图片量大后难找。
6. 分类标签系统：支持自定义分类，也支持保存时自动分类。

---

## 三、圆桌会议决策纪要（已冻结）

参会：Jake Archibald（浏览器平台）、John Carmack（系统工程）、Andrej Karpathy（视觉反推）、S. R. Ranganathan（分面分类）。

### 决策 1 · 桥的架构（生死线）

浏览器 MV3 扩展跑在沙箱里，**无法 spawn 进程、读不到本地 API key**。够到本地 `claude` CLI 的唯一合法通道是 **Native Messaging**：

```
扩展(content/side panel) ⇄ 本地 Native Host(stdio) ⇄ claude CLI(带图) ⇄ 返回JSON
```

> 第一优先级：先用 60 行本地脚本跑通「收图 → 调 claude -p 带图 → 吐结构化 JSON」这条最脏链路。UI 是后话。

### 决策 2 · 定型时机（演绎立骨 + 归纳长肉）


| 要冻结的东西               | 定型时机       | 方式          |
| -------------------- | ---------- | ----------- |
| 取图管线契约（怎么拿像素、什么格式过桥） | 第 0 天      | 演绎（浏览器约束）   |
| 分面「轴」（七维）            | 第 0 天      | 演绎（服装领域先验）  |
| 受控枚举词表（每轴取值）         | 第 1 天定 v1  | 先验起草 + 样本校准 |
| 开放文本字段（廓形/面料描述）      | 随 30 张样本演进 | 归纳          |


### 决策 3 · 取图管线契约（Archibald）

网页图形态多样（`<img>` / CSS background / 懒加载 / 防盗链403 / base64 / canvas）。取图策略：

- 优先取 `src` / `currentSrc`；
- 失败则**截取该 DOM 区域**；
- 统一转 **base64 PNG** 过桥。

### 决策 4 · 自动标签（用户拍板简化）⭐

- **不做复杂智能自动标签**，避免数据未积累时过度设计。
- 当前只区分**男装 / 女装**两个大类。
- 预留一个「**标签变量输入框**」（控制标签变量的输入框）：未来要加新大类（童装/运动/礼服等）时，在此框内添加，无需改代码。
- 自动打标准的详细评判标准 → 后续再定。

### 决策 5 · 标签系统：改用 Eagle 式灵活标签（用户拍板，取代固定七轴）⭐

用户要求参考 **Eagle** 的灵活标签机制。原「固定七轴分面」降级为「推荐标签组」，**不再作为强制 schema 字段**。

- **扁平标签（flat tags）**：一图多标、数量不限、可自定义、支持自动补全。
- **标签组（tag groups）**：可给标签归组并分色（如把 风格/场景/色系/季节/材质 作为标签组，而非强制字段）——保留 Ranganathan 的分面思想，但**软约束**。
- **文件夹 + 智能文件夹（smart folder）**：智能文件夹按标签规则自动聚合（如「vintage + 女装」）。
- **唯一硬字段**：`category = male | female`（大类，靠决策4的输入框扩展）。
- **降摩擦**：反推时模型输出 `suggestedTags`，用户勾选入库，不强制校对。

---

## 四、反推提示词规范（✅ 已拆解 → 详见 `PROMPT_SPEC.md`）

素材包已到位（6 套：女1-3 / 男1-3，各含 原图 + 外景 + 白底带人 + 白底假人 + 三套txt），已拆解为三档规范。
**核心洞察：三档共享同一「服装内核」（从头到脚逐件描述），只是外层包裹不同。**


| 档   | 素材名  | mode 值            | 内容                            |
| --- | ---- | ----------------- | ----------------------------- |
| A   | 外景   | `clothing_only`   | **纯服装内核**（默认，忽略人物/场景/光影）      |
| B   | 白底带人 | `with_model`      | 真人壳：人物+服装+姿势+白底棚拍光影（可替场景做外景版） |
| C   | 白底假人 | `ghost_mannequin` | 透明亚克力隐形模特+服装+电商光影             |


> 完整模板骨架、系统提示词、逐档实例见 **PROMPT_SPEC.md**。产出语言=英文。

**资产 schema v1（Eagle 式标签，硬字段仅 category）：**

```jsonc
{
  "id": "uuid",
  "image": "IndexedDB blob 引用",
  "thumb": "缩略图",
  "sourceUrl": "网页来源",
  "createdAt": "时间戳",
  "category": "male | female",         // 唯一硬字段(可经输入框扩展)
  "prompts": {                         // 反推产出, 三档可分别缓存
    "clothing_only": "",
    "with_model": "",
    "ghost_mannequin": ""
  },
  "tags": ["vintage", "boho", "winter", "..."],  // Eagle式扁平标签, 一图多标
  "rating": 0,                         // 可选评分(Eagle风格)
  "note": ""                           // 可选备注
}
// 标签组/智能文件夹为「视图层」概念, 不落在单条记录里, 由标签规则动态聚合。
```

---

## 五、技术架构（初拟）


| 层          | 技术选型（待定稿）                   | 说明                            |
| ---------- | --------------------------- | ----------------------------- |
| 扩展形态       | Chrome MV3 + Side Panel API | 侧边栏用官方 Side Panel（原生挤占、不遮挡网页） |
| 内容脚本       | content script              | 取图 + 唤醒侧边栏 + 快捷键              |
| 后台         | service worker              | 消息中转、反推适配层入口                  |
| 反推适配层 ⭐    | 多 provider 适配器（见决策6）        | 统一内部接口，兼容主流格式                 |
| 桥（可选/最终目标） | Native Messaging Host       | 打通本地 claude CLI；未打通则走 API     |
| 存储         | IndexedDB（图 blob + 元数据）     | 本地资产库，容量大                     |
| 资产库 UI     | 独立页面（新标签页 / 扩展页）            | 标签导航 + 预览 + 复制 + 增删           |


### 决策 6 · 反推走「API 适配层」，本地 CLI 降为可选（用户拍板）⭐

用户：若本地与浏览器暂时打不通，先用 **API 接口**反推+上标签，接口要兼容主流几种格式。

- **统一内部接口**：`reason(imageBase64, mode, opts) -> { mode, category, prompt, suggestedTags[] }`。
- **适配器（provider）**，第一版覆盖：
  1. **OpenAI 兼容格式** `/v1/chat/completions`（messages + image_url）——**优先**，覆盖面最大（中转站 / LM Studio / Ollama / 各类兼容服务都走它）。
  2. **Anthropic Messages API**（claude，image base64 source）。
  3. **Google Gemini** `generateContent`（inlineData）。
  4. **本地 Claude Code CLI**（Native Messaging）——最终目标，打通后作为一个 provider 接入。
- **配置项**：`provider / baseURL / apiKey / model`，在插件设置页切换。
- 适配层负责：把 image+prompt 打包成各家请求格式 + 解析各家返回 → 归一成内部结构。

---

## 六、开发路线图 / 里程碑

- [x] **M1 · 提示词规范拆解**：三档规范 → `PROMPT_SPEC.md`；schema v1 定稿（见第四节）。
- [ ] **M0 · 反推链路验证（可先行）**：先跑通 **API 适配层**（OpenAI 兼容优先）「base64 图 + 三档 system prompt → 返回 JSON」；Native Messaging 后续接入。
- [ ] **M2 · 取图管线**：content script 稳定拿像素（src → 截图兜底）→ base64。
- [ ] **M3 · 侧边栏 MVP**：Side Panel 保存 + 三档反推 + 男/女大类 + 标签变量输入框 + Eagle式标签 + 快捷键设置。
- [ ] **M4 · 资产库**：IndexedDB 存储 + 标签/智能文件夹导航 + 预览 + 一键复制(词/词+图) + 增删。
- [ ] **M5 · 打磨**：Native Messaging 接入、自定义设置、性能（500+ 图检索）。

---

## 七、进度追踪


| 日期         | 里程碑 | 动作                                                                    | 状态    |
| ---------- | --- | --------------------------------------------------------------------- | ----- |
| 2026-07-22 | —   | 圆桌两节，冻结架构方案；生成本追踪文档                                                   | ✅     |
| 2026-07-22 | M1  | 收素材包，拆解三档提示词规范→`PROMPT_SPEC.md`；schema v1 定稿；标签改 Eagle 式；新增 API 适配层方案 | ✅     |
| 2026-07-22 | M0  | 反推适配层 server + CLI provider + extension 全量开发，端到端联调通过                     | ✅     |
| 2026-07-22 | M3  | 用户反馈 5 项修复（见下表）                                                       | ✅     |

### M3 · 用户反馈修复（2026-07-22）

| # | 反馈 | 根因 | 修复 |
|---|---|---|---|
| 1 | 快捷键唤起失效 | 命令处理不够健壮 | `background.js` 重构：`openPanel` 兜底 tabId/windowId；冷启动补设 `openPanelOnActionClick` |
| 2 | CLI 反推极慢(178s) | 每次冷启动加载全部 MCP 服务器 + 默认走 opus | `cli.js` 加 `--strict-mcp-config`(跳过 MCP) + 默认 `--model sonnet`；实测 178s→**~50s**(≈3.6x)。侧边栏加实时计时反馈 |
| 3 | 资产库跳转显示 bug | `library.css` 中 `.modal{display:flex}` 在 `.hidden{display:none}` 之后、同优先级→弹窗永远显示(空白破图) | 加 `.modal.hidden{display:none}` |
| 4 | 需悬浮图标唤起侧边栏 | 无 | `content.js` 常驻注入悬浮按钮：可沿边滑动拖拽(记忆位置)、点击唤起侧边栏；`manifest` 声明 content_scripts |
| 5 | 图片悬停显示反推小框 | 无 | 悬停网页图片(≥100px)显示「反推服装」chip，点击直接把图送入侧边栏并打开 |


---

## 八、未决事项 / 待用户输入

1. ✅ ~~反推提示词规范集~~ —— 已到位并拆解（`PROMPT_SPEC.md`）。
2. ⬜ 反推 API 首选 provider 与配置（用户的中转/本地服务 baseURL、model）—— 决定 M0 用哪家先跑通。
3. ⬜ 自动标签的详细评判标准（用户说后续加）。
4. ⬜ 快捷键默认组合、侧边栏挤占宽度等交互细节。
5. ⬜ PROMPT_SPEC.md 第4节系统提示词是否照此定稿。

---

## 八·补 · M4 中文提示词输出（2026-07-23 追加）

- **需求**：反推默认英文，用户可选"输出纯中文提示词"。
- **实现**：全链路加 `lang` 参数（`en`|`zh`），侧边栏顶部反推区加复选框（localStorage 记忆）。
  - `prompts.js` 新增 `LANG_INSTRUCTION` + `TAIL` 双语版本；`buildInstruction(mode, imagePath, lang)`。
  - `server.js` `/reason` 端点接收 `body.lang`，通过 `runReason` 透传给各 provider。
  - `cli.js` / `remote.js`（openai/anthropic/gemini）全部把 `lang` 传给 `buildInstruction`。
  - `extension/lib/reason.js` `reason(image, mode, lang)`；`sidepanel.js` 反推时读取复选框状态。
  - `suggestedTags` 保持英文小写关键词，便于跨语言标签检索统一。
- **联调验证**（女1 原图，clothing_only，lang=zh，CLI provider）：
  - `HTTP 200 / 68.3s / category=female`
  - prompt 中文字符占比 **87.6%**（余下为标点/A字/Y2K 等通用符与专有词）
  - 结尾正确收束「真实材质质感，无 logo，无可辨识文字。」
  - 标签仍为英文：`y2k, vintage, autumn, brown, leather, plaid, boots, streetwear` ✓

### M5 · 加载失败修复（"清单文件缺失或不可读取"）

- **根因定位**：
  1. workspace 根下遗留一个**空壳** `extension/` 目录（只有 `lib/` 空目录 + 旧 `library.js`，**无 manifest.json**）——用户误加载它就报"清单文件缺失"。
  2. 正确目录 `outputs/extension/` 缺少 `library.js`（`library.html` 引用它 → 加载资产库页面时报错）。
- **修复**：
  - 从根下空壳把 `library.js`（6326B、DOM id 与 `library.html` 完全匹配）复制到 `outputs/extension/`。
  - 删除根下空壳 `extension/` 目录，避免后续继续误加载。
- **正确加载路径**：`C:\Users\Administrator\Documents\claude\服装资产库插件\服装资产库插件\projects\proj-1784793384557-b5d0cv\outputs\extension\`

---

## 九、工作约定（本项目）

- 本文件为唯一追踪源，**每次推进后立即更新第七节进度表 + 相关章节**。
- 修改前先读全文件；UI 改动必须真实跑一次验证。
- 反推 schema 与分面词表未定稿前，不写依赖它们的上层代码。

&nbsp;