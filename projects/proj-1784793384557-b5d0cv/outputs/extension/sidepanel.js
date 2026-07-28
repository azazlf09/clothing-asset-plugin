// 侧边栏逻辑：单张 + 批量
const $ = (id) => document.getElementById(id);
const state = { image: "", srcUrl: "", pageUrl: "", mode: "clothing_only", chosen: [], suggested: [] };
const DEFAULT_CATS = [{ value: "female", label: "女装" }, { value: "male", label: "男装" }];
const MODE_LABEL = { clothing_only: "纯服装", with_model: "带模特", ghost_mannequin: "假人展示", full_scene: "反推全图" };
function getConcurrency() {
  const el = document.getElementById("batchConc");
  const n = el ? parseInt(el.value, 10) : 3;
  return Number.isFinite(n) && n > 0 ? n : 3;
}

// 批量态
const batch = {
  active: false,
  items: [], // { id, image, srcUrl, pageUrl, mode, lang, status, prompt, category, categoryLabel, tags, suggested, chosen, tookMs, error, saved }
  seq: 0,
};

init();
async function init() {
  await checkServer();
  await loadCategories();
  await consumePending();
  await consumeBatch();
  bind();
  await loadConfigUI();
  chrome.storage.onChanged.addListener((c, area) => {
    if (area !== "session") return;
    if (c.pendingImage) consumePending();
    if (c.pendingBatch) consumeBatch();
  });
}

async function checkServer() {
  const h = await CloReason.health();
  const dot = $("serverDot");
  const banner = $("serverBanner");
  dot.classList.remove("ok", "bad");
  if (h.ok) {
    dot.classList.add("ok"); dot.title = "反推服务在线 · " + h.provider;
    if (banner) banner.classList.add("hidden");
  } else {
    dot.classList.add("bad"); dot.title = "反推服务未启动";
    if (banner) banner.classList.remove("hidden");
  }
  return h.ok;
}

// ---------- 单张取图 ----------
async function consumePending() {
  const { pendingImage } = await chrome.storage.session.get("pendingImage");
  if (!pendingImage) return;
  await chrome.storage.session.remove("pendingImage");
  state.srcUrl = pendingImage.srcUrl || "";
  state.pageUrl = pendingImage.pageUrl || "";
  let dataUrl = pendingImage.dataUrl || "";
  if (!dataUrl && pendingImage.srcUrl) {
    try { dataUrl = await CloReason.urlToDataUrl(pendingImage.srcUrl); }
    catch { setStatus("reasonStatus", "图片跨域无法取像素，请用「从页面选图」", true); }
  }
  if (dataUrl) setImage(dataUrl);
}
function setImage(dataUrl) {
  state.image = dataUrl;
  const pv = $("preview");
  pv.classList.remove("empty");
  pv.innerHTML = `<img src="${dataUrl}" alt="preview">`;
  $("reasonBtn").disabled = false;
  updateSaveBtn();
}
// 提示词区两个按钮（复制/清除）只在有内容时可用
function updatePromptActions() {
  const has = !!$("promptText").value.trim();
  const cp = $("copyPromptBtn"), cl = $("clearPromptBtn");
  if (cp) cp.disabled = !has;
  if (cl) cl.disabled = !has;
}
async function copyPrompt() {
  const txt = $("promptText").value.trim();
  if (!txt) return;
  const ok = await copyTextToClipboard(txt);
  setStatus("reasonStatus", ok ? "已复制到剪贴板 ✓" : "复制失败", !ok, ok);
}
// 通用复制：优先 clipboard API，失败走隐藏 textarea 选中复制兜底
async function copyTextToClipboard(txt) {
  if (!txt) return false;
  try {
    await navigator.clipboard.writeText(txt);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = txt;
      ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch { return false; }
  }
}
function clearPrompt() {
  $("promptText").value = "";
  updatePromptActions();
  updateSaveBtn();
  setStatus("reasonStatus", "提示词已清除");
}
function clearAll() {
  state.image = ""; state.srcUrl = ""; state.pageUrl = "";
  state.chosen = []; state.suggested = [];
  const pv = $("preview"); pv.classList.add("empty");
  pv.innerHTML = '<span class="hint">右键网页图片「反推此服装」<br/>或点下方按钮从页面选图</span>';
  $("promptText").value = ""; $("reasonBtn").disabled = true;
  renderChosen(); renderSuggest(); setStatus("reasonStatus", ""); setStatus("saveStatus", "");
  updateSaveBtn(); updatePromptActions();
}

