/* global pdfjsLib */

const INDEX_DB = "noko119-dtii-handbook";
const INDEX_STORE = "pages";
const META_STORE = "noko119-dtii-meta";
const EXT_STORE = "noko119-dtii-extensions";

function handbookMeta() {
  try {
    return JSON.parse(localStorage.getItem(META_STORE) || "{}");
  } catch {
    return {};
  }
}

function saveHandbookMeta(meta) {
  localStorage.setItem(META_STORE, JSON.stringify(meta));
}

function loadExtensions() {
  try {
    return JSON.parse(localStorage.getItem(EXT_STORE) || "[]");
  } catch {
    return [];
  }
}

function saveExtensions(rows) {
  localStorage.setItem(EXT_STORE, JSON.stringify(rows));
}

function openIndexDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(INDEX_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(INDEX_STORE)) {
        db.createObjectStore(INDEX_STORE, { keyPath: "page" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function savePages(pages) {
  const db = await openIndexDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(INDEX_STORE, "readwrite");
    tx.objectStore(INDEX_STORE).clear();
    pages.forEach((p) => tx.objectStore(INDEX_STORE).put(p));
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function readPages() {
  const db = await openIndexDb();
  const rows = await new Promise((resolve, reject) => {
    const tx = db.transaction(INDEX_STORE, "readonly");
    const req = tx.objectStore(INDEX_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return rows.sort((a, b) => a.page - b.page);
}

function snippet(text, query, radius) {
  const q = query.trim().split(/\s+/).filter(Boolean)[0] || "";
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text.slice(0, radius * 2);
  const a = Math.max(0, i - radius);
  const b = Math.min(text.length, i + q.length + radius);
  return (a > 0 ? "…" : "") + text.slice(a, b) + (b < text.length ? "…" : "");
}

function searchPages(pages, query, extensions) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const hits = [];
  pages.forEach((p) => {
    const hay = (p.text || "").toLowerCase();
    if (!terms.every((t) => hay.includes(t))) return;
    hits.push({
      kind: "手册原文",
      page: p.page,
      scan: !p.text || p.text.replace(/\s/g, "").length < 20,
      excerpt: snippet(p.text || "", query, 90),
    });
  });
  extensions.forEach((ext, idx) => {
    const hay = `${ext.title || ""} ${ext.body || ""}`.toLowerCase();
    if (!terms.every((t) => hay.includes(t))) return;
    hits.push({
      kind: "厂标扩展（非手册原文）",
      page: ext.page || "—",
      scan: false,
      excerpt: `${ext.title || ""}：${ext.body || ""}`,
      extIndex: idx,
    });
  });
  return hits.slice(0, 30);
}

function citation(edition, hit) {
  if (hit.kind !== "手册原文") {
    return `【扩展·非手册】${hit.excerpt}`;
  }
  const book = edition || "DTⅡ 手册";
  return `依据《${book}》第 ${hit.page} 页：${hit.excerpt}`;
}

async function indexPdf(file, onProgress) {
  if (typeof pdfjsLib === "undefined") {
    throw new Error("未加载 PDF 组件。请双击「打开本机计算.bat」启动，不要用 Cursor 打开网页。");
  }
  const worker = new URL("vendor/pdf.worker.min.js", window.location.href).href;
  pdfjsLib.GlobalWorkerOptions.workerSrc = worker;
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((it) => it.str || "").join(" ").replace(/\s+/g, " ").trim();
    pages.push({ page: i, text });
    if (onProgress) onProgress(i, pdf.numPages);
  }
  await savePages(pages);
  return pages;
}
