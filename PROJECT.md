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

### M6 · Git 版本管理（2026-07-23）

- **仓库根**：`服装资产库插件/服装资产库插件/`（独立仓库，与父级 `Documents/claude/` monorepo 解耦）
- **默认分支**：`main`
- **首个提交**：`82539ea chore: 初始化服装资产库插件仓库` · 21 文件入库
- **入库范围**：`PROJECT.md` / `README.md` / `.gitignore` / `projects/proj-*/outputs/`（含 server + extension + PROMPT_SPEC.md）
- **排除入库**：`素材包/`（95MB 图片资源，本地留存）· `conversations/`（对话历史）· `node_modules/` · `memory/` · IDE/系统临时文件
- **敏感数据核查**：`config.json` 中所有 apiKey 字段为空字符串 ✓，无密钥泄漏
- **新增文档**：`README.md`（快速启动 + 项目结构导览）
- **远程仓库**：暂未推送，待用户提供地址

### M7 · 反推服务开机自启动（2026-07-27）

- **痛点**：每次开机/重启后 server 未运行，用户必须手动 `node server.js` 才能反推，否则点反推报"反推失败"，插件失去实用性。
- **技术约束**：Chrome MV3 扩展运行在沙箱中，**无法唤起本地进程**，因此"点反推才启动 server"这条路走不通。改用 **Windows 开机自启 + 后台常驻**，让 server 在登录时已在跑。
- **交付脚本**（`outputs/server/scripts/`）：
  - `start-hidden.vbs` — 无窗口静默拉起 `node server.js`（`WScript.Shell.Run cmd,0,False`）。**纯 ASCII 编写**（关键：wscript 按系统 ANSI/GBK 解码 .vbs，含中文注释会导致解析崩溃、静默失败）；路径用 `WScript.ScriptFullName` 动态推导，规避中文路径编码问题。
  - `install-autostart.bat` — 一键把 vbs 快捷方式写入 Windows 启动文件夹（`shell:startup`），并立即启动一次 + 探测 `/health`。用 PowerShell 的 `WScript.Shell.CreateShortcut` 建快捷方式（对中文路径可靠）。
  - `uninstall-autostart.bat` — 移除自启动项。
- **踩坑记录**：
  1. 第一版 vbs 用 `cmd /c cd /d "中文路径" && node`——中文路径 + 嵌套引号在 vbs→cmd 传递时被打断，失败。改为 `shell.CurrentDirectory` + 直接 Run node。
  2. vbs 含中文注释 + UTF-8 编码 → wscript 用 GBK 解析时崩溃（现象：wscript 进程挂起、node 不启动）。改为纯 ASCII 后解决。
- **侧边栏兜底**（`sidepanel.*`）：打开时 ping `/health`，未就绪则顶部弹**橙色横条**"本地反推服务未启动"，含「重试连接」+「如何开启」（引导运行 install-autostart.bat）；反推失败时自动复查并弹横条。
- **验证**：
  - 自启动 vbs（wscript 触发，等同开机）→ `/health` `{"ok":true}`，仅 1 个常驻 node、无挂起 wscript ✓
  - 启动项快捷方式已写入 `Startup` 文件夹 ✓
  - 全链路真实素材反推：`HTTP 200 / ok:true / category:female / 17.9s`，提示词与标签正确 ✓
- **用户操作**：双击运行一次 `outputs/server/scripts/install-autostart.bat`，此后开机自动后台启动，无需再手动敲命令。

### M8 · 使用教程 + 分发包（2026-07-28）✅
- **产物**：
  - `outputs/使用教程.md` / `outputs/使用教程.txt`（面向公司同事的入门文档，含前置依赖检查、三步安装、常见问题）
  - `projects/proj-1784793384557-b5d0cv/服装资产库插件-v0.1.0.zip`（40KB，含 extension + server + 教程双版本，共 23 文件）
- **打包踩坑**：PowerShell `Compress-Archive` 用 GBK 存 zip entry 名 → 中文文件名乱码。改用 .NET `System.IO.Compression.ZipFile.CreateFromDirectory` + `System.Text.Encoding.UTF8` 解决。
- **分发约束**：包内**不含** Claude CLI 账号/额度，使用方必须自行配置 `claude --version` 可用。教程第二节把这条放最显眼位置。

