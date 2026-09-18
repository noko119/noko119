import {
  computeThread,
  defaultPitch,
  listCommonSpecs,
  parseThreadSpec,
} from "./thread-math.js";

const $ = (id) => document.getElementById(id);

const specInput = $("specInput");
const dInput = $("dInput");
const pInput = $("pInput");
const grooveLen = $("grooveLen");
const statusEl = $("status");
const results = $("results");
const quickChips = $("quickChips");

let syncing = false;
let lastResult = null;

function setStatus(msg, kind = "") {
  statusEl.textContent = msg || "";
  statusEl.className = `status${kind ? ` ${kind}` : ""}`;
}

function fillTable(tbody, rows) {
  tbody.innerHTML = rows
    .map(
      ([k, v]) =>
        `<tr><th scope="row">${k}</th><td>${formatVal(v)}</td></tr>`
    )
    .join("");
}

function formatVal(v) {
  if (typeof v === "number") return `${trim(v)} mm`;
  return String(v);
}

function trim(n) {
  const s = String(Number(Number(n).toFixed(3)));
  if (!s.includes(".")) return s;
  return s.replace(/\.?0+$/, "");
}

function renderDiagram(r) {
  const svg = $("threadSvg");
  const P = r.pitch;
  const crestE = r.basic.external.crest;
  const rootE = r.basic.external.root;
  const crestI = r.basic.internal.crest;
  const rootI = r.basic.internal.root;
  const gW = r.undercut.external.width;
  const gD = r.undercut.external.diameter;

  const yMaj = 72;
  const yMin = 128;
  const yAxis = 198;
  const pitchPx = 34;
  const toothCount = 7;
  const startX = 72;

  const pts = [];
  for (let i = 0; i <= toothCount; i++) {
    const x = startX + i * pitchPx;
    pts.push([x, yMaj]);
    if (i < toothCount) pts.push([x + pitchPx / 2, yMin]);
  }
  const threadEnd = startX + toothCount * pitchPx;
  const grooveStart = threadEnd + 10;
  const grooveEnd = grooveStart + Math.max(30, gW * 9);
  const yGroove = yMin + 10;
  const poly = pts.map(([x, y]) => `${x},${y}`).join(" ");
  const pathTeeth = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x} ${y}`).join(" ");

  svg.innerHTML = `
    <defs>
      <linearGradient id="shaftGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#d7e4de"/>
        <stop offset="100%" stop-color="#b7ccc3"/>
      </linearGradient>
    </defs>
    <text x="24" y="28" fill="#2f4a56" font-size="14" font-weight="700">${r.designation} 剖面示意（示意比例）</text>

    <path d="${pathTeeth}
      L ${grooveStart} ${yMaj}
      L ${grooveStart} ${yGroove}
      Q ${(grooveStart + grooveEnd) / 2} ${yGroove + 10} ${grooveEnd} ${yGroove}
      L ${grooveEnd} ${yMaj}
      L 600 ${yMaj}
      L 600 ${yAxis}
      L 40 ${yAxis}
      L 40 ${yMaj}
      L ${startX} ${yMaj} Z" fill="url(#shaftGrad)" stroke="#2f4a56" stroke-width="1.5"/>

    <polyline points="${poly}" fill="none" stroke="#1f6f5b" stroke-width="2.2"/>

    <line x1="30" y1="${yAxis + 16}" x2="610" y2="${yAxis + 16}" stroke="#5c6b64" stroke-dasharray="6 5" stroke-width="1"/>

    <line x1="118" y1="${yMaj}" x2="118" y2="${yAxis}" stroke="#c45c26" stroke-width="1.2"/>
    <text x="126" y="${(yMaj + yAxis) / 2}" fill="#c45c26" font-size="12" font-weight="700">牙顶 d=${trim(crestE)}</text>

    <line x1="186" y1="${yMin}" x2="186" y2="${yAxis}" stroke="#1f6f5b" stroke-width="1.2"/>
    <text x="194" y="${(yMin + yAxis) / 2 + 4}" fill="#1f6f5b" font-size="12" font-weight="700">牙底 d3=${trim(rootE)}</text>

    <line x1="${grooveStart}" y1="${yGroove - 18}" x2="${grooveEnd}" y2="${yGroove - 18}" stroke="#2f4a56" stroke-width="1"/>
    <text x="${(grooveStart + grooveEnd) / 2 - 36}" y="${yGroove - 24}" fill="#2f4a56" font-size="12" font-weight="700">退刀槽 g=${trim(gW)}</text>
    <text x="${grooveEnd + 8}" y="${yGroove + 4}" fill="#2f4a56" font-size="12">df=${trim(gD)}</text>

    <text x="40" y="262" fill="#5c6b64" font-size="11">内螺纹：牙顶 D1=${trim(crestI)} · 牙底 D=${trim(rootI)} · P=${trim(P)}</text>
  `;
}

function render(r) {
  lastResult = r;
  results.hidden = false;
  $("desigTitle").textContent = r.designation;
  $("desigMeta").textContent = `公称直径 d=${trim(r.d)} mm · 螺距 P=${trim(r.pitch)} mm · ${
    r.isCoarse ? "粗牙" : "细牙"
  } · 牙型角 60°`;

  fillTable($("extTable"), [
    ["牙顶（大径 d）", r.basic.external.crest],
    ["牙底（小径 d3）", r.basic.external.root],
    ["基本小径 d1", r.basic.external.minorBasic],
    ["中径 d2", r.basic.external.pitch],
    ["基本三角高 H", r.basic.H],
  ]);

  fillTable($("intTable"), [
    ["牙顶（小径 D1）", r.basic.internal.crest],
    ["牙底（大径 D）", r.basic.internal.root],
    ["中径 D2", r.basic.internal.pitch],
    ["与外螺纹中径", "D2 = d2"],
  ]);

  const lenLabel =
    r.undercut.lengthKind === "short"
      ? "短 g2"
      : r.undercut.lengthKind === "long"
        ? "长 g3"
        : "普通 g1";

  fillTable($("extGroove"), [
    ["槽底直径 df", r.undercut.external.diameter],
    [`槽宽（${lenLabel}）`, r.undercut.external.width],
    ["圆角半径 r", r.undercut.external.radius],
    ["说明", r.undercut.external.note],
  ]);

  fillTable($("intGroove"), [
    ["槽底直径 Dg", r.undercut.internal.diameter],
    [`槽宽（${lenLabel}）`, r.undercut.internal.width],
    ["圆角半径 r", r.undercut.internal.radius],
    ["说明", r.undercut.internal.note],
  ]);

  fillTable($("machTable"), [
    ["外螺纹毛坯外径", r.machining.externalBlankOd],
    ["外螺纹车牙底参考", r.machining.externalRootTurning],
    ["内螺纹底孔 ≈ D1", r.machining.internalTapDrill],
    ["牙型角", `${r.machining.tipAngle}°`],
  ]);

  $("formulaList").innerHTML = Object.entries(r.formula)
    .map(([, v]) => `<li><code>${v}</code></li>`)
    .join("");

  renderDiagram(r);
}

function runCalc() {
  const raw = specInput.value.trim();
  const parsed = parseThreadSpec(raw);
  const d = Number(dInput.value);
  const pitch = Number(pInput.value);
  const lengthKind = grooveLen.value;

  // Prefer explicit d/P fields if valid; otherwise parse designation
  let result;
  if (Number.isFinite(d) && d > 0 && Number.isFinite(pitch) && pitch > 0) {
    result = computeThread({ ok: true, d, pitchGiven: pitch }, { d, pitch, lengthKind });
  } else if (parsed.ok) {
    result = computeThread(parsed, { lengthKind });
  } else {
    setStatus(parsed.error, "error");
    results.hidden = true;
    return;
  }

  if (!result.ok) {
    setStatus(result.error || "计算失败", "error");
    results.hidden = true;
    return;
  }

  syncing = true;
  specInput.value = result.designation;
  dInput.value = String(result.d);
  pInput.value = String(result.pitch);
  syncing = false;

  render(result);
  setStatus(`已生成 ${result.designation} 全套尺寸`, "ok");
  highlightChip(result.designation);
}

function highlightChip(desig) {
  quickChips.querySelectorAll(".chip").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.spec === desig || btn.dataset.spec === desig.replace("×", "x"));
  });
}

function syncFromSpec() {
  if (syncing) return;
  const parsed = parseThreadSpec(specInput.value);
  if (!parsed.ok) return;
  syncing = true;
  dInput.value = String(parsed.d);
  pInput.value = String(parsed.pitchGiven ?? defaultPitch(parsed.d));
  syncing = false;
}

function syncFromFields() {
  if (syncing) return;
  const d = Number(dInput.value);
  const p = Number(pInput.value);
  if (!(d > 0) || !(p > 0)) return;
  const coarse = defaultPitch(d);
  const desig =
    Math.abs(p - coarse) < 1e-9 ? `M${trim(d)}` : `M${trim(d)}×${trim(p)}`;
  syncing = true;
  specInput.value = desig;
  syncing = false;
}

function buildChips() {
  const picks = [6, 8, 10, 12, 16, 20, 24, 30, 36, 42];
  const all = listCommonSpecs().filter((s) => picks.includes(s.d));
  // also a few fine examples
  const extras = [
    { label: "M20×1.5", d: 20, pitch: 1.5 },
    { label: "M16×1.5", d: 16, pitch: 1.5 },
    { label: "M10×1", d: 10, pitch: 1 },
  ];
  const items = [
    ...all.map((s) => ({ label: s.label, d: s.d, pitch: s.pitch })),
    ...extras,
  ];
  quickChips.innerHTML = items
    .map(
      (s) =>
        `<button type="button" class="chip" data-spec="${s.label}" data-d="${s.d}" data-p="${s.pitch}">${s.label}</button>`
    )
    .join("");

  quickChips.addEventListener("click", (e) => {
    const btn = e.target.closest(".chip");
    if (!btn) return;
    syncing = true;
    specInput.value = btn.dataset.spec;
    dInput.value = btn.dataset.d;
    pInput.value = btn.dataset.p;
    syncing = false;
    runCalc();
  });
}

async function copyResult() {
  if (!lastResult) {
    setStatus("请先生成数据", "error");
    return;
  }
  const r = lastResult;
  const text = [
    `${r.designation} 螺纹尺寸（公称）`,
    `螺距 P = ${r.pitch} mm`,
    "",
    "【外螺纹】",
    `牙顶 d = ${r.basic.external.crest} mm`,
    `牙底 d3 = ${r.basic.external.root} mm`,
    `中径 d2 = ${r.basic.external.pitch} mm`,
    `基本小径 d1 = ${r.basic.external.minorBasic} mm`,
    "",
    "【内螺纹】",
    `牙顶 D1 = ${r.basic.internal.crest} mm`,
    `牙底 D = ${r.basic.internal.root} mm`,
    `中径 D2 = ${r.basic.internal.pitch} mm`,
    "",
    "【退刀槽】",
    `外：df=${r.undercut.external.diameter}, 宽=${r.undercut.external.width}, r=${r.undercut.external.radius}`,
    `内：Dg=${r.undercut.internal.diameter}, 宽=${r.undercut.internal.width}, r=${r.undercut.internal.radius}`,
    "",
    "【加工参考】",
    `毛坯外径 ≈ ${r.machining.externalBlankOd} mm`,
    `底孔 ≈ ${r.machining.internalTapDrill} mm`,
  ].join("\n");

  try {
    await navigator.clipboard.writeText(text);
    setStatus("结果已复制到剪贴板", "ok");
  } catch {
    // Fallback for restricted clipboard environments
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      setStatus("结果已复制到剪贴板", "ok");
    } catch {
      setStatus("复制失败，请手动选择文本", "error");
    }
    document.body.removeChild(ta);
  }
}

$("calcBtn").addEventListener("click", runCalc);
$("copyBtn").addEventListener("click", copyResult);
$("coarseBtn").addEventListener("click", () => {
  const d = Number(dInput.value);
  if (!(d > 0)) return;
  pInput.value = String(defaultPitch(d));
  syncFromFields();
  runCalc();
});

specInput.addEventListener("change", () => {
  syncFromSpec();
  runCalc();
});
specInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    syncFromSpec();
    runCalc();
  }
});

[dInput, pInput, grooveLen].forEach((el) => {
  el.addEventListener("change", () => {
    syncFromFields();
    runCalc();
  });
});

buildChips();
runCalc();
