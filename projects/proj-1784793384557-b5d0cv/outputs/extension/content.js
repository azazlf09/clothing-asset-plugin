// 常驻内容脚本：① 悬浮可拖动按钮唤起侧边栏 ② 图片悬停反推小框 ③ 点选取图模式
(() => {
  if (window.__cloInit) return;
  window.__cloInit = true;

  const HL = "__clo_highlight__";
  const style = document.createElement("style");
  style.textContent = `
  .${HL}{outline:3px solid #4f46e5 !important;outline-offset:2px !important;cursor:crosshair !important;}
  #__clo_tip{position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#4f46e5;color:#fff;padding:6px 14px;border-radius:20px;font:13px/1.4 system-ui;box-shadow:0 4px 12px rgba(0,0,0,.25);pointer-events:none;}
  #__clo_fab{position:fixed;right:0;top:45%;z-index:2147483646;width:38px;height:46px;
    background:linear-gradient(135deg,#4f46e5,#6d28d9);color:#fff;border-radius:12px 0 0 12px;
    display:flex;align-items:center;justify-content:center;cursor:grab;opacity:.55;
    box-shadow:-2px 2px 12px rgba(0,0,0,.22);transition:opacity .18s,transform .18s;
    font:600 11px/1 system-ui;user-select:none;touch-action:none;}
  #__clo_fab:hover{opacity:1;transform:scale(1.06)}
  #__clo_fab.left{right:auto;left:0;border-radius:0 12px 12px 0;box-shadow:2px 2px 12px rgba(0,0,0,.22)}
  #__clo_fab.dragging{opacity:1;cursor:grabbing;transition:none}
  #__clo_fab svg{width:20px;height:20px;pointer-events:none}
  #__clo_chip{position:fixed;z-index:2147483645;background:rgba(79,70,229,.96);color:#fff;
    padding:6px 11px;border-radius:16px;font:600 12px/1 system-ui;cursor:pointer;
    box-shadow:0 3px 12px rgba(0,0,0,.28);display:none;align-items:center;gap:5px;
    backdrop-filter:blur(4px);white-space:nowrap;}
  #__clo_chip:hover{background:#4f46e5}
  #__clo_chip svg{width:14px;height:14px}
  `;
  document.documentElement.appendChild(style);

  const SHIRT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/></svg>';

  // ---------- ① 悬浮可拖动按钮 ----------
  const fab = document.createElement("div");
  fab.id = "__clo_fab";
  fab.title = "服装资产库 · 点击唤起侧边栏（可拖动）";
  fab.innerHTML = SHIRT;
  const saved = loadFabPos();
  applyFabPos(saved);
  document.documentElement.appendChild(fab);

  function loadFabPos() {
    try { return JSON.parse(localStorage.getItem("__clo_fab_pos") || "null") || { edge: "right", topPct: 45 }; }
    catch { return { edge: "right", topPct: 45 }; }
  }
  function saveFabPos(p) { try { localStorage.setItem("__clo_fab_pos", JSON.stringify(p)); } catch {} }
  function applyFabPos(p) {
    fab.classList.toggle("left", p.edge === "left");
    fab.style.top = Math.max(2, Math.min(92, p.topPct)) + "%";
  }

  let dragging = false, moved = false, startY = 0, startX = 0;
  fab.addEventListener("pointerdown", (e) => {
    dragging = true; moved = false; startY = e.clientY; startX = e.clientX;
    fab.setPointerCapture(e.pointerId);
    fab.classList.add("dragging");
  });
  fab.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    if (Math.abs(e.clientY - startY) > 4 || Math.abs(e.clientX - startX) > 4) moved = true;
    if (moved) {
      const topPct = (e.clientY / window.innerHeight) * 100;
      const edge = e.clientX > window.innerWidth / 2 ? "right" : "left";
      fab.classList.toggle("left", edge === "left");
      fab.style.top = Math.max(2, Math.min(92, topPct)) + "%";
    }
  });
  fab.addEventListener("pointerup", (e) => {
    if (!dragging) return;
    dragging = false;
    fab.classList.remove("dragging");
    try { fab.releasePointerCapture(e.pointerId); } catch {}
    if (moved) {
      const edge = fab.classList.contains("left") ? "left" : "right";
      const topPct = parseFloat(fab.style.top) || 45;
      saveFabPos({ edge, topPct });
    } else {
      // 视为点击 → 唤起侧边栏
      chrome.runtime.sendMessage({ type: "open-panel" });
    }
  });

  // ---------- ② 图片悬停反推小框 ----------
  const chip = document.createElement("div");
  chip.id = "__clo_chip";
  chip.innerHTML = SHIRT + "<span>反推服装</span>";
  document.documentElement.appendChild(chip);
  let chipTarget = null, hideTimer = null;

  function eligibleImg(el) {
    if (!el || el.tagName !== "IMG") return null;
    const r = el.getBoundingClientRect();
    if (r.width < 100 || r.height < 100) return null; // 过滤图标/头像
    return r;
  }
  function positionChip(r) {
    chip.style.display = "flex";
    const top = Math.max(6, r.top + 8);
    const left = Math.max(6, Math.min(r.left + 8, window.innerWidth - 110));
    chip.style.top = top + "px";
    chip.style.left = left + "px";
  }
  function scheduleHide() { clearTimeout(hideTimer); hideTimer = setTimeout(() => { chip.style.display = "none"; chipTarget = null; }, 160); }

  document.addEventListener("mouseover", (e) => {
    if (picking) return;
    const r = eligibleImg(e.target);
    if (r) { clearTimeout(hideTimer); chipTarget = e.target; positionChip(r); }
  }, true);
  document.addEventListener("mouseout", (e) => {
    if (picking) return;
    if (e.target === chipTarget && e.relatedTarget !== chip) scheduleHide();
  }, true);
  chip.addEventListener("mouseenter", () => clearTimeout(hideTimer));
  chip.addEventListener("mouseleave", scheduleHide);
  chip.addEventListener("click", (e) => {
    e.preventDefault(); e.stopPropagation();
    if (!chipTarget) return;
    captureImage(chipTarget, true);
    chip.style.display = "none";
  });

  // ---------- ③ 点选取图模式（供侧边栏「从页面选图」） ----------
  let picking = false, hovered = null, tip = null;
  function cleanupPick() {
    picking = false;
    if (hovered) hovered.classList.remove(HL);
    hovered = null;
    if (tip) { tip.remove(); tip = null; }
    document.removeEventListener("mouseover", onPickOver, true);
    document.removeEventListener("click", onPickClick, true);
    document.removeEventListener("keydown", onPickKey, true);
  }
  function onPickOver(e) {
    const img = e.target.closest && e.target.closest("img");
    if (hovered && hovered !== img) hovered.classList.remove(HL);
    if (img) { hovered = img; img.classList.add(HL); }
  }
  function onPickKey(e) { if (e.key === "Escape") cleanupPick(); }
  function onPickClick(e) {
    const img = e.target.closest && e.target.closest("img");
    if (!img) return;
    e.preventDefault(); e.stopPropagation();
    captureImage(img, false);
    cleanupPick();
  }

  // ---------- 通用：取图并上报 ----------
  function captureImage(img, open) {
    const srcUrl = img.currentSrc || img.src || "";
    let dataUrl = "";
    try {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth || img.width;
      c.height = img.naturalHeight || img.height;
      c.getContext("2d").drawImage(img, 0, 0);
      dataUrl = c.toDataURL("image/png"); // 跨域会抛 SecurityError
    } catch (err) {
      dataUrl = ""; // 回退：侧边栏用 srcUrl 去 fetch
    }
    chrome.runtime.sendMessage({ type: "picked-image", dataUrl, srcUrl, pageUrl: location.href, open: !!open });
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "pick-mode-on" && !picking) {
      picking = true;
      chip.style.display = "none";
      tip = document.createElement("div");
      tip.id = "__clo_tip";
      tip.textContent = "点选模式：点击一张图片保存 · Esc 取消";
      document.body.appendChild(tip);
      document.addEventListener("mouseover", onPickOver, true);
      document.addEventListener("click", onPickClick, true);
      document.addEventListener("keydown", onPickKey, true);
    }
  });
})();