### M9 · 生图路线（2026-07-28）❌ 已回退
- **决策**：曾实现「反推 + 自动生图」全链路（OpenAI/Stability/Replicate 三家 API 适配 + 两阶段 UI + 库存储扩展），提交为 `90ccd30`。经复盘决定这条路线暂不推进，代码全部 `git reset --hard` 回退到 M7（`1a7144f`）。
- **保留**：M8 的教程和分发包从 `90ccd30` 单独 `git checkout` 恢复。
- **可追溯**：M9 代码在 git reflog 中保留（`HEAD@{1}` 或 `90ccd30`），未来若重启该路线可 `git cherry-pick`。

### M10 · 二次入库（2026-07-28）✅
- **动作**：回退 M9 后重新提交，让 HEAD 干净停在「M7 自启动 + M8 教程与分发包」状态。
- **入库**：`使用教程.md` / `使用教程.txt` / `服装资产库插件-v0.1.0.zip`（3 文件，从 M9 恢复的 M8 产物）+ PROJECT.md 增量。

### M11 · 批量反推 + 全图档 + 中文标签 + 库分视图（2026-07-28）✅
按用户新一轮 8 条思路（生图 8 跳过），一次贯穿五层：

| 层 | 文件 | 关键改动 |
|---|---|---|
| Prompt | `server/prompts.js` | 新增第 4 档 `full_scene`（自然描述整张图，不带电商收束句）；`suggestedTags` 输出默认改为**中文短标签**（2-4 字） |
| 内容脚本 | `extension/content.js` | 新增**多选模式**：点图勾选/取消（绿色描边+计数），Esc 取消 / Enter 完成 / 按钮完成 → 一次回传所有选中图 |
| 后台 | `extension/background.js` | 新增 `start-multi-pick`（激活多选模式）+ `picked-batch`（把 N 张图存入 `pendingBatch` + 自动开侧边栏） |
| 侧边栏 | `sidepanel.{html,css,js}` | ① 段控按钮加第 4 档「反推全图」；② 单张区块用 `.single-only` 标记，批量态自动折叠；③ 批量态渲染**纵向卡片流**（每张卡片：缩略图/序号/大类下拉/移除/进度/独立提示词框/建议标签/重推/单张保存）；④ 顶部一次「反推全部」按 `CONCURRENCY=3` 并发跑；⑤ 一键「全部保存」 |
| 资产库 | `library.{html,css,js}` | 顶部加**服装 / 全图**视图切换：`full_scene` 归"全图"，其余归"服装"；切换视图会自动隐藏「大类」导航（全图视图不显示大类）；卡片头部展示大类·档位；modeFilter 下拉加"反推全图"项 |

**未做（用户明确跳过）**：生图。

**决策依据（本轮讨论）**：
- 批量 UI 采用**纵向卡片流**（对比方案：左右对照 / tab 切换）—— 侧边栏窄，纵向卡片视线永远在"图→词"一列上，最自然。
- 批量反推采用**一键并发**（并发数 3，避 CLI 排队卡死）+ 每张保留独立「重新反推」入口（作为失败重试和改档位后的兜底）。
- 中文标签只影响新反推数据；已入库的英文标签不动（用户明确"以后如需再迁移"），DB 无需改 schema。

**待用户手动**（受工具环境限制，本轮无 shell 通道）：
1. `taskkill /F /IM node.exe` 清进程 → `cd outputs/server && node server.js` 重启
2. Chrome 扩展页 **重载** `outputs/extension/`（HTML/JS 全改了）
3. Git 提交建议 message：`feat: 批量反推 + 反推全图档 + 中文标签 + 库分视图（M11）`

---

### M12 · 4 条反馈修复（2026-07-28）✅

针对用户 M11 上线后 4 条反馈：

