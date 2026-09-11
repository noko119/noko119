const RHO_DEFAULT = 7.85;
const STORE_KEY = "belt-procure-v1";

const KINDS = [
  { id: "drum-drive", group: "drum", label: "主驱动滚筒" },
  { id: "drum-aux", group: "drum", label: "辅助驱动滚筒" },
  { id: "drum-bend", group: "drum", label: "改向滚筒" },
  { id: "drum-snub", group: "drum", label: "增面滚筒" },
  { id: "drum-takeup", group: "drum", label: "拉紧滚筒" },
  { id: "idler-trough", group: "idler", label: "槽形托辊" },
  { id: "idler-flat", group: "idler", label: "平行托辊" },
  { id: "idler-return", group: "idler", label: "下平行托辊" },
  { id: "idler-impact", group: "idler", label: "缓冲托辊" },
  { id: "idler-train", group: "idler", label: "调心托辊" },
  { id: "idler-comb", group: "idler", label: "梳形托辊" },
];

const PIPE_GB = [
  [89, 3.5], [89, 4], [108, 3.5], [108, 4], [108, 4.5],
  [133, 4], [133, 4.5], [133, 6], [159, 4.5], [159, 6], [159, 8],
  [194, 6], [194, 8], [219, 6], [219, 8], [219, 10],
  [273, 8], [273, 10], [273, 12], [325, 8], [325, 10], [325, 12],
  [377, 10], [377, 12], [426, 10], [426, 12], [478, 12], [478, 14],
  [530, 12], [530, 14], [630, 14], [630, 16], [800, 16], [800, 18],
  [1000, 16], [1000, 18], [1000, 20],
].map(([od, t]) => ({ id: `gb-${od}x${t}`, label: `GB Φ${od}×${t}`, od, t, sys: "GB" }));

const PIPE_ASTM = [
  ["4\" SCH40", 114.3, 6.02], ["5\" SCH40", 141.3, 6.55],
  ["6\" SCH40", 168.3, 7.11], ["6\" SCH80", 168.3, 10.97],
  ["8\" SCH40", 219.1, 8.18], ["8\" SCH80", 219.1, 12.7],
  ["10\" SCH40", 273.1, 9.27], ["10\" SCH80", 273.1, 15.09],
  ["12\" SCH40", 323.9, 9.53], ["12\" SCH80", 323.9, 17.48],
  ["14\" SCH40", 355.6, 9.53], ["16\" SCH40", 406.4, 9.53],
  ["18\" SCH40", 457, 9.53], ["20\" SCH40", 508, 9.53], ["24\" SCH40", 610, 9.53],
].map(([label, od, t]) => ({ id: `astm-${label}`, label: `ASTM ${label} (Φ${od}×${t})`, od, t, sys: "ASTM" }));

const BARS_GB = [20, 25, 30, 35, 40, 45, 50, 55, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 180, 200, 220, 250];
const BARS_IN = [0.75, 1, 1.25, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6];
const PLATES = [6, 8, 10, 12, 14, 16, 20, 25, 30, 36, 40, 50];
const MAT_PIPE = ["Q235B", "Q355B", "20#", "A36"];
const MAT_BAR = ["45#", "40Cr", "42CrMo", "Q235B", "4140"];
const MAT_PLATE = ["Q235B", "Q355B", "A36"];
const MAT_STD = ["GCr15", "尼龙", "丁腈", "碳钢", "不锈钢"];
const BEARINGS_IDLER = ["6204", "6205/C4", "6305/C4", "6306/C4", "6307/C4", "6308/C4", "6310"];
const BEARINGS_DRUM = ["22216", "22218", "22220", "22222", "22224", "22316", "22318", "22320", "22322", "22324"];
const CATS = { pipe: "钢管", bar: "圆钢", plate: "钢板", std: "标准件", bought: "外购件" };

const DEFAULT_PROCESS = {
  shaftEndAllow: 12,
  shaftDiaAllow: 4,
  pipeKerf: 5,
  pipeFaceAllow: 10,
  plateKerf: 4,
  plateScrapPct: 8,
  density: RHO_DEFAULT,
  stockPipe: 6000,
  stockBar: 6000,
};

let seq = 1;
function uid(prefix) {
  seq += 1;
  return `${prefix}-${seq}`;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function num(v, d = 0) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : d;
}

function round(v, n = 2) {
  const f = 10 ** n;
  return Math.round((v + Number.EPSILON) * f) / f;
}

function rho() {
  return num(state.process.density, RHO_DEFAULT) * 1e-6;
}

function pipeKg(od, t, Lmm) {
  if (od <= 0 || t <= 0 || Lmm <= 0) return 0;
  return Math.PI * (od - t) * t * Lmm * rho();
}

function barKg(d, Lmm) {
  if (d <= 0 || Lmm <= 0) return 0;
  return Math.PI * 0.25 * d * d * Lmm * rho();
}

function plateKg(L, W, t) {
  if (L <= 0 || W <= 0 || t <= 0) return 0;
  return L * W * t * rho();
}

function discNetKg(od, id, t) {
  if (od <= 0 || t <= 0) return 0;
  const inner = Math.max(id, 0);
  return Math.PI * 0.25 * (od * od - inner * inner) * t * rho();
}

const state = {
  process: { ...DEFAULT_PROCESS },
  orders: [],
  activeId: null,
};