// ---------- 单张反推 ----------
async function doReason() {
  if (!state.image) return;
  $("reasonBtn").disabled = true;
  const t0 = Date.now();
  const timer = setInterval(() => {
    setStatus("reasonStatus", `反推中… ${((Date.now() - t0) / 1000).toFixed(0)}s（本地 CLI 首次较慢，约 30s）`);
  }, 500);
  try {
    const lang = $("langZh") && $("langZh").checked ? "zh" : "en";
    const tagLang = $("tagZh") ? ($("tagZh").checked ? "zh" : "en") : "zh";
    const r = await CloReason.reason(state.image, state.mode, lang, tagLang);
    clearInterval(timer);
    $("promptText").value = r.prompt || "";
    updatePromptActions();
    if (r.category) $("categorySel").value = r.category;
    state.suggested = r.suggestedTags || [];
    renderSuggest();
    setStatus("reasonStatus", `完成 · ${r.provider} · ${(r.tookMs / 1000).toFixed(1)}s`, false, true);
  } catch (e) {
    clearInterval(timer);
    setStatus("reasonStatus", "反推失败：" + e.message, true);
    checkServer();
  } finally {
    $("reasonBtn").disabled = false;
    updateSaveBtn();
  }
}

// ---------- 单张标签 ----------
function renderSuggest() {
  const box = $("suggestTags");
  box.innerHTML = "";
  state.suggested.filter((t) => !state.chosen.includes(t)).forEach((t) => {
    const el = document.createElement("span");
    el.className = "tag"; el.textContent = "+ " + t;
    el.onclick = () => { state.chosen.push(t); renderChosen(); renderSuggest(); };
    box.appendChild(el);
  });
}
function renderChosen() {
  const box = $("chosenTags");
  box.innerHTML = "";
  state.chosen.forEach((t) => {
    const el = document.createElement("span");
    el.className = "tag"; el.innerHTML = t + '<span class="x">×</span>';
    el.onclick = () => { state.chosen = state.chosen.filter((x) => x !== t); renderChosen(); renderSuggest(); };
    box.appendChild(el);
  });
  updateSaveBtn();
}

// ---------- 大类 ----------
async function loadCategories() {
  const { customCategories } = await chrome.storage.local.get("customCategories");
  const cats = DEFAULT_CATS.concat(customCategories || []);
  const sel = $("categorySel");
  sel.innerHTML = "";
  cats.forEach((c) => {
    const o = document.createElement("option");
    o.value = c.value; o.textContent = c.label;
    sel.appendChild(o);
  });
  return cats;
}
async function addCategory() {
  const v = $("newCatInput").value.trim();
  if (!v) return;
  const { customCategories } = await chrome.storage.local.get("customCategories");
  const list = customCategories || [];
  const value = v.toLowerCase().replace(/\s+/g, "_");
  if (!list.find((c) => c.value === value)) list.push({ value, label: v });
  await chrome.storage.local.set({ customCategories: list });
  $("newCatInput").value = "";
  await loadCategories();
  $("categorySel").value = value;
}

// ---------- 单张保存 ----------
function updateSaveBtn() {
  $("saveBtn").disabled = !(state.image && $("promptText").value.trim());
}
async function save() {
  const promptText = $("promptText").value.trim();
  if (!state.image || !promptText) return;
  $("saveBtn").disabled = true;
  setStatus("saveStatus", "保存中…");
  try {
    const thumb = await CloReason.makeThumb(state.image);
    const sel = $("categorySel");
    await CloDB.add({
      image: state.image, thumb,
      srcUrl: state.srcUrl, pageUrl: state.pageUrl,
      category: sel.value,
      categoryLabel: sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].text : sel.value,
      mode: state.mode,
      prompts: { [state.mode]: promptText },
      tags: state.chosen.slice(),
    });
    setStatus("saveStatus", "已保存 ✓", false, true);
    setTimeout(() => setStatus("saveStatus", ""), 2000);
  } catch (e) {
    setStatus("saveStatus", "保存失败：" + e.message, true);
  } finally {
    $("saveBtn").disabled = false;
  }
}

