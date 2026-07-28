// 常驻内容脚本：① 悬浮可拖动按钮（带批量徽章） ② 图片悬停"+加入批量"框 ③ 单选取图 ④ 多选取图
(() => {
  if (window.__cloInit) return;
  window.__cloInit = true;

  const HL = "__clo_highlight__";
  const PICKED = "__clo_picked__";
  const style = document.createElement("style");
  style.textContent = `
  .${HL}{outline:3px solid #4f46e5 !important;outline-offset:2px !important;cursor:crosshair !important;}
  .${PICKED}{outline:3px solid #10b981 !important;outline-offset:2px !important;position:relative;}
  #__clo_tip{position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#4f46e5;color:#fff;padding:8px 16px;border-radius:20px;font:13px/1.4 system-ui;box-shadow:0 4px 12px rgba(0,0,0,.25);display:flex;align-items:center;gap:10px;}
  #__clo_tip .cnt{background:#10b981;padding:2px 8px;border-radius:10px;font-weight:600;}
  #__clo_tip button{background:#fff;color:#4f46e5;border:none;padding:4px 10px;border-radius:10px;font:600 12px/1 system-ui;cursor:pointer;}
  #__clo_tip button.ghost{background:transparent;color:#fff;border:1px solid #fff;}
  #__clo_fab{position:fixed;right:0;top:45%;z-index:2147483646;width:38px;height:46px;
    background:linear-gradient(135deg,#4f46e5,#6d28d9);color:#fff;border-radius:12px 0 0 12px;
    display:flex;align-items:center;justify-content:center;cursor:grab;opacity:.55;
    box-shadow:-2px 2px 12px rgba(0,0,0,.22);transition:opacity .18s,transform .18s;
    font:600 11px/1 system-ui;user-select:none;touch-action:none;}
  #__clo_fab:hover{opacity:1;transform:scale(1.06)}
  #__clo_fab.left{right:auto;left:0;border-radius:0 12px 12px 0;box-shadow:2px 2px 12px rgba(0,0,0,.22)}
  #__clo_fab.dragging{opacity:1;cursor:grabbing;transition:none}
  #__clo_fab svg{width:20px;height:20px;pointer-events:none}
  #__clo_fab .badge{position:absolute;top:-6px;left:-6px;min-width:18px;height:18px;
    background:#10b981;color:#fff;border-radius:10px;font:700 11px/18px system-ui;
    text-align:center;padding:0 5px;box-shadow:0 2px 6px rgba(0,0,0,.35);display:none;}
  #__clo_fab.left .badge{left:auto;right:-6px}
  #__clo_fab .badge.show{display:block}
  #__clo_chip{position:fixed;z-index:2147483645;background:rgba(79,70,229,.96);color:#fff;
    padding:7px 12px;border-radius:18px;font:600 12px/1 system-ui;cursor:pointer;
    box-shadow:0 4px 14px rgba(0,0,0,.32);display:none;align-items:center;gap:6px;
    backdrop-filter:blur(4px);white-space:nowrap;pointer-events:auto;
    transition:transform .12s,background .12s;}
  #__clo_chip:hover{background:#4f46e5;transform:scale(1.04)}
  #__clo_chip.ok{background:#10b981}
  #__clo_chip svg{width:14px;height:14px}
  `;
  document.documentElement.appendChild(style);

  const SHIRT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/></svg>';

  // ---------- ① 悬浮可拖动按钮（带批量徽章）----------
  const fab = document.createElement("div");
  fab.id = "__clo_fab";
  fab.title = "服装资产库 · 点击唤起侧边栏（可拖动）";
  fab.innerHTML = SHIRT + '<span class="badge" id="__clo_badge">0</span>';
  const saved = loadFabPos();
  applyFabPos(saved);
  document.documentElement.appendChild(fab);
  const badge = fab.querySelector(".badge");
  refreshBadge();

  function loadFabPos() {
    try { return JSON.parse(localStorage.getItem("__clo_fab_pos") || "null") || { edge: "right", topPct: 45 }; }
    catch { return { edge: "right", topPct: 45 }; }
  }
  function saveFabPos(p) { try { localStorage.setItem("__clo_fab_pos", JSON.stringify(p)); } catch {} }
  function applyFabPos(p) {
    fab.classList.toggle("left", p.edge === "left");
    fab.style.top = Math.max(2, Math.min(92, p.topPct)) + "%";
  }
  async function refreshBadge() {
    try {
      const { pendingBatch } = await chrome.storage.session.get("pendingBatch");
      const n = (pendingBatch && pendingBatch.items && pendingBatch.items.length) || 0;
      if (n > 0) { badge.textContent = String(n); badge.classList.add("show"); }
      else badge.classList.remove("show");
    } catch {}
  }
  chrome.storage.onChanged.addListener((c, area) => {
    if (area === "session" && c.pendingBatch) refreshBadge();
  });

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
      chrome.runtime.sendMessage({ type: "open-panel" });
    }
  });

  // ---------- ② 图片悬停"+加入批量"框 ----------
  const chip = document.createElement("div");
  chip.id = "__clo_chip";
  chip.innerHTML = SHIRT + '<span id="__clo_chip_txt">+ 加入批量</span>';
  document.documentElement.appendChild(chip);
  const chipTxt = chip.querySelector("#__clo_chip_txt");
  let chipTarget = null, hideTimer = null;

  function eligibleImg(el) {
    if (!el || el.tagName !== "IMG") return null;
    const r = el.getBoundingClientRect();
    if (r.width < 100 || r.height < 100) return null;
    return r;
  }
  // chip 定位到图片外部左上角（避免覆盖图片触发 mouseout / 挡视线）
  function positionChip(r) {
    chip.style.display = "flex";
    const chipH = 30; // 大致高度
    let top = r.top - chipH - 6;
    let left = r.left;
    // 上方放不下就贴左上角内部
    if (top < 6) top = r.top + 6;
    if (left < 6) left = 6;
    if (left > window.innerWidth - 120) left = window.innerWidth - 120;
    chip.style.top = top + "px";
    chip.style.left = left + "px";
  }
  function scheduleHide() {
    clearTimeout(hideTimer);
    // 300ms 缓冲：给鼠标从图片移动到 chip 的时间
    hideTimer = setTimeout(() => {
      chip.style.display = "none";
      chip.classList.remove("ok");
      chipTxt.textContent = "+ 加入批量";
      chipTarget = null;
    }, 300);
  }

  document.addEventListener("mouseover", (e) => {
    if (picking || multiPicking) return;
    const r = eligibleImg(e.target);
    if (r) { clearTimeout(hideTimer); chipTarget = e.target; positionChip(r); }
  }, true);
  document.addEventListener("mouseout", (e) => {
    if (picking || multiPicking) return;
    if (e.target === chipTarget && e.relatedTarget !== chip && !(e.relatedTarget && chip.contains(e.relatedTarget))) scheduleHide();
  }, true);
  chip.addEventListener("mouseenter", () => clearTimeout(hideTimer));
  chip.addEventListener("mouseleave", scheduleHide);
  // 滚动/resize 时若 chip 显示中，同步跟随目标位置
  const followTarget = () => {
    if (chip.style.display !== "flex" || !chipTarget) return;
    const r = chipTarget.getBoundingClientRect();
    if (r.width < 100 || r.height < 100) { chip.style.display = "none"; return; }
    positionChip(r);
  };
  window.addEventListener("scroll", followTarget, true);
  window.addEventListener("resize", followTarget);

  chip.addEventListener("click", async (e) => {
    e.preventDefault(); e.stopPropagation();
    if (!chipTarget) return;
    const one = extractOne(chipTarget);
    chrome.runtime.sendMessage({
      type: "add-to-batch",
      item: one,
      pageUrl: location.href,
    }, (resp) => {
      const n = (resp && resp.count) || 0;
      chip.classList.add("ok");
      chipTxt.textContent = `已加入 ✓（共 ${n} 张）`;
      // 1.2s 后恢复可再点
      setTimeout(() => {
        chip.classList.remove("ok");
        chipTxt.textContent = "+ 加入批量";
      }, 1200);
    });
  });

  // ---------- ③ 单选取图模式 ----------
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
    captureImage(img, true);
    cleanupPick();
  }

  // ---------- ④ 多选批量取图模式 ----------
  let multiPicking = false, multiPicked = [], multiTip = null, multiCntEl = null;

  function startMulti() {
    if (multiPicking) return;
    multiPicking = true;
    multiPicked = [];
    chip.style.display = "none";
    multiTip = document.createElement("div");
    multiTip.id = "__clo_tip";
    multiTip.innerHTML = `<span>多选模式：点图勾选/取消</span><span class="cnt">已选 <b id="__clo_cnt">0</b> 张</span><button id="__clo_done">完成</button><button id="__clo_cancel" class="ghost">取消 · Esc</button>`;
    document.body.appendChild(multiTip);
    multiCntEl = document.getElementById("__clo_cnt");
    document.getElementById("__clo_done").onclick = finishMulti;
    document.getElementById("__clo_cancel").onclick = cancelMulti;
    document.addEventListener("mouseover", onMultiOver, true);
    document.addEventListener("click", onMultiClick, true);
    document.addEventListener("keydown", onMultiKey, true);
  }
  function onMultiOver(e) {
    const img = e.target.closest && e.target.closest("img");
    if (!img) return;
    if (img.classList.contains(PICKED)) return;
    img.classList.add(HL);
    img.addEventListener("mouseleave", () => img.classList.remove(HL), { once: true });
  }
  function onMultiKey(e) { if (e.key === "Escape") cancelMulti(); if (e.key === "Enter") finishMulti(); }
  function onMultiClick(e) {
    const img = e.target.closest && e.target.closest("img");
    if (!img) return;
    e.preventDefault(); e.stopPropagation();
    const idx = multiPicked.indexOf(img);
    if (idx >= 0) {
      multiPicked.splice(idx, 1);
      img.classList.remove(PICKED);
    } else {
      const r = img.getBoundingClientRect();
      if (r.width < 60 || r.height < 60) return; // 过滤图标
      multiPicked.push(img);
      img.classList.remove(HL);
      img.classList.add(PICKED);
    }
    if (multiCntEl) multiCntEl.textContent = String(multiPicked.length);
  }
  function cleanupMulti() {
    multiPicking = false;
    multiPicked.forEach((img) => img.classList.remove(PICKED, HL));
    multiPicked = [];
    if (multiTip) { multiTip.remove(); multiTip = null; }
    document.removeEventListener("mouseover", onMultiOver, true);
    document.removeEventListener("click", onMultiClick, true);
    document.removeEventListener("keydown", onMultiKey, true);
  }
  function cancelMulti() { cleanupMulti(); }
  function finishMulti() {
    if (!multiPicked.length) { cleanupMulti(); return; }
    const items = multiPicked.map((img) => extractOne(img));
    chrome.runtime.sendMessage({ type: "picked-batch", items, pageUrl: location.href });
    cleanupMulti();
  }

  // ---------- 通用：取图 ----------
  function extractOne(img) {
    const srcUrl = img.currentSrc || img.src || "";
    let dataUrl = "";
    try {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth || img.width;
      c.height = img.naturalHeight || img.height;
      c.getContext("2d").drawImage(img, 0, 0);
      dataUrl = c.toDataURL("image/png");
    } catch { dataUrl = ""; }
    return { dataUrl, srcUrl };
  }
  function captureImage(img, open) {
    const o = extractOne(img);
    chrome.runtime.sendMessage({ type: "picked-image", dataUrl: o.dataUrl, srcUrl: o.srcUrl, pageUrl: location.href, open: !!open });
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "pick-mode-on" && !picking && !multiPicking) {
      picking = true;
      chip.style.display = "none";
      tip = document.createElement("div");
      tip.id = "__clo_tip";
      tip.textContent = "点选模式：点击一张图片保存 · Esc 取消";
      document.body.appendChild(tip);
      document.addEventListener("mouseover", onPickOver, true);
      document.addEventListener("click", onPickClick, true);
      document.addEventListener("keydown", onPickKey, true);
    } else if (msg.type === "multi-pick-on" && !picking && !multiPicking) {
      startMulti();
    }
  });
})();