function kindOf(id) {
  return KINDS.find((k) => k.id === id) || KINDS[0];
}

function emptyFinished(group) {
  if (group === "drum") {
    return { pipeOD: "", pipeT: "", pipeL: "", shaftD: "", shaftL: "", discT: "", discOD: "", discID: "", note: "" };
  }
  return { pipeOD: "", pipeT: "", pipeL: "", shaftD: "", shaftL: "", note: "" };
}

function bomRow(partial) {
  return {
    id: uid("b"),
    include: true,
    cat: "pipe",
    role: "custom",
    name: "",
    material: "Q235B",
    spec: "",
    od: "", t: "", d: "", length: "", width: "", thick: "",
    qtyPer: 1,
    note: "",
    ...partial,
  };
}

function templateBom(kindId) {
  const k = kindOf(kindId);
  if (k.group === "drum") {
    return [
      bomRow({ cat: "pipe", role: "shell", name: "筒皮", material: "Q235B", qtyPer: 1 }),
      bomRow({ cat: "bar", role: "shaft", name: "轴", material: "45#", qtyPer: 1 }),
      bomRow({ cat: "plate", role: "disc", name: "辐板", material: "Q235B", qtyPer: 2 }),
      bomRow({ cat: "plate", role: "hub", name: "轮毂", material: "Q235B", qtyPer: 2 }),
      bomRow({ cat: "std", role: "bearing", name: "调心滚子轴承", material: "GCr15", spec: "22220", qtyPer: 2 }),
      bomRow({ cat: "bought", role: "housing", name: "轴承座", material: "Q235B", spec: "焊制/铸钢 手选", qtyPer: 2 }),
      bomRow({ cat: "std", role: "seal", name: "密封", material: "丁腈", spec: "手选型号", qtyPer: 2 }),
      bomRow({ cat: "bought", role: "lagging", name: "包胶", material: "橡胶", spec: "光面/胶面/陶瓷 手选", qtyPer: 1, include: false }),
      bomRow({ cat: "std", role: "bolt", name: "螺栓组", material: "碳钢", spec: "M16 手选", qtyPer: 1 }),
    ];
  }
  const rows = [
    bomRow({ cat: "pipe", role: "shell", name: "管体", material: "Q235B", qtyPer: 1 }),
    bomRow({ cat: "bar", role: "shaft", name: "轴", material: "45#", qtyPer: 1 }),
    bomRow({ cat: "std", role: "bearing", name: "轴承", material: "GCr15", spec: "6205/C4", qtyPer: 2 }),
    bomRow({ cat: "bought", role: "housing", name: "冲压轴承座", material: "碳钢", spec: "按轴径手选", qtyPer: 2 }),
    bomRow({ cat: "std", role: "seal", name: "密封圈", material: "尼龙", spec: "手选", qtyPer: 4 }),
    bomRow({ cat: "std", role: "ring", name: "挡圈/卡簧", material: "碳钢", spec: "手选", qtyPer: 4 }),
  ];
  if (kindId === "idler-train") {
    rows.push(bomRow({ cat: "plate", role: "friction", name: "摩擦盘", material: "Q235B", qtyPer: 2 }));
  }
  if (kindId === "idler-impact") {
    rows.push(bomRow({ cat: "bought", role: "rubber", name: "缓冲胶圈", material: "橡胶", spec: "按辊径手选", qtyPer: 1 }));
  }
  if (kindId === "idler-comb") {
    rows.push(bomRow({ cat: "bought", role: "comb", name: "梳形圈", material: "橡胶", spec: "手选", qtyPer: 1 }));
  }
  return rows;
}

function suggestBearing(group, shaftD, pipeOD) {
  const d = num(shaftD);
  const od = num(pipeOD);
  if (group === "drum") {
    if (d >= 140) return "22324";
    if (d >= 120) return "22322";
    if (d >= 110) return "22222";
    if (d >= 100) return "22220";
    if (d >= 80) return "22218";
    return "22216";
  }
  if (d >= 35) return "6307/C4";
  if (d >= 30) return "6306/C4";
  if (od >= 159) return "6306/C4";
  if (od >= 133) return "6305/C4";
  return "6205/C4";
}

function newOrder(kindId, qty = 1) {
  const k = kindOf(kindId);
  return {
    id: uid("o"),
    kindId: k.id,
    name: k.label,
    qty,
    finished: emptyFinished(k.group),
    bom: templateBom(k.id),
  };
}

function activeOrder() {
  return state.orders.find((o) => o.id === state.activeId) || null;
}