// ---------- 批量模式 ----------
async function consumeBatch() {
  const { pendingBatch } = await chrome.storage.session.get("pendingBatch");
  if (!pendingBatch || !pendingBatch.items || !pendingBatch.items.length) return;
  await chrome.storage.session.remove("pendingBatch");
  const lang = $("langZh") && $("langZh").checked ? "zh" : "en";
  const cats = await loadCategories();
  const defaultCat = cats[0] || { value: "female", label: "女装" };
  // 已存在图片的 srcUrl 集合，用于去重（同一张 hover chip 连点也不会重复）
  const existSrc = new Set(batch.items.map((i) => i.srcUrl).filter(Boolean));
  const existImg = new Set(batch.items.map((i) => i.image).filter(Boolean));
  let added = 0;
  // 逐项拉像素（失败的用 srcUrl 兜底）
  for (const it of pendingBatch.items) {
    let dataUrl = it.dataUrl || "";
    if (!dataUrl && it.srcUrl) {
      try { dataUrl = await CloReason.urlToDataUrl(it.srcUrl); } catch {}
    }
    if (!dataUrl) continue;
    if (it.srcUrl && existSrc.has(it.srcUrl)) continue;
    if (existImg.has(dataUrl)) continue;
    existSrc.add(it.srcUrl || ""); existImg.add(dataUrl);
    batch.items.push({
      id: "b" + (++batch.seq),
      image: dataUrl,
      srcUrl: it.srcUrl || "",
      pageUrl: it.pageUrl || pendingBatch.pageUrl || "",
      mode: state.mode,
      lang,
      status: "pending", // pending / running / done / err / saved
      prompt: "", category: defaultCat.value, categoryLabel: defaultCat.label,
      suggested: [], chosen: [], tookMs: 0, error: "", saved: false,
    });
    added++;
  }
  if (batch.items.length) {
    if (!batch.active) enterBatch();
    else renderBatch();
    if (added) setStatus("batchStatus", `新加入 ${added} 张 · 共 ${batch.items.length} 张`, false, true);
  }
}
function enterBatch() {
  batch.active = true;
  document.querySelectorAll(".single-only").forEach((el) => el.classList.add("hidden"));
  $("batchWrap").classList.remove("hidden");
  const el = document.getElementById("batchCurMode");
  if (el) el.textContent = MODE_LABEL[state.mode] || state.mode;
  renderBatch();
}
function exitBatch() {
  batch.active = false;
  batch.items = [];
  document.querySelectorAll(".single-only").forEach((el) => el.classList.remove("hidden"));
  $("batchWrap").classList.add("hidden");
}
// 全量重建：仅在结构变化时调用（加图/删图/进出批量/切档位/反推完成写回结果）
function renderBatch() {
  const list = $("batchList");
  list.innerHTML = "";
  batch.items.forEach((it, idx) => list.appendChild(renderCard(it, idx)));
  updateBatchCounters();
}
// 局部刷新：反推进行中定时调用，只更新状态文本/卡片描边，不重建 textarea/tags DOM
// —— 保住用户在 textarea 里的滚动位置与手动拉伸的高度（修反馈4）
function refreshCards() {
  const list = $("batchList");
  batch.items.forEach((it) => {
    const card = list.querySelector(`.bcard[data-id="${it.id}"]`);
    if (!card) return;
    card.className = "bcard " + (it.status === "running" ? "running" : it.status === "done" || it.status === "saved" ? "done" : it.status === "err" ? "err" : "");
    const st = card.querySelector(".bcard-state");
    if (st) {
      st.textContent = stateText(it);
      st.classList.toggle("err", it.status === "err");
      st.classList.toggle("ok", it.status === "saved");
    }
  });
  updateBatchCounters();
}
function updateBatchCounters() {
  $("batchCnt").textContent = String(batch.items.length);
  $("batchDone").textContent = String(batch.items.filter((i) => i.status === "done" || i.status === "saved").length);
  const anyDone = batch.items.some((i) => (i.status === "done" || i.status === "saved") && !i.saved && (i.prompt || "").trim());
  $("batchSaveAll").disabled = !anyDone;
  updateBatchPromptActions();
}
function renderCard(it, idx) {
  const card = document.createElement("div");
  card.className = "bcard " + (it.status === "running" ? "running" : it.status === "done" || it.status === "saved" ? "done" : it.status === "err" ? "err" : "");
  const catOpts = optionsHtml(it.category);
  card.innerHTML = `
    <div class="bcard-top">
      <div class="bcard-thumb"><img src="${it.image}" alt=""></div>
      <div class="bcard-main">
        <div class="bcard-row1">
          <span class="bcard-idx">#${idx + 1}</span>
          <select class="bcard-sel" data-role="cat">${catOpts}</select>
          <button class="bcard-del" title="移除">×</button>
        </div>
        <div class="bcard-state ${it.status === 'err' ? 'err' : it.status === 'saved' ? 'ok' : ''}">${stateText(it)}</div>
      </div>
    </div>
    <textarea class="bcard-prompt ${it.prompt ? '' : 'hidden'}" rows="4" placeholder="反推结果">${escapeHtml(it.prompt)}</textarea>
    <div class="bcard-prompt-actions ${it.prompt ? '' : 'hidden'}">
      <button data-role="copy" class="secondary">复制提示词</button>
      <button data-role="clear" class="secondary">清除提示词</button>
    </div>
    <div class="bcard-tags"></div>
    <div class="bcard-btns">
      <button data-role="reason" class="primary">${it.status === 'done' || it.status === 'saved' ? '重新反推' : '反推'}</button>
      <button data-role="save" class="${it.saved ? 'save-ok' : 'secondary'}" ${!it.prompt || it.saved ? 'disabled' : ''}>${it.saved ? '已保存 ✓' : '保存本张'}</button>
    </div>
  `;
  card.dataset.id = it.id;
  // 标签
  const tagBox = card.querySelector(".bcard-tags");
  const uniq = uniqueTags(it);
  uniq.forEach((t) => {
    const s = document.createElement("span");
    s.className = "tag" + (it.chosen.includes(t) ? " on" : "");
    s.textContent = t;
    s.onclick = () => {
      if (it.chosen.includes(t)) it.chosen = it.chosen.filter((x) => x !== t);
      else it.chosen.push(t);
      renderBatch();
    };
    tagBox.appendChild(s);
  });
  // 事件
  card.querySelector('[data-role="cat"]').onchange = (e) => {
    it.category = e.target.value;
    const opt = e.target.options[e.target.selectedIndex];
    it.categoryLabel = opt ? opt.text : e.target.value;
  };
  card.querySelector(".bcard-del").onclick = () => {
    batch.items = batch.items.filter((x) => x.id !== it.id);
    if (!batch.items.length) exitBatch(); else renderBatch();
  };
  card.querySelector(".bcard-prompt").oninput = (e) => {
    it.prompt = e.target.value;
    if (it.saved) { it.saved = false; renderBatch(); }
    else { $("batchSaveAll").disabled = !batch.items.some((i) => (i.prompt || "").trim() && !i.saved); updateBatchPromptActions(); }
  };
  card.querySelector('[data-role="reason"]').onclick = () => { it.mode = state.mode; reasonOne(it); };
  card.querySelector('[data-role="save"]').onclick = () => saveOne(it);
  card.querySelector('[data-role="copy"]').onclick = async (e) => {
    const txt = (it.prompt || "").trim();
    if (!txt) return;
    const ok = await copyTextToClipboard(txt);
    const btn = e.currentTarget;
    const old = btn.textContent;
    btn.textContent = ok ? "已复制 ✓" : "复制失败";
    setTimeout(() => { btn.textContent = old; }, 1200);
  };
  card.querySelector('[data-role="clear"]').onclick = () => {
    it.prompt = "";
    if (it.saved) it.saved = false;
    renderBatch();
  };
  return card;
}
function optionsHtml(sel) {
  const opts = [];
  document.querySelectorAll("#categorySel option").forEach((o) => {
    opts.push(`<option value="${o.value}" ${o.value === sel ? "selected" : ""}>${o.textContent}</option>`);
  });
  return opts.join("");
}
function stateText(it) {
  if (it.status === "pending") return "待反推";
  if (it.status === "running") return `反推中… ${Math.max(0, Math.round((Date.now() - it._t0) / 1000))}s`;
  if (it.status === "done") return `完成 · ${(it.tookMs / 1000).toFixed(1)}s`;
  if (it.status === "saved") return "已入库 ✓";
  if (it.status === "err") return "失败：" + (it.error || "unknown");
  return "";
}
function uniqueTags(it) {
  const set = new Set([...(it.chosen || []), ...(it.suggested || [])]);
  return Array.from(set);
}
function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function reasonOne(it) {
  it.status = "running"; it.error = ""; it._t0 = Date.now();
  // it.mode 由调用方(单卡「反推」/批量「一键反推」)在此之前同步为当前档位
  // 避免这里再次读 state.mode 导致「运行中切换档位、正在反推的那张跟随变化」的错乱
  if (!it.mode) it.mode = state.mode;
  it.lang = $("langZh") && $("langZh").checked ? "zh" : "en";
  it.tagLang = $("tagZh") ? ($("tagZh").checked ? "zh" : "en") : "zh";
  renderBatch();
  // 只做局部刷新（更新计时/状态文本），不重建整表 → 保住其它卡片 textarea 的滚动与拉伸
  const tick = setInterval(refreshCards, 700);
  try {
    const r = await CloReason.reason(it.image, it.mode, it.lang, it.tagLang);
    it.prompt = r.prompt || "";
    if (r.category) { it.category = r.category; it.categoryLabel = r.category === "male" ? "男装" : "女装"; }
    it.suggested = r.suggestedTags || [];
    it.tookMs = r.tookMs || (Date.now() - it._t0);
    it.status = "done";
  } catch (e) {
    it.status = "err"; it.error = e.message || String(e);
    checkServer();
  } finally {
    clearInterval(tick);
    renderBatch();
  }
}

