// 资产库页逻辑
const $ = (id) => document.getElementById(id);
const MODE_LABEL = { clothing_only: "纯服装", with_model: "带模特", ghost_mannequin: "假人展示", full_scene: "反推全图" };
const FULL_MODES = new Set(["full_scene"]); // 归"全图"视图的档位
let ALL = [];
// tagsInclude/tagsExclude：Eagle 式多选筛选。点标签循环：无 → 包含 → 排除 → 无
let filter = { view: "clothing", cat: "", tagsInclude: new Set(), tagsExclude: new Set(), mode: "", q: "" };

// 循环切换某标签的筛选态：无→包含→排除→无
function cycleTag(t) {
  if (filter.tagsInclude.has(t)) { filter.tagsInclude.delete(t); filter.tagsExclude.add(t); }
  else if (filter.tagsExclude.has(t)) { filter.tagsExclude.delete(t); }
  else { filter.tagsInclude.add(t); }
  refresh();
}
function tagState(t) {
  if (filter.tagsInclude.has(t)) return "include";
  if (filter.tagsExclude.has(t)) return "exclude";
  return "";
}
function clearTagFilter() {
  filter.tagsInclude.clear(); filter.tagsExclude.clear(); refresh();
}

init();
async function init() {
  ALL = await CloDB.all();
  renderNav();
  render();
  bind();
}

// 判断一条资产归属哪个视图（服装 or 全图）
function assetView(it) {
  const modes = Object.keys(it.prompts || {});
  const primary = it.mode || modes[0] || "clothing_only";
  return FULL_MODES.has(primary) ? "full" : "clothing";
}

function byView() {
  return ALL.filter((it) => assetView(it) === filter.view);
}

function apply() {
  return byView().filter((it) => {
    if (filter.cat && it.category !== filter.cat) return false;
    const tags = it.tags || [];
    // 包含：必须命中全部所选包含标签（AND）
    for (const t of filter.tagsInclude) if (!tags.includes(t)) return false;
    // 排除：命中任一排除标签即淘汰
    for (const t of filter.tagsExclude) if (tags.includes(t)) return false;
    if (filter.mode && !(it.prompts && it.prompts[filter.mode])) return false;
    if (filter.q) {
      const hay = ((it.tags || []).join(" ") + " " + Object.values(it.prompts || {}).join(" ")).toLowerCase();
      if (!hay.includes(filter.q.toLowerCase())) return false;
    }
    return true;
  });
}

function renderNav() {
  const scope = byView();
  // 大类（仅"服装"视图显示）
  const cats = {};
  scope.forEach((it) => { cats[it.category] = cats[it.category] || { label: it.categoryLabel || it.category, n: 0 }; cats[it.category].n++; });
  const catNav = $("catNav");
  const catTitle = document.querySelector(".cat-nav-title");
  const showCat = filter.view === "clothing";
  catTitle.classList.toggle("hidden", !showCat);
  catNav.innerHTML = "";
  if (showCat) {
    catNav.appendChild(navItem("全部", scope.length, filter.cat === "", () => { filter.cat = ""; refresh(); }));
    Object.entries(cats).forEach(([val, o]) =>
      catNav.appendChild(navItem(o.label, o.n, filter.cat === val, () => { filter.cat = val; refresh(); }))
    );
  }
  // 标签（Eagle 式：点一次包含、再点排除、三次取消）
  const tagMap = {};
  scope.forEach((it) => (it.tags || []).forEach((t) => (tagMap[t] = (tagMap[t] || 0) + 1)));
  const tagNav = $("tagNav");
  tagNav.innerHTML = "";
  Object.entries(tagMap).sort((a, b) => b[1] - a[1]).forEach(([t, n]) => {
    const el = document.createElement("div");
    const st = tagState(t);
    el.className = "nav-item tag-chip" + (st ? " " + st : "");
    const mark = st === "include" ? "＋" : st === "exclude" ? "－" : "";
    el.innerHTML = `<span>${mark ? `<b class="tag-mark">${mark}</b>` : ""}${escapeHtml(t)}</span><span class="n">${n}</span>`;
    el.onclick = () => cycleTag(t);
    tagNav.appendChild(el);
  });
  // 清除标签筛选入口
  const clearBtn = $("tagClear");
  const activeN = filter.tagsInclude.size + filter.tagsExclude.size;
  if (clearBtn) {
    clearBtn.classList.toggle("hidden", activeN === 0);
    clearBtn.textContent = `清除标签筛选（${activeN}）`;
  }
  $("count").textContent = scope.length;

  // 视图按钮态
  $("viewClothing").classList.toggle("on", filter.view === "clothing");
  $("viewFull").classList.toggle("on", filter.view === "full");
}
function navItem(label, n, on, onClick) {
  const el = document.createElement("div");
  el.className = "nav-item" + (on ? " on" : "");
  el.innerHTML = `<span>${label}</span><span class="n">${n}</span>`;
  el.onclick = onClick;
  return el;
}

