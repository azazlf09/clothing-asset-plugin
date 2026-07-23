// 资产库页逻辑
const $ = (id) => document.getElementById(id);
const MODE_LABEL = { clothing_only: "纯服装", with_model: "带模特", ghost_mannequin: "假人展示" };
let ALL = [];
let filter = { cat: "", tag: "", mode: "", q: "" };

init();
async function init() {
  ALL = await CloDB.all();
  renderNav();
  render();
  bind();
}

function apply() {
  return ALL.filter((it) => {
    if (filter.cat && it.category !== filter.cat) return false;
    if (filter.tag && !(it.tags || []).includes(filter.tag)) return false;
    if (filter.mode && !(it.prompts && it.prompts[filter.mode])) return false;
    if (filter.q) {
      const hay = ((it.tags || []).join(" ") + " " + Object.values(it.prompts || {}).join(" ")).toLowerCase();
      if (!hay.includes(filter.q.toLowerCase())) return false;
    }
    return true;
  });
}

function renderNav() {
  // 大类
  const cats = {};
  ALL.forEach((it) => { cats[it.category] = cats[it.category] || { label: it.categoryLabel || it.category, n: 0 }; cats[it.category].n++; });
  const catNav = $("catNav");
  catNav.innerHTML = "";
  catNav.appendChild(navItem("全部", ALL.length, filter.cat === "", () => { filter.cat = ""; refresh(); }));
  Object.entries(cats).forEach(([val, o]) =>
    catNav.appendChild(navItem(o.label, o.n, filter.cat === val, () => { filter.cat = val; refresh(); }))
  );
  // 标签
  const tagMap = {};
  ALL.forEach((it) => (it.tags || []).forEach((t) => (tagMap[t] = (tagMap[t] || 0) + 1)));
  const tagNav = $("tagNav");
  tagNav.innerHTML = "";
  Object.entries(tagMap).sort((a, b) => b[1] - a[1]).forEach(([t, n]) =>
    tagNav.appendChild(navItem(t, n, filter.tag === t, () => { filter.tag = filter.tag === t ? "" : t; refresh(); }))
  );
  $("count").textContent = ALL.length;
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
  if (filter.cat) crumbParts.push(ALL.find((i) => i.category === filter.cat)?.categoryLabel || filter.cat);
  if (filter.tag) crumbParts.push("#" + filter.tag);
  $("crumb").textContent = crumbParts.length ? crumbParts.join(" · ") : "全部资产";

  items.forEach((it) => {
    const cell = document.createElement("div");
    cell.className = "cell";
    const firstMode = Object.keys(it.prompts || {})[0];
    cell.innerHTML = `
      <div class="cell-img"><img loading="lazy" src="${it.thumb || it.image}" alt=""></div>
      <div class="cell-body">
        <div class="cell-cat">${it.categoryLabel || it.category}</div>
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

// ---------- 详情 ----------
function openModal(it) {
  $("mImg").src = it.image;
  $("mCat").textContent = it.categoryLabel || it.category;
  $("mDate").textContent = new Date(it.createdAt).toLocaleString("zh-CN");
  $("mTags").innerHTML = (it.tags || []).map((t) => `<span class="tag">#${t}</span>`).join("");
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
function closeModal() { $("modal").classList.add("hidden"); }

// ---------- 复制 ----------
async function copyText(t) { try { await navigator.clipboard.writeText(t); toast("提示词已复制"); } catch { toast("复制失败", true); } }
async function copyWordImg(text, imageDataUrl) {
  try {
    const blob = await (await fetch(imageDataUrl)).blob();
    const item = new ClipboardItem({ [blob.type]: blob, "text/plain": new Blob([text], { type: "text/plain" }) });
    await navigator.clipboard.write([item]);
    toast("提示词+图片已复制");
  } catch (e) {
    await copyText(text); toast("图片复制不支持，已复制文字");
  }
}

// ---------- 通用 ----------
function escapeHtml(s) { return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }
let toastTimer;
function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.classList.remove("hidden");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add("hidden"), 1800);
}
function bind() {
  $("search").addEventListener("input", (e) => { filter.q = e.target.value.trim(); render(); });
  $("modeFilter").onchange = (e) => { filter.mode = e.target.value; render(); };
  $("modalClose").onclick = closeModal;
  $("modal").querySelector(".modal-mask").onclick = closeModal;
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
}
