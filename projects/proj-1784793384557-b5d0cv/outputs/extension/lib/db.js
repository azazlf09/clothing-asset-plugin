// IndexedDB 资产库存储。全局 window.CloDB
(() => {
  const DB = "cloAssets";
  const STORE = "assets";
  const VER = 1;
  let _db = null;

  function open() {
    if (_db) return Promise.resolve(_db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, VER);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const os = db.createObjectStore(STORE, { keyPath: "id" });
          os.createIndex("category", "category", { unique: false });
          os.createIndex("createdAt", "createdAt", { unique: false });
          os.createIndex("tags", "tags", { unique: false, multiEntry: true });
        }
      };
      req.onsuccess = () => { _db = req.result; resolve(_db); };
      req.onerror = () => reject(req.error);
    });
  }
  function tx(mode) { return open().then((db) => db.transaction(STORE, mode).objectStore(STORE)); }

  const uid = () =>
    "a_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);

  async function add(asset) {
    const store = await tx("readwrite");
    const rec = { id: uid(), createdAt: Date.now(), rating: 0, note: "", tags: [], ...asset };
    return new Promise((res, rej) => {
      const r = store.add(rec);
      r.onsuccess = () => res(rec);
      r.onerror = () => rej(r.error);
    });
  }
  async function put(asset) {
    const store = await tx("readwrite");
    return new Promise((res, rej) => {
      const r = store.put(asset);
      r.onsuccess = () => res(asset);
      r.onerror = () => rej(r.error);
    });
  }
  async function remove(id) {
    const store = await tx("readwrite");
    return new Promise((res, rej) => {
      const r = store.delete(id);
      r.onsuccess = () => res(true);
      r.onerror = () => rej(r.error);
    });
  }
  async function get(id) {
    const store = await tx("readonly");
    return new Promise((res, rej) => {
      const r = store.get(id);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async function all() {
    const store = await tx("readonly");
    return new Promise((res, rej) => {
      const r = store.getAll();
      r.onsuccess = () => res((r.result || []).sort((a, b) => b.createdAt - a.createdAt));
      r.onerror = () => rej(r.error);
    });
  }
  async function allTags() {
    const items = await all();
    const map = {};
    items.forEach((it) => (it.tags || []).forEach((t) => (map[t] = (map[t] || 0) + 1)));
    return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([tag, count]) => ({ tag, count }));
  }

  window.CloDB = { add, put, remove, get, all, allTags };
})();