| 反馈 | 根因 | 修复 |
|---|---|---|
| ①滑动预览时 hover 反推小框 1 秒后消失、抢不到点击 | chip 定位在图片**内部**，鼠标从图片移到 chip 途中触发 mouseout；hideTimer 只有 160ms 缓冲 | `content.js`：chip 改到图片**外部**（上方，放不下退到内部左上），hideTimer 加长到 300ms，mouseout 时增加 `chip.contains(relatedTarget)` 判空；同时 scroll/resize 时跟随 chipTarget 重定位 |
| ②hover 反推框适配多图连点、点一下加入待反推 | 原点击直接送单张并强制开侧边栏，一次只能加一张 | chip 文案改为「+ 加入批量」；新增 background 消息 `add-to-batch`（追加到 pendingBatch，不打开侧边栏）；chip 点击后显示「已加入 ✓（共 N 张）」并 1.2s 后恢复可再点；fab 上加实时**批量计数徽章**（session storage 变化自动刷新）；侧边栏 `consumeBatch` 改为**追加而非覆盖**，且按 srcUrl/image 去重 |
| ③full_scene 档提示词仍陷入服装列举模板（cap→top→bottom→shoes 顺序） | prompt 只说"描述整张图"，但未显式禁止服装列举顺序；且和其他三档共享一个 header 语气，模型倾向套模板 | `prompts.js`：full_scene 档前置一句 `THIS IS NOT A CLOTHING-CATALOG MODE. IGNORE any garment-listing template you have used before.`；显式列 FORBIDDEN 清单（不许头到脚列单品、不许分块 (1)(2)(3)、不许加电商收束句、不许忽略环境光影相机）；MUST include 里把服装降级为"a natural short phrase, NOT a head-to-toe checklist"；要求 ONE continuous paragraph |
| ④标签仍显示英文，希望可切换（默认中文） | prompt 语言（lang）和标签语言绑在一起，用户勾"输出纯中文提示词"才给中文标签；未勾时给英文 | 拆出独立参数 `tagLang`，贯穿：`prompts.js.buildInstruction(mode,path,lang,tagLang)` → `server.js` 读 `body.tagLang` → `cli.js` 传 `opts.tagLang` → `remote.js` `instructionNoPath(mode,lang,tagLang)` → `reason.js.reason(image,mode,lang,tagLang)` → 侧边栏加复选框 `#tagZh`（**默认勾选**）+ localStorage `clo_tagZh`（键不存在时视为中文，符合"默认中文"约定） |

**其他细节**：
- 新增 `#__clo_fab .badge` 圆形徽章（右上角，靠边翻转），show/hide 靠 storage listener
- 单张 chip 定位算法：优先图片上方 6px 处，放不下就退到图片内部左上角 6px
- 批量列表去重：以 srcUrl 为主键 + image dataUrl 兜底

**待用户手动**（本轮工具无 shell）：
1. `taskkill /F /IM node.exe` → `cd outputs/server && node server.js` 重启
2. Chrome 扩展页 **重载** `outputs/extension/`（content/background/sidepanel/html/js 都改了）
3. Git 提交 message：`fix: 修 hover chip / 批量累积 / full_scene 脱模板 / 标签独立中英（M12）`

## 八·补 · M13 批量三改（2026-07-28 追加）

### 反馈来源（M12 试用后）
1. 并发数应为可选（原硬编码 3）
2. 一键反推**不跟随当前档位**：选了「反推全图」，批量反推仍按加入卡片时固化的「纯服装」执行
3. 勾选「标签用中文（默认）」后仍出现英文标签（如 `menswear tweed herringbone overcoat`）

### 根因

| 反馈 | 根因 |
|---|---|
| 1 | `CONCURRENCY = 3` 是模块级常量，无 UI |
| 2 | `consumeBatch()` 在加入卡片时把 `it.mode = state.mode` 固化，之后切换档位不同步；`reasonAll` 未在触发前广播新档位 |
| 3 | `TAGS_INSTRUCTION.zh` 位置在 mode 模板末尾，被 `lang=en` 的英文语境冲淡；且 `normalize` 无兜底 |

### 修复

