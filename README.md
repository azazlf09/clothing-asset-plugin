# 服装资产库浏览器插件

看到好看的穿搭 → 一键存进资产库 → 自动反推服装提示词。

## 项目结构

```
服装资产库插件/
├── PROJECT.md                          # 项目追踪文档（进度 / 决策 / 里程碑）
├── projects/proj-*/outputs/
│   ├── PROMPT_SPEC.md                  # 三档反推提示词规范
│   ├── server/                         # 本地反推适配层（Node HTTP）
│   │   ├── server.js                   # 入口
│   │   ├── prompts.js                  # 三档提示词 + 中英切换
│   │   ├── providers/                  # cli / remote(openai/anthropic/gemini)
│   │   └── config.json
│   └── extension/                      # Chrome MV3 扩展
│       ├── manifest.json
│       ├── background.js               # Service Worker
│       ├── content.js                  # 悬浮按钮 + 图片悬停反推
│       ├── sidepanel.*                 # 侧边栏
│       ├── library.*                   # 资产库
│       └── lib/ (db.js, reason.js)
```

## 快速启动

**1. 启动本地反推 server**
```bash
cd projects/proj-1784793384557-b5d0cv/outputs/server
node server.js
```
默认监听 `127.0.0.1:8787`，provider=cli（走本地 claude CLI）。

**2. 加载扩展**
Chrome 扩展页 → 加载已解压的扩展程序 → 选择：
```
projects/proj-1784793384557-b5d0cv/outputs/extension/
```

**3. 使用**
- 右侧紫色衣架悬浮按钮 → 唤起侧边栏
- 鼠标悬停网页图片 → 出现「👕 反推服装」小框，点击即送入侧边栏
- `Alt+Shift+S` 快捷键（可被其他扩展占用，去 `chrome://extensions/shortcuts` 改）
- 侧边栏勾选「输出纯中文提示词」→ 反推结果切中文

## 三档反推模式

| 档 | mode | 用途 |
|---|---|---|
| A | `clothing_only` | 纯服装（默认，忽略人物/场景） |
| B | `with_model` | 带真人模特 + 白底棚拍 |
| C | `ghost_mannequin` | 透明亚克力隐形模特 |

## 详细文档

- 里程碑与决策记录：[`PROJECT.md`](PROJECT.md)
- 反推提示词规范：[`projects/proj-1784793384557-b5d0cv/outputs/PROMPT_SPEC.md`](projects/proj-1784793384557-b5d0cv/outputs/PROMPT_SPEC.md)