async function reasonAll() {
  const pending = batch.items.filter((i) => i.status !== "running" && i.status !== "saved");
  if (!pending.length) return;
  // 关键修复：一键反推前把当前档位广播到每张待反推的卡片
  // 之前 it.mode 是"加入批量的那一刻"固化的,先加图再切档位 → 不会生效
  pending.forEach((it) => { it.mode = state.mode; });
  const conc = getConcurrency();
  $("batchReasonAll").disabled = true;
  setStatus("batchStatus", `并发 ${conc} · 档位「${MODE_LABEL[state.mode] || state.mode}」反推中…`);
  const queue = pending.slice();
  const workers = Array.from({ length: Math.min(conc, queue.length) }, async () => {
    while (queue.length) {
      const it = queue.shift();
      await reasonOne(it);
    }
  });
  await Promise.all(workers);
  const okCnt = batch.items.filter((i) => i.status === "done").length;
  const errCnt = batch.items.filter((i) => i.status === "err").length;
  setStatus("batchStatus", `完成 · 成功 ${okCnt} · 失败 ${errCnt}`, errCnt > 0, errCnt === 0);
  $("batchReasonAll").disabled = false;
  renderBatch();
}

async function saveOne(it) {
  if (!it.prompt.trim() || it.saved) return;
  try {
    const thumb = await CloReason.makeThumb(it.image);
    await CloDB.add({
      image: it.image, thumb,
      srcUrl: it.srcUrl, pageUrl: it.pageUrl,
      category: it.category, categoryLabel: it.categoryLabel,
      mode: it.mode,
      prompts: { [it.mode]: it.prompt.trim() },
      tags: it.chosen.slice(),
    });
    it.saved = true; it.status = "saved";
    renderBatch();
  } catch (e) {
    it.status = "err"; it.error = "保存失败：" + (e.message || e);
    renderBatch();
  }
}
async function saveAll() {
  const list = batch.items.filter((i) => (i.prompt || "").trim() && !i.saved);
  if (!list.length) return;
  $("batchSaveAll").disabled = true;
  setStatus("batchStatus", `保存中… 0/${list.length}`);
  let done = 0;
  for (const it of list) {
    await saveOne(it);
    done++;
    setStatus("batchStatus", `保存中… ${done}/${list.length}`);
  }
  setStatus("batchStatus", `已全部保存 ${done}/${list.length} ✓`, false, true);
  renderBatch();
}
// 一键复制所有已反推的提示词（每张之间用分隔线+序号，便于区分哪张对应哪段）
async function copyAll() {
  const list = batch.items.filter((i) => (i.prompt || "").trim());
  if (!list.length) return;
  const txt = list
    .map((it, i) => `【#${batch.items.indexOf(it) + 1}】\n${it.prompt.trim()}`)
    .join("\n\n----------\n\n");
  const ok = await copyTextToClipboard(txt);
  setStatus("batchStatus", ok ? `已复制 ${list.length} 张提示词 ✓` : "复制失败", !ok, ok);
}
// 一键清除所有卡片的提示词（不动缩略图/标签；已保存的复位为未保存态）
function clearAllPrompts() {
  let n = 0;
  batch.items.forEach((it) => {
    if ((it.prompt || "").trim()) n++;
    it.prompt = "";
    if (it.saved) { it.saved = false; it.status = it.status === "saved" ? "done" : it.status; }
  });
  renderBatch();
  setStatus("batchStatus", n ? `已清除 ${n} 张提示词` : "无提示词可清除");
}
// 批量顶部两个全局按钮的可用态：有任一张已反推出提示词才可用
function updateBatchPromptActions() {
  const has = batch.items.some((i) => (i.prompt || "").trim());
  const cp = $("batchCopyAll"), cl = $("batchClearAll");
  if (cp) cp.disabled = !has;
  if (cl) cl.disabled = !has;
}

