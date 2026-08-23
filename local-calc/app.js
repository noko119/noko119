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
  $("pdfName").textContent = localStorage.getItem(PDF_STORE) || "尚未选择";
}

$("pdfPick").onchange = () => {
  const f = $("pdfPick").files && $("pdfPick").files[0];
  if (!f) return;
  localStorage.setItem(PDF_STORE, f.name + "（仅本机记住文件名，文件没有上传）");
  showPdfName();
};

paintTables();
showPdfName();
renderExperts([
  { title: "机械工程师", verdict: "warn", tag: "待计算", text: "先点计算。没有校对截面表之前，不出图号。" },
  { title: "工艺工程师", verdict: "warn", tag: "待计算", text: "这页双击就能用，不要再去 Anaconda 里敲命令。" },
  { title: "计算机工程师", verdict: "ok", tag: "入口已改", text: "双击「打开本机计算.bat」或直接打开本 html。数据在本机。" },
]);
