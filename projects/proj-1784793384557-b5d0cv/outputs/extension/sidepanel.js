// 侧边栏逻辑
const $ = (id) => document.getElementById(id);
const state = { image: "", srcUrl: "", pageUrl: "", mode: "clothing_only", chosen: [], suggested: [] };
const DEFAULT_CATS = [{ value: "female", label: "女装" }, { value: "male", label: "男装" }];

init();
async function init() {
  await checkServer();
  await loadCategories();
  await consumePending();
  bind();
  await loadConfigUI();
  chrome.storage.onChanged.addListener((c, area) => {
    if (area === "session" && c.pendingImage) consumePending();
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

// ---------- 取图 ----------
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
function clearAll() {
  state.image = ""; state.srcUrl = ""; state.pageUrl = "";
  state.chosen = []; state.suggested = [];
  const pv = $("preview"); pv.classList.add("empty");
  pv.innerHTML = '<span class="hint">右键网页图片「反推此服装」<br/>或点下方按钮从页面选图</span>';
  $("promptText").value = ""; $("reasonBtn").disabled = true;
  renderChosen(); renderSuggest(); setStatus("reasonStatus", ""); setStatus("saveStatus", "");
  updateSaveBtn();
}

// ---------- 反推 ----------
async function doReason() {
  if (!state.image) return;
  $("reasonBtn").disabled = true;
  const t0 = Date.now();
  const timer = setInterval(() => {
    setStatus("reasonStatus", `反推中… ${((Date.now() - t0) / 1000).toFixed(0)}s（本地 CLI 首次较慢，约 30s）`);
  }, 500);
  try {
    const lang = $("langZh") && $("langZh").checked ? "zh" : "en";
    const r = await CloReason.reason(state.image, state.mode, lang);
    clearInterval(timer);
    $("promptText").value = r.prompt || "";
    if (r.category) $("categorySel").value = r.category;
    state.suggested = r.suggestedTags || [];
    renderSuggest();
    setStatus("reasonStatus", `完成 · ${r.provider} · ${(r.tookMs / 1000).toFixed(1)}s`, false, true);
  } catch (e) {
    clearInterval(timer);
    setStatus("reasonStatus", "反推失败：" + e.message, true);
    // 失败可能是 server 掉线，复查一次以弹出顶部横条引导
    checkServer();
  } finally {
    $("reasonBtn").disabled = false;
    updateSaveBtn();
  }
}

// ---------- 标签 ----------
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

// ---------- 保存 ----------
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
      image: state.image,
      thumb,
      srcUrl: state.srcUrl,
      pageUrl: state.pageUrl,
      category: sel.value,
      categoryLabel: sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].text : sel.value,
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
  const el = $(id); el.textContent = msg;
  el.classList.toggle("err", !!err); el.classList.toggle("ok", !!ok);
}
function bind() {
  $("modes").addEventListener("click", (e) => {
    const b = e.target.closest(".seg"); if (!b) return;
    document.querySelectorAll(".seg").forEach((s) => s.classList.remove("on"));
    b.classList.add("on"); state.mode = b.dataset.mode;
  });
  $("reasonBtn").onclick = doReason;
  // 中文输出开关：从 localStorage 恢复 & 变更时持久化
  try {
    const saved = localStorage.getItem("clo_langZh") === "1";
    if ($("langZh")) {
      $("langZh").checked = saved;
      $("langZh").addEventListener("change", (e) => {
        localStorage.setItem("clo_langZh", e.target.checked ? "1" : "0");
      });
    }
  } catch {}
  $("promptText").addEventListener("input", updateSaveBtn);
  $("saveBtn").onclick = save;
  $("clearBtn").onclick = clearAll;
  $("openLib").onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL("library.html") });
  $("pickBtn").onclick = () => {
    setStatus("reasonStatus", "点选模式已激活，请到网页点击图片…");
    chrome.runtime.sendMessage({ type: "start-pick" }, (r) => {
      if (!r || !r.ok) setStatus("reasonStatus", "无法启动点选：" + ((r && r.error) || "未知"), true);
    });
  };
  $("addCatBtn").onclick = addCategory;
  $("newCatInput").addEventListener("keydown", (e) => { if (e.key === "Enter") addCategory(); });
  $("tagInput").addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const v = e.target.value.trim().toLowerCase();
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
}