| 层 | 文件 | 关键改动 |
|---|---|---|
| Prompt | `server/prompts.js` | `TAGS_INSTRUCTION.zh` 强化：`"suggestedTags" 字段的取值必须是中文!!!` + 合法/非法示例；tagLang 段用 `===== TAGS LANGUAGE (independent of the prompt language) =====` 分割包裹，与 prompt 语言彻底解耦 |
| Provider | `cli.js` / `remote.js` | `normalize` 新增 `tagLang` 形参 + 60+ 词的英中兜底词表 `EN2ZH_TAG`（vintage→复古、tweed→粗花呢、herringbone→人字纹、menswear→男装 等）；`tagLang=zh` 时全英标签强制映射，映射不到直接丢弃（宁缺勿滥） |
| Server | 无变更 | 已有 `tagLang` 透传 |
| 侧边栏 | `sidepanel.html/.css/.js` | 批量区新增 `.batch-meta`：**当前档位提示 + 并发数下拉（1/2/3/5/8，localStorage 记忆）**；档位切换时 `updateBatchModeHint()` 同步；`reasonAll` 前把 `state.mode` **广播到所有非 saved 卡片**；单卡「反推」按钮触发前也同步一次；`reasonOne` 不再从 state.mode 读，而是用 `it.mode`（避免运行中切换档位造成错乱） |

### 关键设计取舍
- **兜底词表宁缺勿滥**：`tagLang=zh` 时匹配不到英中映射的标签**直接丢弃**（不放英文进结果污染中文体验）。宁可少几个标签，也不让中英混杂。
- **档位广播时机**：只在**触发反推的瞬间**（reasonAll 入口 / 单卡按钮 onclick）广播，避免"跟随档位实时变"造成用户预期错乱（已经反推完的卡片保持原档结果）。
- **并发数默认值**：3 保留为推荐值，本地 CLI 建议 ≤3（sonnet 冷启动占用 API 通道），远程 provider 可 5-8。

### 待用户手动（本轮工具无 shell）
1. 重启 server 使新 prompts.js 生效：`taskkill /F /IM node.exe && cd outputs/server && node server.js`
2. Chrome 扩展页**重载** `outputs/extension/`（sidepanel 的 html/css/js 都改了）
3. Git 提交 message：`fix: 并发数UI + 批量档位广播 + 中文标签兜底词表（M13）`

---

## 八·补2 · M14 中文原生模板 + 滚轮修复（2026-07-28 追加）✅

**根因定位（关键）**：用户反馈 M13 的"档位不生效 / 中文标签仍英文"——实测 `/health` 返回的 modes **缺 `full_scene`**，坐实是**上次改完 server 没重启，一直跑旧代码**（旧 prompts.js 无 full_scene 档 → 被兜底成纯服装模板；旧 cli.js 无中文词表）。重启后两者当场恢复正常。→ 教训写入长期记忆：**prompts.js/provider 改动后必须重启 server，否则全部白改**。

**架构升级（用户判断正确并采纳）**：原链路是「英文模板 → 模型吐英文标签 → EN2ZH_TAG 词表翻译」，翻译层不稳（覆盖不全丢标签、译法僵）。改为**双语原生模板**：
- `prompts.js` 拆出 `MODES_EN` + `MODES_ZH`（四档各一份原生中文指令）+ 中文 OUTPUT_CONTRACT；`buildInstruction` 按 lang 选模板，**默认 lang=zh**。
- 勾选中文 → 直接走中文模板，模型**原生产出中文 prompt + 中文标签**，省掉翻译层。标签策略：**模型自由产出中文**（不限受控词表）。
- EN2ZH_TAG 词表降级为纯兜底（仅模型偶尔吐英文时触发）。
- 默认值：`langZh` / `tagZh` 复选框**均默认勾选**（localStorage 键不存在时视为中文）。

**反馈4 修复（滚轮/拉伸回滚）**：`renderBatch` 全量重建拆成两级——`renderBatch`（结构变化时）+ `refreshCards`（反推中 tick 只更新状态文本/描边，**不重建 textarea/tags DOM**）→ 保住用户在提示词框里的滚动位置与手动拉伸高度。

**联调实测（女2 · full_scene · lang=zh · CLI）**：`HTTP 200 · 25s · category=female`；prompt 为一整段原生中文整场景描述（非服装清单）；标签 `["日系","森系","秋冬","大地色","格纹","复古","针织背心","文艺"]` 全中文原生产出（"森系/大地色/文艺"等词表根本没有，证明原生优于翻译）。