function applyFinished(order) {
  const f = order.finished;
  const group = kindOf(order.kindId).group;
  const p = state.process;
  const pipeBlank = num(f.pipeL) + num(p.pipeKerf) + num(p.pipeFaceAllow);
  const barBlankL = num(f.shaftL) + 2 * num(p.shaftEndAllow);
  const barBlankD = num(f.shaftD) ? num(f.shaftD) + num(p.shaftDiaAllow) : "";
  const discBlank = num(f.discOD) ? num(f.discOD) + num(p.plateKerf) : "";
  order.bom.forEach((row) => {
    if (row.role === "shell") {
      row.od = f.pipeOD; row.t = f.pipeT; row.length = pipeBlank || f.pipeL;
      row.spec = specPipe(row.od, row.t);
    } else if (row.role === "shaft") {
      row.d = barBlankD || f.shaftD; row.length = barBlankL || f.shaftL;
      row.spec = specBar(row.d);
    } else if (row.role === "disc") {
      row.thick = f.discT; row.od = f.discOD; row.d = f.discID;
      row.length = discBlank; row.width = discBlank;
      row.spec = specPlate(row.thick);
    } else if (row.role === "hub") {
      row.thick = f.discT || row.thick;
      row.spec = specPlate(row.thick);
    } else if (row.role === "friction") {
      row.thick = row.thick || 8;
      row.od = row.od || (num(f.pipeOD) ? round(num(f.pipeOD) * 1.85) : "");
      row.spec = specPlate(row.thick);
    } else if (row.role === "bearing") {
      row.spec = suggestBearing(group, f.shaftD, f.pipeOD);
    }
  });
}

function specPipe(od, t) {
  if (!num(od) || !num(t)) return "";
  return `Φ${num(od)}×${num(t)}`;
}
function specBar(d) {
  if (!num(d)) return "";
  return `Φ${num(d)}`;
}
function specPlate(t) {
  if (!num(t)) return "";
  return `t${num(t)}`;
}

function pipeOptions() {
  return [{ id: "", label: "手填 / 自定义" }]
    .concat(PIPE_GB)
    .concat(PIPE_ASTM);
}

function barOptions() {
  const gb = BARS_GB.map((d) => ({ id: `gb-${d}`, label: `GB Φ${d}`, d }));
  const astm = BARS_IN.map((inch) => {
    const d = round(inch * 25.4, 1);
    return { id: `in-${inch}`, label: `英制 ${inch}" (Φ${d})`, d };
  });
  return [{ id: "", label: "手填 / 自定义", d: "" }].concat(gb, astm);
}

function plateOptions() {
  return [{ id: "", label: "手填 / 自定义" }].concat(
    PLATES.map((t) => ({ id: `t-${t}`, label: `${t} mm`, t }))
  );
}

function rowCalc(row, orderQty) {
  const qty = num(row.qtyPer) * num(orderQty);
  const p = state.process;
  let blankL = 0;
  let blankW = 0;
  let netKg = 0;
  let buyKg = 0;
  let extra = "";
  if (!row.include || qty <= 0) {
    return { qty: 0, blankL: 0, blankW: 0, netKg: 0, buyKg: 0, extra: "", ok: false };
  }
  if (row.cat === "pipe") {
    const L = num(row.length);
    blankL = L * qty;
    netKg = pipeKg(num(row.od), num(row.t), L) * qty;
    buyKg = netKg;
    extra = num(row.od) && num(row.t) ? `Φ${num(row.od)}×${num(row.t)}` : "未填外径/壁厚";
  } else if (row.cat === "bar") {
    const L = num(row.length);
    blankL = L * qty;
    netKg = barKg(num(row.d), L) * qty;
    buyKg = netKg;
    extra = num(row.d) ? `Φ${num(row.d)}` : "未填直径";
  } else if (row.cat === "plate") {
    const t = num(row.thick);
    const hasRect = num(row.length) > 0 && num(row.width) > 0;
    if (hasRect) {
      blankL = num(row.length);
      blankW = num(row.width);
      netKg = plateKg(blankL, blankW, t) * qty;
    } else {
      netKg = discNetKg(num(row.od), num(row.d), t) * qty;
      const side = num(row.od) + num(p.plateKerf);
      blankL = side;
      blankW = side;
    }
    buyKg = netKg * (1 + num(p.plateScrapPct) / 100);
    extra = t ? `t${t}` : "未填板厚";
  } else {
    extra = row.spec || "手选规格";
  }
  const ok = row.cat === "std" || row.cat === "bought"
    ? Boolean(row.name)
    : netKg > 0 || (row.cat === "plate" && num(row.thick) > 0);
  return { qty, blankL, blankW, netKg, buyKg, extra, ok };
}

function mergeKey(row) {
  if (row.cat === "pipe") return ["pipe", row.material, num(row.od), num(row.t)].join("|");
  if (row.cat === "bar") return ["bar", row.material, num(row.d)].join("|");
  if (row.cat === "plate") return ["plate", row.material, num(row.thick)].join("|");
  return [row.cat, row.name, row.spec, row.material].join("|");
}

function summarize() {
  const groups = { pipe: [], bar: [], plate: [], std: [], bought: [] };
  const map = {};
  state.orders.forEach((order) => {
    order.bom.forEach((row) => {
      if (!row.include) return;
      const c = rowCalc(row, order.qty);
      if (c.qty <= 0) return;
      const key = mergeKey(row);
      if (!map[key]) {
        map[key] = {
          cat: row.cat,
          name: row.name,
          material: row.material,
          spec: row.spec || c.extra,
          od: num(row.od), t: num(row.t), d: num(row.d), thick: num(row.thick),
          qty: 0, blankL: 0, area: 0, netKg: 0, buyKg: 0,
          notes: [],
        };
        groups[row.cat].push(map[key]);
      }
      const g = map[key];
      g.qty += c.qty;
      g.blankL += c.blankL;
      if (row.cat === "plate") {
        const pieceArea = (num(row.length) > 0 && num(row.width) > 0)
          ? num(row.length) * num(row.width)
          : (num(row.od) + num(state.process.plateKerf)) ** 2;
        g.area += pieceArea * c.qty / 1e6;
      }
      g.netKg += c.netKg;
      g.buyKg += c.buyKg;
      g.notes.push(`${order.name}×${order.qty}`);
    });
  });
  Object.values(groups).forEach((arr) => arr.sort((a, b) => a.spec.localeCompare(b.spec, "zh")));
  const stockPipe = num(state.process.stockPipe, 6000);
  const stockBar = num(state.process.stockBar, 6000);
  groups.pipe.forEach((g) => {
    g.sticks = stockPipe > 0 ? Math.ceil(g.blankL / stockPipe) : 0;
    g.stockM = round(stockPipe / 1000, 1);
  });
  groups.bar.forEach((g) => {
    g.sticks = stockBar > 0 ? Math.ceil(g.blankL / stockBar) : 0;
    g.stockM = round(stockBar / 1000, 1);
  });
  return groups;
}

