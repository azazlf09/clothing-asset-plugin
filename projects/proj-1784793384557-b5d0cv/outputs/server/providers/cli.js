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
    const tagLang = opts.tagLang === "en" ? "en" : "zh"; // 默认中文
    const instruction = buildInstruction(mode, imgPath, lang, tagLang);
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
      resolve(normalize(json, mode, tagLang));
    });

    child.stdin.write(instruction);
    child.stdin.end();
  });
}

// 常见英中兜底词表:tagLang=zh 时若模型仍吐英文,尽量映射成中文,匹配不到的整条丢弃
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
// 判断整串是否纯英文(不含 CJK)
function isPureEn(s) { return !/[一-龥]/.test(String(s)); }

function normalize(json, mode, tagLang) {
  let tags = Array.isArray(json.suggestedTags)
    ? json.suggestedTags.map((t) => String(t).trim()).filter(Boolean)
    : [];
  if (tagLang === "zh") {
    // 兜底:把纯英文标签尽量映射成中文,映射不到就丢弃(不放英文进结果污染中文体验)
    tags = tags
      .map((t) => {
        if (!isPureEn(t)) return t; // 已经含中文,直接留
        const key = t.toLowerCase().replace(/[-_\s]/g, "");
        return EN2ZH_TAG[key] || null;
      })
      .filter(Boolean);
  } else {
    // 英文标签统一小写
    tags = tags.map((t) => t.toLowerCase());
  }
  // 去重 + 截断 8 个
  tags = Array.from(new Set(tags)).slice(0, 8);
  return {
    mode: json.mode || mode || "clothing_only",
    category: json.category === "male" ? "male" : "female",
    prompt: String(json.prompt || "").trim(),
    suggestedTags: tags,
  };
}

module.exports = { reason };