### 待用户手动
1. **重启 server**（prompts.js 改了必须重启）：`taskkill /F /IM node.exe && cd outputs/server && node server.js` —— 已由本轮自动完成，若关机重启则靠自启动脚本
2. Chrome 扩展页**重载** `outputs/extension/`（sidepanel html/js 都改了）
3. Git 提交：`feat: 中文原生模板(四档)+默认中文+批量提示词框滚轮修复（M14）`

---

## 八·补3 · M15 反推提示词一键复制/清除（2026-07-28）✅

- **单张反推区**：提示词框下加「复制提示词」+「清除提示词」，仅在有内容时可用。
- **批量卡片**：每张卡独立「复制提示词 / 清除提示词」。
- **批量区顶部**：「一键复制提示词」（拼接所有已反推卡片，每段带 `【#序号】` + 分隔线）+「一键清除提示词」（清空所有卡）。
- 复制走 `navigator.clipboard` + 隐藏 textarea `execCommand` 双兜底。命名统一为「复制提示词 / 清除提示词」。
- **已推 GitHub**：`azazlf09/clothing-asset-plugin`（Public）。Git `f7a5c80`。仓库名不能纯中文（会转成空 slug）；本仓库已 `git config --local http.proxy ""` 禁用代理直连。

## 八·补4 · M16 批量按钮排版 + 库内标签编辑 + 库内词+图复制（2026-07-29）✅

| # | 需求 | 实现 |
|---|---|---|
| 1 | 批量反推按钮竖排难点击、排版差 | `sidepanel.css`：`.batch-header` 改纵向（计数独占一行），`.batch-actions` 改 **2 列等宽网格**（`grid-template-columns:repeat(2,1fr)`），「一键反推」`grid-column:1/-1` 独占整行更醒目。按钮加大内边距（8px）触控友好。布局：反推(整行)→复制\|清除→保存\|加图→退出 |
| 2 | 资产库只能预览/搜索/复制，无法改标签 | `library.html/js/css`：详情弹窗标签区改**可编辑**——每个标签带 `×` 删除，下方加输入框回车添加；`addTag/removeTag → CloDB.put` 写回 IndexedDB 并同步 ALL + `refresh()` 刷新导航。用 `currentItem` 引用当前打开项 |
| 3 | 库里无法同时复制提示词+图片 | 详情弹窗加「复制全部提示词」+「提示词+图片」两个按钮；`joinPrompts(it)` 拼接多档位（带档位标注）；复用已有 `copyWordImg`（ClipboardItem 图文一起写，失败降级只复制文字）。列表卡片原有「词+图」保留 |

**纯前端改动**（HTML/CSS/JS），不涉及 server，`node --check` 语法通过。待用户重载 `outputs/extension/` 验证。

---

## 八·补5 · M17 库内词+图复制修复 + 标签多选排除筛选（2026-07-30）✅

| # | 反馈 | 根因 | 实现 |
|---|---|---|---|
| 1 | 库里「提示词+图片」总弹「图片复制不支持，已复制提示词」 | `copyWordImg` 直接把 `data:` 图 `fetch` 成 blob 塞进 `ClipboardItem`，Chrome 剪贴板只稳定接受 **image/png**，jpeg/webp/污染的 blob 类型都会被拒 → 落到 catch | 新增 `imageToPngBlob()`：用 `Image`+`canvas` 把任意图统一重绘成 **PNG blob** 再写 `ClipboardItem({image/png, text/plain})`；失败才降级只复制提示词 |
| 2 | 库需 Eagle 式标签筛选：多选 + 排除 | 原 `filter.tag` 是单选字符串 | 改 `filter.tagsInclude/tagsExclude`（两个 `Set`）。标签点击循环 **无→包含(蓝＋)→排除(红－划线)→无**（`cycleTag`）；`apply()` 包含=全命中 AND、排除=任一命中即淘汰；加「清除标签筛选（N）」按钮；面包屑显示 `#含 / -排`；切视图清空筛选 |

**纯前端改动**（library.html/js/css），`node --check` 通过。待用户重载 `outputs/extension/` 验证。

---

## 九、工作约定（本项目）

- 本文件为唯一追踪源，**每次推进后立即更新第七节进度表 + 相关章节**。
- 修改前先读全文件；UI 改动必须真实跑一次验证。
- 反推 schema 与分面词表未定稿前，不写依赖它们的上层代码。

&nbsp;