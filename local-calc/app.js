const SPEEDS = [0.8, 1.0, 1.25, 1.6, 2.0, 2.5, 3.15, 4.0, 5.0, 6.3];
const STORE = "noko119-m01-handbook-tables";

const sectionCols = ["width_mm", "trough_deg", "surcharge_deg", "A_m2", "page"];
const inclineCols = ["angle_deg", "k", "page"];
const lumpCols = ["width_mm", "max_lump_mm", "page"];

function $(id) {
  return document.getElementById(id);
}

function loadTables() {
  try {
    return JSON.parse(localStorage.getItem(STORE) || "{}");
  } catch {
    return {};
  }
}

function saveTables(data) {
  localStorage.setItem(STORE, JSON.stringify(data));
}

function rowsFrom(container, cols) {
  return [...container.querySelectorAll("tbody tr")].map((tr) => {
    const obj = {};
    cols.forEach((c, i) => {
      obj[c] = tr.querySelectorAll("input")[i].value.trim();
    });
    return obj;
  }).filter((row) => Object.values(row).some(Boolean));
}

function renderTable(el, cols, headers, rows) {
  const body = (rows.length ? rows : [{}]).map((row) => {
    const cells = cols.map((c) => `<td><input value="${row[c] || ""}" /></td>`).join("");
    return `<tr>${cells}</tr>`;
  }).join("");
  el.innerHTML = `<table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table>
    <button class="ghost add-row" type="button">加一行</button>`;
  el.querySelector(".add-row").onclick = () => {
    const data = collect();
    data[el.id].push({});
    paintTables(data);
  };
}

function collect() {
  return {
    tblSection: rowsFrom($("tblSection"), sectionCols),
    tblIncline: rowsFrom($("tblIncline"), inclineCols),
    tblLump: rowsFrom($("tblLump"), lumpCols),
  };
}

function paintTables(data) {
  const cur = data || loadTables();
  renderTable($("tblSection"), sectionCols, ["带宽 mm", "槽角 °", "堆积角 °", "截面积 A m²", "手册页"], cur.tblSection || []);
  renderTable($("tblIncline"), inclineCols, ["倾角 °", "系数 k", "手册页"], cur.tblIncline || []);
  renderTable($("tblLump"), lumpCols, ["带宽 mm", "最大粒度 mm", "手册页"], cur.tblLump || []);
}

function nearestSpeed(v) {
  return SPEEDS.reduce((best, s) => (Math.abs(s - v) < Math.abs(best - v) ? s : best), SPEEDS[0]);
}

function inclineK(angle, table) {
  if (Math.abs(angle) < 1e-9) return 1;
  const rows = table
    .map((r) => ({ a: Number(r.angle_deg), k: Number(r.k) }))
    .filter((r) => Number.isFinite(r.a) && Number.isFinite(r.k))
    .sort((x, y) => x.a - y.a);
  if (!rows.length) {
    throw new Error("倾角不为 0，但倾斜系数表还是空的。请对照手册填 k，或先把倾角改成 0。");
  }
  if (angle < rows[0].a || angle > rows[rows.length - 1].a) {
    throw new Error(`倾角 ${angle}° 超出已填 k 表范围，拒算。`);
  }
  for (let i = 0; i < rows.length; i++) {
    if (Math.abs(rows[i].a - angle) < 1e-9) return rows[i].k;
    if (rows[i].a > angle) {
      const a0 = rows[i - 1].a;
      const k0 = rows[i - 1].k;
      const a1 = rows[i].a;
      const k1 = rows[i].k;
      return k0 + ((k1 - k0) * (angle - a0)) / (a1 - a0);
    }
  }
  return rows[rows.length - 1].k;
}