function render() {
  const items = apply();
  const grid = $("grid");
  grid.innerHTML = "";
  $("empty").classList.toggle("hidden", items.length > 0);
  const crumbParts = [];
  crumbParts.push(filter.view === "full" ? "全图" : "服装");
  if (filter.cat) crumbParts.push(byView().find((i) => i.category === filter.cat)?.categoryLabel || filter.cat);
  filter.tagsInclude.forEach((t) => crumbParts.push("#" + t));
  filter.tagsExclude.forEach((t) => crumbParts.push("-" + t));
  $("crumb").textContent = crumbParts.join(" · ");

  items.forEach((it) => {
    const cell = document.createElement("div");
    cell.className = "cell";
    const firstMode = it.mode || Object.keys(it.prompts || {})[0];
    cell.innerHTML = `
      <div class="cell-img"><img loading="lazy" src="${it.thumb || it.image}" alt=""></div>
      <div class="cell-body">
        <div class="cell-cat">${it.categoryLabel || it.category}${firstMode ? ' · ' + (MODE_LABEL[firstMode] || firstMode) : ''}</div>
        <div class="cell-tags">${(it.tags || []).map((t) => "#" + t).join(" ") || "—"}</div>
      </div>
      <div class="cell-copy">
        <button class="copy-btn" data-act="word">复制词</button>
        <button class="copy-btn" data-act="wordimg">词+图</button>
      </div>`;
    cell.querySelector(".cell-img").onclick = () => openModal(it);
    cell.querySelector(".cell-body").onclick = () => openModal(it);
    cell.querySelectorAll(".copy-btn").forEach((b) => {
      b.onclick = (e) => { e.stopPropagation(); const p = it.prompts[firstMode] || ""; b.dataset.act === "word" ? copyText(p) : copyWordImg(p, it.image); };
    });
    grid.appendChild(cell);
  });
}

function refresh() { renderNav(); render(); }
function switchView(v) {
  if (filter.view === v) return;
  filter.view = v;
  filter.cat = ""; filter.tagsInclude.clear(); filter.tagsExclude.clear();
  refresh();
}

// ---------- 详情 ----------
let currentItem = null;

function openModal(it) {
  currentItem = it;
  $("mImg").src = it.image;
  $("mCat").textContent = it.categoryLabel || it.category;
  $("mDate").textContent = new Date(it.createdAt).toLocaleString("zh-CN");
  renderModalTags();
  const mp = $("mPrompts");
  mp.innerHTML = "";
  Object.entries(it.prompts || {}).forEach(([mode, text]) => {
    const b = document.createElement("div");
    b.className = "prompt-block";
    b.innerHTML = `<div class="pb-head"><span class="pb-mode">${MODE_LABEL[mode] || mode}</span>
      <span><button class="btn mini" data-a="w">复制词</button> <button class="btn mini" data-a="wi">词+图</button></span></div>
      <div class="pb-text">${escapeHtml(text)}</div>`;
    b.querySelector('[data-a="w"]').onclick = () => copyText(text);
    b.querySelector('[data-a="wi"]').onclick = () => copyWordImg(text, it.image);
    mp.appendChild(b);
  });
  const src = $("mSource");
  if (it.pageUrl) { src.href = it.pageUrl; src.style.display = ""; } else src.style.display = "none";
  $("mDelete").onclick = async () => {
    if (!confirm("确定删除这条资产？")) return;
    await CloDB.remove(it.id);
    ALL = ALL.filter((x) => x.id !== it.id);
    closeModal(); refresh(); toast("已删除");
  };
  $("modal").classList.remove("hidden");
}
function closeModal() { currentItem = null; $("modal").classList.add("hidden"); }