function totalsOf(groups) {
  const pipeL = groups.pipe.reduce((s, g) => s + g.blankL, 0);
  const pipeKg = groups.pipe.reduce((s, g) => s + g.buyKg, 0);
  const barKg = groups.bar.reduce((s, g) => s + g.buyKg, 0);
  const plateKg = groups.plate.reduce((s, g) => s + g.buyKg, 0);
  const plateA = groups.plate.reduce((s, g) => s + g.area, 0);
  const stdN = groups.std.reduce((s, g) => s + g.qty, 0) + groups.bought.reduce((s, g) => s + g.qty, 0);
  return { pipeL, pipeKg, barKg, plateKg, plateA, stdN };
}

function optionHtml(list, value, labelKey = "label", valueKey = "id") {
  return list.map((it) => {
    const v = typeof it === "string" ? it : it[valueKey];
    const lab = typeof it === "string" ? it : it[labelKey];
    const sel = String(v) === String(value) ? "selected" : "";
    return `<option value="${esc(v)}" ${sel}>${esc(lab)}</option>`;
  }).join("");
}

function restoreFocus(fn) {
  const ae = document.activeElement;
  const id = ae && ae.id;
  const start = ae && ae.selectionStart;
  const end = ae && ae.selectionEnd;
  fn();
  if (id) {
    const el = document.getElementById(id);
    if (el) {
      el.focus();
      if (typeof start === "number" && el.setSelectionRange) {
        try { el.setSelectionRange(start, end); } catch (_) { /* ignore */ }
      }
    }
  }
}

function renderProcess() {
  const p = state.process;
  const fields = [
    ["shaftEndAllow", "轴端余量 mm/端", "车端面、打中心孔"],
    ["shaftDiaAllow", "轴径余量 mm", "圆钢下料直径加大"],
    ["pipeKerf", "管切断锯缝 mm", "每根切断"],
    ["pipeFaceAllow", "筒体端面加工 mm", "车端面"],
    ["plateKerf", "板材割缝 mm", "等离子/火焰"],
    ["plateScrapPct", "板材损耗 %", "整板套料损耗"],
    ["density", "密度 g/cm³", "默认 7.85"],
    ["stockPipe", "钢管定尺 mm", "用于折算根数"],
    ["stockBar", "圆钢定尺 mm", "用于折算根数"],
  ];
  document.getElementById("processFields").innerHTML = fields.map(([key, lab, hint]) => `
    <div>
      <label>${esc(lab)}</label>
      <input id="proc-${key}" type="number" step="0.1" value="${esc(p[key])}" data-proc="${key}" />
      <div class="hint">${esc(hint)}</div>
    </div>
  `).join("");
}