function compute() {
  const Q = Number($("Q").value);
  const rho = Number($("rho").value);
  const v = Number($("v").value);
  const incline = Number($("incline").value) || 0;
  const trough = Number($("trough").value);
  const surcharge = Number($("surcharge").value);
  const lumpRaw = $("lump").value.trim();
  const lump = lumpRaw === "" ? null : Number(lumpRaw);
  const tables = collect();
  saveTables(tables);

  if (!(Q > 0 && rho > 0 && v > 0)) {
    throw new Error("运量、密度、带速必须是大于 0 的数字。");
  }

  const k = inclineK(incline, tables.tblIncline);
  const Areq = Q / (3600 * v * rho * k);
  const vStd = nearestSpeed(v);
  const sections = tables.tblSection
    .map((r) => ({
      width_mm: Number(r.width_mm),
      trough_deg: Number(r.trough_deg),
      surcharge_deg: Number(r.surcharge_deg),
      A_m2: Number(r.A_m2),
      page: r.page || "",
    }))
    .filter((r) => r.width_mm && r.A_m2);
  const lumps = Object.fromEntries(
    tables.tblLump
      .filter((r) => r.width_mm && r.max_lump_mm)
      .map((r) => [Number(r.width_mm), Number(r.max_lump_mm)])
  );

  const matched = sections.filter(
    (s) => Math.abs(s.trough_deg - trough) < 1e-6 && Math.abs(s.surcharge_deg - surcharge) < 1e-6
  );
  const candidates = matched.filter((s) => {
    if (s.A_m2 + 1e-12 < Areq) return false;
    if (lump != null && lumps[s.width_mm] != null && lump > lumps[s.width_mm]) return false;
    return true;
  }).sort((a, b) => a.width_mm - b.width_mm);

  const lines = [
    `运量 Q = ${Q} t/h`,
    `带速 v = ${v} m/s（最近标准带速 ${vStd} m/s）`,
    `密度 = ${rho} t/m³`,
    `倾角 = ${incline}°，k = ${k}`,
    `所需截面 A_req = ${Areq.toFixed(6)} m²`,
    `槽角 / 堆积角 = ${trough}° / ${surcharge}°`,
  ];
  if (lump != null) lines.push(`最大粒度 = ${lump} mm`);
  if (!candidates.length) {
    lines.push("推荐带宽：无（请按手册在下方填截面表）");
  } else {
    lines.push("推荐带宽（A ≥ A_req）：");
    candidates.forEach((c) => {
      const qCap = 3600 * c.A_m2 * v * rho * k;
      const page = c.page ? `，手册第 ${c.page} 页` : "";
      lines.push(`  B=${c.width_mm} mm，A=${c.A_m2} m²，可运 ${qCap.toFixed(1)} t/h${page}`);
    });
  }

  return { text: lines.join("\n"), Areq, candidates, sections: matched, tables, incline, k, Q, v, rho };
}

function expertReview(r) {
  const hasA = r.sections.length > 0;
  const hasB = r.candidates.length > 0;
  const b = hasB ? r.candidates[0].width_mm : null;

  const mech = hasB
    ? {
        verdict: "warn",
        tag: "不能出图号",
        text: `带宽可落到 B=${b} mm，这是输送带/托辊选型的前置。托辊图号仍不能唯一确定：缺辊径、轴承档、辊长。禁止用本次结果订货。`,
      }
    : {
        verdict: "no",
        tag: "不通过",
        text: "截面表未按手册校对，不能定带宽，更不能出托辊/滚筒图号。当前只允许看 A_req。",
      };

  const proc = hasB
    ? {
        verdict: "warn",
        tag: "不能下车间",
        text: "带宽带速有了，仍缺托辊规格，下料、组对、装配都下不了。可作试算，不可报价、不可投产。",
      }
    : {
        verdict: "no",
        tag: "资料不齐",
        text: "手册表没填进本页，工艺会签不通过。把原书截面表抄进下面表格并保存后再算。",
      };

  const comp = {
    verdict: hasA ? "ok" : "warn",
    tag: hasA ? "本机已存表" : "表还在空",
    text: "数据只存在这台电脑的浏览器里，不上传。请只保留一份工具文件夹。手册 PDF 仍放你本机，不要拷进这个网页包。",
  };

  return [
    { title: "机械工程师", ...mech },
    { title: "工艺工程师", ...proc },
    { title: "计算机工程师", ...comp },
  ];
}

function renderExperts(list) {
  $("experts").innerHTML = list.map((e) => `
    <article class="expert">
      <h3>${e.title} <span class="verdict ${e.verdict}">${e.tag}</span></h3>
      <p>${e.text}</p>
    </article>
  `).join("");
}

function runCalc() {
  try {
    const r = compute();
    $("result").textContent = r.text;
    renderExperts(expertReview(r));
  } catch (err) {
    $("result").textContent = "无法计算：" + err.message;
    renderExperts([
      { title: "机械工程师", verdict: "no", tag: "拒算", text: err.message },
      { title: "工艺工程师", verdict: "no", tag: "不通过", text: "算不出数，不能下车间。" },
      { title: "计算机工程师", verdict: "warn", tag: "检查输入", text: "先改输入或补手册表，再点计算。不要敲命令。" },
    ]);
  }
}

$("btnCalc").onclick = runCalc;
$("btnReset").onclick = () => {
  $("Q").value = 800;
  $("rho").value = 1.6;
  $("v").value = 2.5;
  $("incline").value = 0;
  $("trough").value = 35;
  $("surcharge").value = 20;
  $("lump").value = "";
};
$("btnSave").onclick = () => {
  saveTables(collect());
  $("result").textContent = "手册表已保存在本机浏览器。再点「计算」。";
};
$("btnClear").onclick = () => {
  if (confirm("清空本机已填的手册表？")) {
    localStorage.removeItem(STORE);
    paintTables({ tblSection: [], tblIncline: [], tblLump: [] });
  }
};

