// 调用本地反推 server。全局 window.CloReason
(() => {
  const BASE = "http://127.0.0.1:8787";

  // 带超时的 fetch：server 半死不活(端口占用但不响应)时不会永久挂起 → 避免侧边栏永久转圈
  async function fetchTimeout(url, opts = {}, timeoutMs = 8000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      return await fetch(url, { ...opts, signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  async function health() {
    try {
      // 短超时：server 没起或僵死时 4s 内返回 false，让横条尽快弹出
      const r = await fetchTimeout(BASE + "/health", { cache: "no-store" }, 4000);
      return await r.json();
    } catch (e) {
      return { ok: false, error: e.name === "AbortError" ? "server 无响应(超时)" : "server 未启动" };
    }
  }

  // imageBase64: 纯 base64 或 dataURL 都可（server 会剥离前缀）；lang: prompt 语言 "en"|"zh"；tagLang: 标签语言 "en"|"zh"(默认 zh)
  async function reason(imageBase64, mode, lang, tagLang) {
    let r;
    try {
      // 长超时(200s)：覆盖本地 CLI 首次冷启动；仍设上限避免永久转圈
      r = await fetchTimeout(BASE + "/reason", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64,
          mode,
          lang: lang === "zh" ? "zh" : "en",
          tagLang: tagLang === "en" ? "en" : "zh",
        }),
      }, 200000);
    } catch (e) {
      if (e.name === "AbortError") throw new Error("反推超时(>200s)，本地服务可能未启动或 CLI 卡住");
      throw new Error("连不上本地反推服务(127.0.0.1:8787)，请确认服务已启动");
    }
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || "反推失败");
    return j;
  }

  async function getConfig() {
    const r = await fetchTimeout(BASE + "/config", { cache: "no-store" }, 4000);
    return await r.json();
  }
  async function setConfig(cfg) {
    const r = await fetchTimeout(BASE + "/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cfg),
    }, 8000);
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
