// Provider: 本地 Claude Code CLI —— 通过 stdin 传 prompt(零命令行注入)，让 claude Read 临时图片
const { spawn } = require("child_process");
const os = require("os");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { buildInstruction } = require("../prompts");

// 把 dataURL / 纯 base64 写成临时 png，返回路径
function writeTempImage(imageBase64) {
  const b64 = String(imageBase64).replace(/^data:image\/\w+;base64,/, "");
  const buf = Buffer.from(b64, "base64");
  const name = "clo_" + crypto.randomBytes(6).toString("hex") + ".png";
  const p = path.join(os.tmpdir(), name);
  fs.writeFileSync(p, buf);
  return p;
}

function extractJson(text) {
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s === -1 || e === -1 || e < s) return null;
  try {
    return JSON.parse(text.slice(s, e + 1));
  } catch {
    return null;
  }
}

// opts: { model?, timeoutMs? }
function reason(imageBase64, mode, opts = {}) {
  return new Promise((resolve, reject) => {
    let imgPath;
    try {
      imgPath = writeTempImage(imageBase64);
    } catch (e) {
      return reject(new Error("写入临时图片失败: " + e.message));
    }

    const lang = opts.lang === "zh" ? "zh" : "en";
    const instruction = buildInstruction(mode, imgPath, lang);
    // 提速关键：--strict-mcp-config 跳过所有 MCP 服务器加载；默认走 sonnet(比 opus 快数倍且视觉够用)
    const args = ["-p", "--allowedTools", "Read", "--strict-mcp-config"];
    args.push("--model", opts.model || "sonnet");

    // Windows 下 claude 是 shim，shell:true；prompt 走 stdin 不进命令行
    const child = spawn("claude", args, {
      shell: true,
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    const timeoutMs = opts.timeoutMs || 180000;
    const timer = setTimeout(() => {
      child.kill();
      cleanup();
      reject(new Error("CLI 反推超时"));
    }, timeoutMs);

    function cleanup() {
      try { fs.unlinkSync(imgPath); } catch {}
    }

    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (err) => {
      clearTimeout(timer);
      cleanup();
      reject(new Error("无法启动 claude CLI: " + err.message));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      cleanup();
      const json = extractJson(stdout);
      if (!json) {
        return reject(
          new Error(
            "CLI 未返回有效 JSON (code=" + code + "): " +
              (stderr || stdout).slice(0, 300)
          )
        );
      }
      resolve(normalize(json, mode));
    });

    child.stdin.write(instruction);
    child.stdin.end();
  });
}

function normalize(json, mode) {
  return {
    mode: json.mode || mode || "clothing_only",
    category: json.category === "male" ? "male" : "female",
    prompt: String(json.prompt || "").trim(),
    suggestedTags: Array.isArray(json.suggestedTags)
      ? json.suggestedTags.map((t) => String(t).toLowerCase().trim()).filter(Boolean).slice(0, 8)
      : [],
  };
}

module.exports = { reason };
