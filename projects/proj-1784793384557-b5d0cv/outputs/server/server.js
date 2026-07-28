// 服装资产库 · 本地反推适配层 server
// 统一端点 /reason，按 config.provider 分发到 cli / openai / anthropic / gemini。
// 零第三方依赖（Node18 内置 http/fetch/child_process）。
const http = require("http");
const fs = require("fs");
const path = require("path");
const cli = require("./providers/cli");
const remote = require("./providers/remote");
const { MODE_KEYS } = require("./prompts");

const CONFIG_PATH = path.join(__dirname, "config.json");

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return { provider: "cli", port: 8787, cli: {} };
  }
}
function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

async function runReason(cfg, imageBase64, mode, lang, tagLang) {
  const provider = cfg.provider || "cli";
  const opts = { lang, tagLang };
  if (provider === "cli") return cli.reason(imageBase64, mode, { ...(cfg.cli || {}), ...opts });
  if (provider === "openai") return remote.openai(imageBase64, mode, { ...(cfg.openai || {}), ...opts });
  if (provider === "anthropic") return remote.anthropic(imageBase64, mode, { ...(cfg.anthropic || {}), ...opts });
  if (provider === "gemini") return remote.gemini(imageBase64, mode, { ...(cfg.gemini || {}), ...opts });
  throw new Error("未知 provider: " + provider);
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
function sendJson(res, code, obj) {
  cors(res);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 25 * 1024 * 1024) { reject(new Error("请求体过大")); req.destroy(); }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") { cors(res); res.writeHead(204); return res.end(); }

  // 健康检查 + 当前 provider（不含密钥）
  if (req.method === "GET" && req.url === "/health") {
    const cfg = loadConfig();
    return sendJson(res, 200, { ok: true, provider: cfg.provider, modes: MODE_KEYS });
  }

  // 读配置（隐藏 apiKey）
  if (req.method === "GET" && req.url === "/config") {
    const cfg = loadConfig();
    const safe = JSON.parse(JSON.stringify(cfg));
    ["openai", "anthropic", "gemini"].forEach((k) => {
      if (safe[k] && safe[k].apiKey) safe[k].apiKey = "***";
    });
    return sendJson(res, 200, safe);
  }

  // 写配置（插件设置页调用）
  if (req.method === "POST" && req.url === "/config") {
    try {
      const body = JSON.parse(await readBody(req));
      const cur = loadConfig();
      const next = { ...cur, ...body };
      // apiKey 为 *** 时保留原值，避免被掩码覆盖
      ["openai", "anthropic", "gemini"].forEach((k) => {
        if (next[k] && next[k].apiKey === "***" && cur[k]) next[k].apiKey = cur[k].apiKey;
      });
      saveConfig(next);
      return sendJson(res, 200, { ok: true });
    } catch (e) {
      return sendJson(res, 400, { ok: false, error: e.message });
    }
  }

  // 反推
  if (req.method === "POST" && req.url === "/reason") {
    try {
      const body = JSON.parse(await readBody(req));
      const mode = MODE_KEYS.includes(body.mode) ? body.mode : "clothing_only";
      const lang = body.lang === "zh" ? "zh" : "en";
      const tagLang = body.tagLang === "en" ? "en" : "zh"; // 默认中文
      if (!body.imageBase64) return sendJson(res, 400, { ok: false, error: "缺少 imageBase64" });
      const cfg = loadConfig();
      const t0 = Date.now();
      const result = await runReason(cfg, body.imageBase64, mode, lang, tagLang);
      return sendJson(res, 200, { ok: true, provider: cfg.provider, tookMs: Date.now() - t0, ...result });
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: e.message });
    }
  }

  sendJson(res, 404, { ok: false, error: "not found" });
});

const cfg = loadConfig();
const PORT = process.env.PORT || cfg.port || 8787;
server.listen(PORT, "127.0.0.1", () => {
  console.log(`[服装资产库] 反推 server 已启动: http://127.0.0.1:${PORT}`);
  console.log(`[服装资产库] 当前 provider = ${cfg.provider}  可用模式 = ${MODE_KEYS.join(", ")}`);
});