const PDF_STORE = "noko119-m01-handbook-name";

function showPdfName() {
  const el = $("pdfName");
  const meta = handbookMeta();
  if (el) el.textContent = localStorage.getItem(PDF_STORE) || "尚未载入";
  if ($("edition") && meta.edition) $("edition").value = meta.edition;
  if ($("pdfProgress") && meta.pages) {
    $("pdfProgress").textContent = "已索引 " + meta.pages + " 页";
  }
}

function renderExtList() {
  const rows = loadExtensions();
  $("extList").innerHTML = rows.length
    ? rows.map((r, i) => `<div class="ext-item"><strong>【扩展】${r.title || "未命名"}</strong>
        <div>${r.body || ""}</div>
        <button class="ghost" type="button" data-del="${i}">删除</button></div>`).join("")
    : "<p class='hint'>还没有扩展。手册有的内容不要写在这里。</p>";
  $("extList").querySelectorAll("[data-del]").forEach((btn) => {
    btn.onclick = () => {
      const all = loadExtensions();
      all.splice(Number(btn.dataset.del), 1);
      saveExtensions(all);
      renderExtList();
    };
  });
}

async function renderHits(query) {
  const pages = await readPages();
  const hits = searchPages(pages, query, loadExtensions());
  const edition = ($("edition") && $("edition").value.trim()) || handbookMeta().edition || "DTⅡ 手册";
  if (!hits.length) {
    $("searchHits").innerHTML = "<p class='hint'>没有命中。若刚载入过扫描版 PDF，该页可能没有文字。</p>";
    return;
  }
  $("searchHits").innerHTML = hits.map((h, i) => {
    const cite = citation(edition, h);
    const scan = h.scan ? " · 可能是扫描页" : "";
    return `<article class="hit">
      <strong>${h.kind}</strong>　第 ${h.page} 页${scan}
      <div>${h.excerpt}</div>
      <button type="button" data-cite="${i}">复制给设计院的依据</button>
    </article>`;
  }).join("");
  $("searchHits").querySelectorAll("[data-cite]").forEach((btn) => {
    btn.onclick = async () => {
      const h = hits[Number(btn.dataset.cite)];
      const text = citation(edition, h);
      try {
        await navigator.clipboard.writeText(text);
        btn.textContent = "已复制";
      } catch {
        window.prompt("复制下面这段", text);
      }
    };
  });
}

const pdfPick = $("pdfPick");
if (pdfPick) {
  pdfPick.onchange = async () => {
    const f = pdfPick.files && pdfPick.files[0];
    if (!f) return;
    localStorage.setItem(PDF_STORE, f.name + "（本机索引，未上传）");
    showPdfName();
    $("pdfProgress").textContent = "正在读手册…";
    try {
      const pages = await indexPdf(f, (i, n) => {
        $("pdfProgress").textContent = "正在读第 " + i + " / " + n + " 页";
      });
      const meta = handbookMeta();
      meta.pages = pages.length;
      meta.file = f.name;
      meta.edition = ($("edition") && $("edition").value.trim()) || meta.edition || "";
      saveHandbookMeta(meta);
      $("pdfProgress").textContent = "已索引 " + pages.length + " 页，可检索";
    } catch (err) {
      $("pdfProgress").textContent = "索引失败";
      $("searchHits").innerHTML = "<p class='hint'>无法读取 PDF：" + err.message + "</p>";
    }
  };
}

if ($("edition")) {
  $("edition").onchange = () => {
    const meta = handbookMeta();
    meta.edition = $("edition").value.trim();
    saveHandbookMeta(meta);
  };
}

if ($("btnSearch")) {
  $("btnSearch").onclick = () => renderHits($("qSearch").value);
  $("qSearch").addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") renderHits($("qSearch").value);
  });
}

if ($("btnExtAdd")) {
  $("btnExtAdd").onclick = () => {
    const title = $("extTitle").value.trim();
    const body = $("extBody").value.trim();
    if (!title && !body) return;
    const rows = loadExtensions();
    rows.push({ title, body, page: $("extPage").value.trim() });
    saveExtensions(rows);
    $("extTitle").value = "";
    $("extBody").value = "";
    $("extPage").value = "";
    renderExtList();
  };
}

paintTables();
showPdfName();
renderExtList();
renderExperts([
  { title: "机械工程师", verdict: "warn", tag: "待计算", text: "先载入本机手册并检索。没有校对截面表之前，不出图号。" },
  { title: "工艺工程师", verdict: "warn", tag: "待计算", text: "双击 bat 打开本页即可。给设计院只引用带页码的手册原文。" },
  { title: "计算机工程师", verdict: "ok", tag: "手册在本机", text: "PDF 在本机建索引。扩展规格单独标注，不会和 DTⅡ 原文混在一起。" },
]);