// ---------- 详情内标签编辑 ----------
function renderModalTags() {
  const it = currentItem;
  const box = $("mTags");
  box.innerHTML = "";
  (it.tags || []).forEach((t) => {
    const el = document.createElement("span");
    el.className = "tag";
    el.innerHTML = `#${escapeHtml(t)}<button class="tag-x" title="删除">×</button>`;
    el.querySelector(".tag-x").onclick = () => removeTag(t);
    box.appendChild(el);
  });
  if (!(it.tags || []).length) box.innerHTML = '<span class="muted">暂无标签</span>';
}
async function persistTags() {
  // 把内存里的 currentItem 写回 DB，并同步 ALL
  await CloDB.put(currentItem);
  const i = ALL.findIndex((x) => x.id === currentItem.id);
  if (i >= 0) ALL[i] = currentItem;
}
async function addTag(raw) {
  const t = String(raw || "").trim().replace(/^#/, "");
  if (!t || !currentItem) return;
  currentItem.tags = currentItem.tags || [];
  if (currentItem.tags.includes(t)) { toast("标签已存在"); return; }
  currentItem.tags.push(t);
  await persistTags();
  renderModalTags(); refresh();
  toast("已添加标签");
}
async function removeTag(t) {
  if (!currentItem) return;
  currentItem.tags = (currentItem.tags || []).filter((x) => x !== t);
  await persistTags();
  renderModalTags(); refresh();
  toast("已删除标签");
}

// ---------- 复制 ----------
async function copyText(t) { try { await navigator.clipboard.writeText(t); toast("提示词已复制"); } catch { toast("复制失败", true); } }

// 把任意图片(data URL / jpeg / webp)经 canvas 统一转成 PNG blob，
// 因为 Chrome 剪贴板的 ClipboardItem 只稳定接受 image/png。
function imageToPngBlob(imageUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext("2d").drawImage(img, 0, 0);
        c.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob null"))), "image/png");
      } catch (e) { reject(e); }
    };
    img.onerror = () => reject(new Error("image load failed"));
    img.src = imageUrl;
  });
}

async function copyWordImg(text, imageDataUrl) {
  try {
    if (!navigator.clipboard || !window.ClipboardItem) throw new Error("no ClipboardItem");
    const pngBlob = await imageToPngBlob(imageDataUrl);
    const item = new ClipboardItem({
      "image/png": pngBlob,
      "text/plain": new Blob([text], { type: "text/plain" }),
    });
    await navigator.clipboard.write([item]);
    toast("提示词+图片已复制 ✓");
  } catch (e) {
    // 图文同写失败（多为跨域图污染 canvas 或环境不支持）：保证提示词一定到剪贴板
    await copyText(text);
    toast("此环境不支持复制图片，已复制提示词");
  }
}

// ---------- 通用 ----------
function escapeHtml(s) { return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }
let toastTimer;
function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.classList.remove("hidden");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add("hidden"), 1800);
}
// 把一条资产的所有档位提示词拼成一份文本（多档时带档位标注）
function joinPrompts(it) {
  const entries = Object.entries(it.prompts || {});
  if (!entries.length) return "";
  if (entries.length === 1) return entries[0][1];
  return entries.map(([mode, text]) => `【${MODE_LABEL[mode] || mode}】\n${text}`).join("\n\n----------\n\n");
}

function bind() {
  $("search").addEventListener("input", (e) => { filter.q = e.target.value.trim(); render(); });
  $("modeFilter").onchange = (e) => { filter.mode = e.target.value; render(); };
  $("modalClose").onclick = closeModal;
  $("modal").querySelector(".modal-mask").onclick = closeModal;
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
  $("viewClothing").onclick = () => switchView("clothing");
  $("viewFull").onclick = () => switchView("full");
  const tagClear = $("tagClear");
  if (tagClear) tagClear.onclick = clearTagFilter;
  // 详情内加标签
  $("mTagInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); addTag(e.target.value); e.target.value = ""; }
  });
  // 详情内复制全部提示词 / 提示词+图片
  $("mCopyAll").onclick = () => { if (currentItem) copyText(joinPrompts(currentItem)); };
  $("mCopyAllImg").onclick = () => { if (currentItem) copyWordImg(joinPrompts(currentItem), currentItem.image); };
}