// ---------- 设置 ----------
async function loadConfigUI() {
  try {
    const cfg = await CloReason.getConfig();
    $("provSel").value = cfg.provider || "cli";
    toggleRemote(cfg.provider);
    const rp = cfg[cfg.provider];
    if (rp && cfg.provider !== "cli") {
      $("cfgBase").value = rp.baseURL || "";
      $("cfgKey").value = rp.apiKey === "***" ? "" : (rp.apiKey || "");
      $("cfgModel").value = rp.model || "";
    }
    $("cfgCliModel").value = (cfg.cli && cfg.cli.model) || "";
  } catch (e) {}
}
function toggleRemote(prov) {
  $("remoteCfg").classList.toggle("hidden", prov === "cli");
  $("cfgCliModel").classList.toggle("hidden", prov !== "cli");
}
async function saveConfig() {
  const prov = $("provSel").value;
  const patch = { provider: prov };
  if (prov === "cli") patch.cli = { model: $("cfgCliModel").value.trim() };
  else patch[prov] = { baseURL: $("cfgBase").value.trim(), apiKey: $("cfgKey").value.trim() || "***", model: $("cfgModel").value.trim() };
  try {
    await CloReason.setConfig(patch);
    setStatus("cfgStatus", "已保存 ✓", false, true);
    await checkServer();
  } catch (e) { setStatus("cfgStatus", "失败：" + e.message, true); }
}

