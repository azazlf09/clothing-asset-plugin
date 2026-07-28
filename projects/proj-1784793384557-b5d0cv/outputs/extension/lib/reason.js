// 调用本地反推 server。全局 window.CloReason
(() => {
  const BASE = "http://127.0.0.1:8787";

  async function health() {
    try {
      const r = await fetch(BASE + "/health", { cache: "no-store" });
      return await r.json();
    } catch (e) {
      return { ok: false, error: "server 未启动" };
    }
  }

  // imageBase64: 纯 base64 或 dataURL 都可（server 会剥离前缀）；lang: prompt 语言 "en"|"zh"；tagLang: 标签语言 "en"|"zh"(默认 zh)
  async function reason(imageBase64, mode, lang, tagLang) {
    const r = await fetch(BASE + "/reason", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageBase64,
        mode,
        lang: lang === "zh" ? "zh" : "en",
        tagLang: tagLang === "en" ? "en" : "zh",
      }),
    });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || "反推失败");
    return j;
  }

  async function getConfig() {
    const r = await fetch(BASE + "/config", { cache: "no-store" });
    return await r.json();
  }
  async function setConfig(cfg) {
    const r = await fetch(BASE + "/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cfg),
    });
    return await r.json();
  }

  // 工具：URL → dataURL（用于右键/回退取图）
  async function urlToDataUrl(url) {
    const resp = await fetch(url);
    const blob = await resp.blob();
    return await new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = rej;
      fr.readAsDataURL(blob);
    });
  }

  // 工具：dataURL 生成缩略图 dataURL
  function makeThumb(dataUrl, max = 400) {
    return new Promise((res) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        res(c.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = () => res(dataUrl);
      img.src = dataUrl;
    });
  }

  window.CloReason = { health, reason, getConfig, setConfig, urlToDataUrl, makeThumb, BASE };
})();