function renderOrders() {
  if (!state.orders.length) {
    document.getElementById("orderTable").innerHTML = `<div class="empty">还没有订单。点「+ 滚筒」或「+ 托辊」开始。</div>`;
    return;
  }
  document.getElementById("orderTable").innerHTML = `
    <table>
      <thead><tr>
        <th>名称</th><th>类型</th><th class="tiny">数量</th><th>成品摘要</th><th>已勾选部件</th><th></th>
      </tr></thead>
      <tbody>
        ${state.orders.map((o) => {
          const k = kindOf(o.kindId);
          const f = o.finished;
          const sum = f.pipeOD ? `Φ${f.pipeOD}×${f.pipeT || "?"} L${f.pipeL || "?"} / 轴Φ${f.shaftD || "?"}` : "未填成品尺寸";
          const n = o.bom.filter((b) => b.include).length;
          const sel = o.id === state.activeId ? "selected" : "";
          return `<tr class="${sel}" data-open="${o.id}">
            <td><input id="name-${o.id}" value="${esc(o.name)}" data-order="${o.id}" data-field="name" /></td>
            <td><select id="kind-${o.id}" data-order="${o.id}" data-field="kindId">${optionHtml(KINDS, o.kindId, "label", "id")}</select></td>
            <td><input id="qty-${o.id}" class="tiny" type="number" min="1" step="1" value="${esc(o.qty)}" data-order="${o.id}" data-field="qty" /></td>
            <td class="muted">${esc(sum)}</td>
            <td>${n} / ${o.bom.length}</td>
            <td>
              <button data-open="${o.id}">手选部件</button>
              <button data-dup="${o.id}">复制</button>
              <button class="danger" data-del="${o.id}">删</button>
            </td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
  `;
}

function renderEditor() {
  const order = activeOrder();
  const empty = document.getElementById("editorEmpty");
  const body = document.getElementById("editorBody");
  if (!order) {
    empty.hidden = false;
    body.hidden = true;
    return;
  }
  empty.hidden = true;
  body.hidden = false;
  const k = kindOf(order.kindId);
  const f = order.finished;
  document.getElementById("editorTitle").innerHTML = `2. ${esc(order.name)} × ${esc(order.qty)} · 部件手选/填写 <span class="hint">未勾选不进采购清单</span>`;
  const drum = k.group === "drum";
  const fields = [
    ["pipeOD", "管/筒外径 mm"],
    ["pipeT", "壁厚 mm"],
    ["pipeL", "成品管长 mm"],
    ["shaftD", "成品轴径 mm"],
    ["shaftL", "成品轴长 mm"],
  ];
  if (drum) {
    fields.push(["discT", "辐板厚 mm"], ["discOD", "辐板外径 mm"], ["discID", "辐板内孔 mm"]);
  }
  fields.push(["note", "备注"]);
  document.getElementById("finishedFields").innerHTML = fields.map(([key, lab]) => `
    <div class="${key === "note" ? "full" : ""}">
      <label>${esc(lab)}</label>
      <input id="fin-${order.id}-${key}" value="${esc(f[key] ?? "")}" data-fin="${key}" />
    </div>
  `).join("");
  const p = state.process;
  document.getElementById("allowHint").textContent =
    `预填时：轴长 +${2 * num(p.shaftEndAllow)} mm，轴径 +${num(p.shaftDiaAllow)} mm，管长 +${num(p.pipeKerf) + num(p.pipeFaceAllow)} mm，板边 +${num(p.plateKerf)} mm，板重另加 ${num(p.plateScrapPct)}%。`;
  renderBom(order);
}

function specSelect(row) {
  if (row.cat === "pipe") {
    const cur = PIPE_GB.concat(PIPE_ASTM).find((x) => x.od == row.od && x.t == row.t);
    return `<select data-bom="${row.id}" data-bf="preset">${optionHtml(pipeOptions(), cur ? cur.id : "")}</select>`;
  }
  if (row.cat === "bar") {
    const cur = barOptions().find((x) => x.d && Number(x.d) === num(row.d));
    return `<select data-bom="${row.id}" data-bf="preset">${optionHtml(barOptions(), cur ? cur.id : "")}</select>`;
  }
  if (row.cat === "plate") {
    const cur = plateOptions().find((x) => x.t && Number(x.t) === num(row.thick));
    return `<select data-bom="${row.id}" data-bf="preset">${optionHtml(plateOptions(), cur ? cur.id : "")}</select>`;
  }
  if (row.role === "bearing") {
    const list = ["手选"].concat(BEARINGS_IDLER, BEARINGS_DRUM);
    const val = row.spec && list.includes(row.spec) ? row.spec : "手选";
    return `<select data-bom="${row.id}" data-bf="preset">${optionHtml(list, val)}</select>`;
  }
  return `<span class="muted">手填规格</span>`;
}

function matList(row) {
  let base = MAT_STD.concat(["橡胶", "Q235B"]);
  if (row.cat === "pipe") base = MAT_PIPE.slice();
  else if (row.cat === "bar") base = MAT_BAR.slice();
  else if (row.cat === "plate") base = MAT_PLATE.slice();
  if (row.material && !base.includes(row.material)) base.unshift(row.material);
  return base;
}

function dimInputs(row) {
  if (row.cat === "pipe") {
    return `Φ<input id="od-${row.id}" class="tiny" data-bom="${row.id}" data-bf="od" value="${esc(row.od)}" />×
      <input id="t-${row.id}" class="tiny" data-bom="${row.id}" data-bf="t" value="${esc(row.t)}" />
      长<input id="L-${row.id}" class="tiny" data-bom="${row.id}" data-bf="length" value="${esc(row.length)}" />`;
  }
  if (row.cat === "bar") {
    return `Φ<input id="d-${row.id}" class="tiny" data-bom="${row.id}" data-bf="d" value="${esc(row.d)}" />
      长<input id="L-${row.id}" class="tiny" data-bom="${row.id}" data-bf="length" value="${esc(row.length)}" />`;
  }
  if (row.cat === "plate") {
    return `t<input id="th-${row.id}" class="tiny" data-bom="${row.id}" data-bf="thick" value="${esc(row.thick)}" />
      下料<input id="L-${row.id}" class="tiny" data-bom="${row.id}" data-bf="length" value="${esc(row.length)}" />×
      <input id="W-${row.id}" class="tiny" data-bom="${row.id}" data-bf="width" value="${esc(row.width)}" />
      <div class="hint">圆板可填 外径/内孔 推算：Φ<input id="pod-${row.id}" class="tiny" data-bom="${row.id}" data-bf="od" value="${esc(row.od)}" /> /
      <input id="pid-${row.id}" class="tiny" data-bom="${row.id}" data-bf="d" value="${esc(row.d)}" /></div>`;
  }
  return `<input id="sp-${row.id}" data-bom="${row.id}" data-bf="spec" value="${esc(row.spec)}" placeholder="型号/规格手填" />`;
}

function renderBom(order) {
  const qty = num(order.qty, 1);
  document.getElementById("bomTable").innerHTML = `
    <table>
      <thead><tr>
        <th class="check">采</th><th>名称</th><th>类别</th><th>规格库</th><th>材质</th>
        <th>件/台</th><th>下料尺寸（可改）</th><th>本项合计</th><th></th>
      </tr></thead>
      <tbody>
        ${order.bom.map((row) => {
          const c = rowCalc(row, qty);
          const dim = c.qty
            ? (row.cat === "std" || row.cat === "bought"
              ? `${c.qty} 件`
              : `${c.qty} 件 · ${round(c.buyKg, 1)} kg`)
            : "—";
          const miss = row.include && !c.ok ? "warn-text" : "";
          return `<tr class="${row.include ? "" : "muted"}">
            <td class="check"><input type="checkbox" ${row.include ? "checked" : ""} data-bom="${row.id}" data-bf="include" /></td>
            <td><input id="bn-${row.id}" value="${esc(row.name)}" data-bom="${row.id}" data-bf="name" /></td>
            <td><select data-bom="${row.id}" data-bf="cat">${optionHtml(Object.entries(CATS).map(([id, label]) => ({ id, label })), row.cat)}</select></td>
            <td>${specSelect(row)}</td>
            <td><select data-bom="${row.id}" data-bf="material">${optionHtml(matList(row), row.material)}</select></td>
            <td><input id="q-${row.id}" class="tiny" type="number" min="0" step="1" value="${esc(row.qtyPer)}" data-bom="${row.id}" data-bf="qtyPer" /></td>
            <td>${dimInputs(row)}</td>
            <td class="${miss}">${esc(dim)}${row.include && !c.ok ? "<div class='warn-text'>规格未填全</div>" : ""}</td>
            <td><button class="danger" data-bom-del="${row.id}">删</button></td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
  `;
}

function renderSummary() {
  const groups = summarize();
  const t = totalsOf(groups);
  document.getElementById("totals").innerHTML = `
    <div class="total"><span>钢管下料总长 / 重量</span><b>${round(t.pipeL / 1000, 2)} m · ${round(t.pipeKg, 1)} kg</b></div>
    <div class="total"><span>圆钢重量</span><b>${round(t.barKg, 1)} kg</b></div>
    <div class="total"><span>钢板面积 / 重量（含损耗）</span><b>${round(t.plateA, 2)} m² · ${round(t.plateKg, 1)} kg</b></div>
    <div class="total"><span>标准件 + 外购件</span><b>${t.stdN} 件</b></div>
  `;
  const stockHint = (g) => g.sticks
    ? `建议 ${g.stockM} m 定尺 ${g.sticks} 根（${round(g.sticks * g.stockM, 1)} m）`
    : "";
  const table = (title, rows, cols) => {
    if (!rows.length) return `<p class="muted">${title}：无（未勾选或未填规格）</p>`;
    return `<h3>${title}</h3>
      <div class="table-wrap"><table>
        <thead><tr>${cols.map((c) => `<th>${c}</th>`).join("")}</tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`;
  };
  const pipeRows = groups.pipe.map((g) => `<tr>
    <td>${esc(g.spec || `Φ${g.od}×${g.t}`)}</td><td>${esc(g.material)}</td>
    <td class="num">${round(g.blankL / 1000, 2)}</td>
    <td class="num">${round(g.netKg, 1)}</td><td class="num">${round(g.buyKg, 1)}</td>
    <td>${esc(stockHint(g))}</td>
  </tr>`).join("");
  const barRows = groups.bar.map((g) => `<tr>
    <td>${esc(g.spec || `Φ${g.d}`)}</td><td>${esc(g.material)}</td>
    <td class="num">${round(g.blankL / 1000, 2)}</td>
    <td class="num">${round(g.buyKg, 1)}</td>
    <td>${esc(stockHint(g))}</td>
  </tr>`).join("");
  const plateRows = groups.plate.map((g) => `<tr>
    <td>${esc(g.spec || `t${g.thick}`)}</td><td>${esc(g.material)}</td>
    <td class="num">${round(g.area, 2)}</td>
    <td class="num">${round(g.netKg, 1)}</td><td class="num">${round(g.buyKg, 1)}</td>
  </tr>`).join("");
  const stdRows = groups.std.concat(groups.bought).map((g) => `<tr>
    <td>${esc(g.name)}</td><td>${esc(g.spec)}</td><td>${esc(g.material)}</td>
    <td class="num">${g.qty}</td><td>${esc(CATS[g.cat])}</td>
  </tr>`).join("");
  document.getElementById("summaryTables").innerHTML = [
    table("钢管", pipeRows, ["规格", "材质", "下料总长 m", "净重 kg", "采购重 kg", "定尺建议"]),
    table("圆钢", barRows, ["规格", "材质", "下料总长 m", "采购重 kg", "定尺建议"]),
    table("钢板", plateRows, ["规格", "材质", "下料面积 m²", "净重 kg", "含损耗 kg"]),
    table("标准件 / 外购件", stdRows, ["名称", "规格", "材质", "数量", "类别"]),
  ].join("");
}

function render() {
  restoreFocus(() => {
    renderProcess();
    renderOrders();
    renderEditor();
    renderSummary();
  });
}

function persist() {
  localStorage.setItem(STORE_KEY, JSON.stringify({ process: state.process, orders: state.orders, seq }));
}

function loadStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (data.process) state.process = { ...DEFAULT_PROCESS, ...data.process };
    if (Array.isArray(data.orders)) state.orders = data.orders;
    if (data.seq) seq = data.seq;
    return true;
  } catch (_) {
    return false;
  }
}

function loadDemo() {
  const d1 = newOrder("drum-drive", 2);
  d1.finished = { pipeOD: 800, pipeT: 16, pipeL: 1150, shaftD: 140, shaftL: 1850, discT: 16, discOD: 760, discID: 180, note: "主驱胶面" };
  applyFinished(d1);
  const d2 = newOrder("drum-bend", 4);
  d2.finished = { pipeOD: 630, pipeT: 12, pipeL: 1150, shaftD: 110, shaftL: 1650, discT: 12, discOD: 600, discID: 150, note: "" };
  applyFinished(d2);
  const i1 = newOrder("idler-trough", 200);
  i1.finished = { pipeOD: 133, pipeT: 4.5, pipeL: 530, shaftD: 25, shaftL: 580, note: "B1000 槽形" };
  applyFinished(i1);
  const i2 = newOrder("idler-train", 20);
  i2.name = "摩擦下调心托辊";
  i2.finished = { pipeOD: 159, pipeT: 6, pipeL: 1000, shaftD: 30, shaftL: 1034, note: "180C661M" };
  applyFinished(i2);
  state.orders = [d1, d2, i1, i2];
  state.activeId = d1.id;
}

function textReport() {
  const groups = summarize();
  const t = totalsOf(groups);
  const lines = [
    "皮带机滚筒/托辊原料采购清单",
    `钢管 ${round(t.pipeL / 1000, 2)} m / ${round(t.pipeKg, 1)} kg`,
    `圆钢 ${round(t.barKg, 1)} kg`,
    `钢板 ${round(t.plateA, 2)} m² / ${round(t.plateKg, 1)} kg（含损耗 ${state.process.plateScrapPct}%）`,
    "",
    "【钢管】规格\t材质\t总长m\t重量kg",
    ...groups.pipe.map((g) => `${g.spec}\t${g.material}\t${round(g.blankL / 1000, 2)}\t${round(g.buyKg, 1)}`),
    "",
    "【圆钢】规格\t材质\t总长m\t重量kg",
    ...groups.bar.map((g) => `${g.spec}\t${g.material}\t${round(g.blankL / 1000, 2)}\t${round(g.buyKg, 1)}`),
    "",
    "【钢板】规格\t材质\t面积m²\t含损耗kg",
    ...groups.plate.map((g) => `${g.spec}\t${g.material}\t${round(g.area, 2)}\t${round(g.buyKg, 1)}`),
    "",
    "【标准件/外购件】名称\t规格\t材质\t数量",
    ...groups.std.concat(groups.bought).map((g) => `${g.name}\t${g.spec}\t${g.material}\t${g.qty}`),
  ];
  return lines.join("\n");
}

function csvReport() {
  const groups = summarize();
  const rows = [["类别", "名称", "规格", "材质", "数量或长度", "重量kg", "备注"]];
  groups.pipe.forEach((g) => rows.push(["钢管", g.spec, `Φ${g.od}×${g.t}`, g.material, `${round(g.blankL / 1000, 2)} m`, round(g.buyKg, 1), g.sticks ? `${g.stockM}m×${g.sticks}` : ""]));
  groups.bar.forEach((g) => rows.push(["圆钢", g.spec, `Φ${g.d}`, g.material, `${round(g.blankL / 1000, 2)} m`, round(g.buyKg, 1), g.sticks ? `${g.stockM}m×${g.sticks}` : ""]));
  groups.plate.forEach((g) => rows.push(["钢板", g.spec, `t${g.thick}`, g.material, `${round(g.area, 2)} m²`, round(g.buyKg, 1), `含损耗${state.process.plateScrapPct}%`]));
  groups.std.concat(groups.bought).forEach((g) => rows.push([CATS[g.cat], g.name, g.spec, g.material, g.qty, "", ""]));
  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
}

function findOrder(id) {
  return state.orders.find((o) => o.id === id);
}
function findRow(id) {
  const o = activeOrder();
  return o ? o.bom.find((b) => b.id === id) : null;
}

function applyPreset(row, presetId) {
  if (!presetId || presetId === "手选") return;
  const pipe = PIPE_GB.concat(PIPE_ASTM).find((x) => x.id === presetId);
  if (pipe) { row.od = pipe.od; row.t = pipe.t; row.spec = pipe.label; return; }
  const bar = barOptions().find((x) => x.id === presetId);
  if (bar && bar.d) { row.d = bar.d; row.spec = bar.label; return; }
  const plate = plateOptions().find((x) => x.id === presetId);
  if (plate && plate.t) { row.thick = plate.t; row.spec = plate.label; return; }
  if (BEARINGS_IDLER.includes(presetId) || BEARINGS_DRUM.includes(presetId)) {
    row.spec = presetId;
  }
}

function addBom(cat) {
  const o = activeOrder();
  if (!o) return;
  const names = { pipe: "钢管", bar: "圆钢", plate: "钢板", std: "标准件", bought: "外购件" };
  const mats = { pipe: "Q235B", bar: "45#", plate: "Q235B", std: "GCr15", bought: "碳钢" };
  o.bom.push(bomRow({ cat, name: names[cat], material: mats[cat], qtyPer: 1 }));
  render();
  persist();
}

document.addEventListener("input", (e) => {
  const proc = e.target.dataset.proc;
  if (proc) {
    state.process[proc] = num(e.target.value, 0);
    restoreFocus(() => { renderEditor(); renderSummary(); });
    persist();
    return;
  }
  const oid = e.target.dataset.order;
  if (oid) {
    const o = findOrder(oid);
    if (!o) return;
    const field = e.target.dataset.field;
    o[field] = field === "qty" ? num(e.target.value, 1) : e.target.value;
    restoreFocus(() => { renderEditor(); renderSummary(); renderOrders(); });
    persist();
    return;
  }
  const fin = e.target.dataset.fin;
  if (fin) {
    const o = activeOrder();
    if (!o) return;
    o.finished[fin] = e.target.value;
    restoreFocus(() => { renderOrders(); renderSummary(); });
    persist();
    return;
  }
  const bid = e.target.dataset.bom;
  if (bid && e.target.dataset.bf) {
    const row = findRow(bid);
    if (!row) return;
    const f = e.target.dataset.bf;
    if (f === "include") row.include = e.target.checked;
    else if (f === "preset") applyPreset(row, e.target.value);
    else if (f === "qtyPer") row.qtyPer = num(e.target.value, 0);
    else row[f] = e.target.type === "number" ? num(e.target.value, 0) : e.target.value;
    restoreFocus(() => { renderBom(activeOrder()); renderSummary(); renderOrders(); });
    persist();
  }
});

document.addEventListener("change", (e) => {
  if (e.target.dataset.field === "kindId") {
    const o = findOrder(e.target.dataset.order);
    if (!o) return;
    o.kindId = e.target.value;
    o.name = kindOf(o.kindId).label;
    o.finished = { ...emptyFinished(kindOf(o.kindId).group), note: o.finished.note || "" };
    o.bom = templateBom(o.kindId);
    state.activeId = o.id;
    render();
    persist();
  }
});

document.addEventListener("click", (e) => {
  const open = e.target.dataset.open || e.target.closest?.("[data-open]")?.dataset.open;
  if (open && !e.target.dataset.del && !e.target.dataset.dup && e.target.dataset.field == null && !e.target.closest("input,select")) {
    state.activeId = open;
    render();
    return;
  }
  const del = e.target.dataset.del;
  if (del) {
    state.orders = state.orders.filter((o) => o.id !== del);
    if (state.activeId === del) state.activeId = state.orders[0]?.id || null;
    render(); persist(); return;
  }
  const dup = e.target.dataset.dup;
  if (dup) {
    const o = findOrder(dup);
    if (!o) return;
    const copy = JSON.parse(JSON.stringify(o));
    copy.id = uid("o");
    copy.name = `${o.name} 副本`;
    copy.bom.forEach((b) => { b.id = uid("b"); });
    state.orders.push(copy);
    state.activeId = copy.id;
    render(); persist(); return;
  }
  const bdel = e.target.dataset.bomDel;
  if (bdel) {
    const o = activeOrder();
    if (!o) return;
    o.bom = o.bom.filter((b) => b.id !== bdel);
    render(); persist();
  }
});

document.getElementById("addDrum").onclick = () => {
  const o = newOrder("drum-drive", 1);
  state.orders.push(o);
  state.activeId = o.id;
  render(); persist();
};
document.getElementById("addIdler").onclick = () => {
  const o = newOrder("idler-trough", 1);
  state.orders.push(o);
  state.activeId = o.id;
  render(); persist();
};
document.getElementById("loadDemo").onclick = () => { loadDemo(); render(); persist(); };
document.getElementById("clearOrders").onclick = () => {
  state.orders = [];
  state.activeId = null;
  render(); persist();
};
document.getElementById("fillBom").onclick = () => {
  const o = activeOrder();
  if (!o) return;
  applyFinished(o);
  render(); persist();
};
document.getElementById("addPipe").onclick = () => addBom("pipe");
document.getElementById("addBar").onclick = () => addBom("bar");
document.getElementById("addPlate").onclick = () => addBom("plate");
document.getElementById("addStd").onclick = () => addBom("std");
document.getElementById("addBought").onclick = () => addBom("bought");

document.getElementById("copyBtn").onclick = async () => {
  const text = textReport();
  try {
    await navigator.clipboard.writeText(text);
    document.getElementById("saveMsg").textContent = "已复制";
  } catch (_) {
    const ta = document.createElement("textarea");
    ta.value = text; document.body.appendChild(ta); ta.select();
    document.execCommand("copy"); ta.remove();
    document.getElementById("saveMsg").textContent = "已复制";
  }
};
document.getElementById("csvBtn").onclick = () => {
  const blob = new Blob(["\uFEFF" + csvReport()], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "原料采购清单.csv";
  a.click();
};
document.getElementById("printBtn").onclick = () => window.print();
document.getElementById("saveBtn").onclick = () => {
  persist();
  document.getElementById("saveMsg").textContent = "已写入本机浏览器";
};
document.getElementById("loadBtn").onclick = () => {
  loadStore();
  render();
  document.getElementById("saveMsg").textContent = "已读取";
};

if (!loadStore()) {
  render();
} else {
  render();
}