// ---------- 通用 ----------
function setStatus(id, msg, err, ok) {
  const el = $(id); if (!el) return;
  el.textContent = msg;
  el.classList.toggle("err", !!err); el.classList.toggle("ok", !!ok);
}
function updateBatchModeHint() {
  const el = document.getElementById("batchCurMode");
  if (el) el.textContent = MODE_LABEL[state.mode] || state.mode;
}
function bind() {
  $("modes").addEventListener("click", (e) => {
    const b = e.target.closest(".seg"); if (!b) return;
    document.querySelectorAll(".seg").forEach((s) => s.classList.remove("on"));
    b.classList.add("on"); state.mode = b.dataset.mode;
    updateBatchModeHint();
  });
  // 并发数选择器：从 localStorage 恢复 + 变更时记忆
  try {
    const savedConc = localStorage.getItem("clo_batchConc");
    const concSel = document.getElementById("batchConc");
    if (concSel) {
      if (savedConc && ["1","2","3","5","8"].includes(savedConc)) concSel.value = savedConc;
      concSel.addEventListener("change", (e) => {
        localStorage.setItem("clo_batchConc", e.target.value);
      });
    }
  } catch {}
  $("reasonBtn").onclick = doReason;
  try {
    // 提示词语言：默认中文（键不存在时视为中文）
    const savedLang = localStorage.getItem("clo_langZh");
    if ($("langZh")) {
      $("langZh").checked = savedLang === null ? true : savedLang === "1";
      $("langZh").addEventListener("change", (e) => {
        localStorage.setItem("clo_langZh", e.target.checked ? "1" : "0");
      });
    }
    // 标签中英：默认中文（键不存在时视为中文）
    const savedTag = localStorage.getItem("clo_tagZh");
    if ($("tagZh")) {
      $("tagZh").checked = savedTag === null ? true : savedTag === "1";
      $("tagZh").addEventListener("change", (e) => {
        localStorage.setItem("clo_tagZh", e.target.checked ? "1" : "0");
      });
    }
  } catch {}
  $("promptText").addEventListener("input", () => { updateSaveBtn(); updatePromptActions(); });
  $("copyPromptBtn").onclick = copyPrompt;
  $("clearPromptBtn").onclick = clearPrompt;
  $("saveBtn").onclick = save;
  $("clearBtn").onclick = clearAll;
  $("openLib").onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL("library.html") });
  $("pickBtn").onclick = () => {
    setStatus("reasonStatus", "点选模式已激活，请到网页点击图片…");
    chrome.runtime.sendMessage({ type: "start-pick" }, (r) => {
      if (!r || !r.ok) setStatus("reasonStatus", "无法启动点选：" + ((r && r.error) || "未知"), true);
    });
  };
  $("multiPickBtn").onclick = () => {
    setStatus("reasonStatus", "批量选图已激活，请到网页勾选图片…");
    chrome.runtime.sendMessage({ type: "start-multi-pick" }, (r) => {
      if (!r || !r.ok) setStatus("reasonStatus", "无法启动批量选图：" + ((r && r.error) || "未知"), true);
    });
  };
  $("addCatBtn").onclick = addCategory;
  $("newCatInput").addEventListener("keydown", (e) => { if (e.key === "Enter") addCategory(); });
  $("tagInput").addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const v = e.target.value.trim();
    if (v && !state.chosen.includes(v)) { state.chosen.push(v); renderChosen(); }
    e.target.value = "";
  });
  const bRetry = $("bannerRetry");
  if (bRetry) bRetry.onclick = async () => {
    bRetry.textContent = "连接中…"; bRetry.disabled = true;
    const ok = await checkServer();
    bRetry.textContent = "重试连接"; bRetry.disabled = false;
    if (!ok) { const hb = $("bannerHelpBox"); if (hb) hb.classList.remove("hidden"); }
  };
  const bHelp = $("bannerHelp");
  if (bHelp) bHelp.onclick = () => { const hb = $("bannerHelpBox"); if (hb) hb.classList.toggle("hidden"); };
  $("toggleSettings").onclick = () => $("settings").classList.toggle("hidden");
  $("provSel").onchange = (e) => toggleRemote(e.target.value);
  $("saveCfg").onclick = saveConfig;

  // 批量
  $("batchReasonAll").onclick = reasonAll;
  $("batchCopyAll").onclick = copyAll;
  $("batchClearAll").onclick = clearAllPrompts;
  $("batchSaveAll").onclick = saveAll;
  $("batchExit").onclick = exitBatch;
  $("batchAdd").onclick = () => {
    chrome.runtime.sendMessage({ type: "start-multi-pick" }, (r) => {
      if (!r || !r.ok) setStatus("batchStatus", "无法启动批量选图：" + ((r && r.error) || "未知"), true);
    });
  };
}
