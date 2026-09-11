import { GC01_INPUT, GC01_EXPECTED, GC01_TOL } from "./calc/gc01-case.js";
import { runDtiiP2P, compareToExpected } from "./calc/dtii-engine.js";
import { buildCalcInputFromExtract } from "./calc/path-extract.js";

const els = {
  inputPanel: document.getElementById("inputPanel"),
  summaryPanel: document.getElementById("summaryPanel"),
  comparePanel: document.getElementById("comparePanel"),
  stepsPanel: document.getElementById("stepsPanel"),
  passChip: document.getElementById("passChip"),
  algoChip: document.getElementById("algoChip"),
  sourceChip: document.getElementById("sourceChip"),
  splitSelect: document.getElementById("splitSelect"),
  inputTitle: document.getElementById("inputTitle"),
};

let activeMode = "gc01"; // gc01 | path
let pathBundle = null;

function fmt(v) {
  if (v == null) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function renderKv(el, obj) {
  if (!el) return;
  el.innerHTML = Object.entries(obj)
    .map(([k, v]) => `<div><span>${k}</span><strong>${fmt(v)}</strong></div>`)
    .join("");
}

function renderSteps(steps) {
  if (!els.stepsPanel) return;
  els.stepsPanel.innerHTML = steps
    .map((s) => {
      const res =
        typeof s.result === "object"
          ? Object.entries(s.result)
              .map(([k, v]) => `${k}=${v}`)
              .join(", ")
          : `${s.result} ${s.unit || ""}`;
      return `
<details class="step">
  <summary>
    <span><span class="sid">${s.id}</span>${s.title}
      <small style="color:#93a0b5"> · ${s.handbook || ""}</small>
    </span>
    <span class="sres">${res}</span>
  </summary>
  <div class="body">
    <div class="formula">${s.formula || "—"}</div>
    ${s.note ? `<p>${s.note}</p>` : ""}
    <div class="grid2">
      <div class="mini"><h4>输入</h4><pre>${JSON.stringify(s.inputs, null, 2)}</pre></div>
      <div class="mini"><h4>中间值</h4><pre>${JSON.stringify(s.intermediates, null, 2)}</pre></div>
    </div>
  </div>
</details>`;
    })
    .join("");
}

function renderCompare(cmp) {
  if (!els.comparePanel) return;
  if (!cmp) {
    els.comparePanel.innerHTML =
      `<p class="muted">当前为路径提取计算，无 GC-01 期望对照。几何来自网页 XYZ 精确提取。</p>`;
    if (els.passChip) {
      els.passChip.textContent = "来源：网页路径提取";
      els.passChip.className = "chip ok";
    }
    return;
  }
  els.comparePanel.innerHTML = `
    <table class="compare-table">
      <thead><tr><th>项</th><th>计算</th><th>期望</th><th>判定</th></tr></thead>
      <tbody>
        ${cmp.rows
          .map(
            (r) => `<tr>
            <td>${r.name}</td>
            <td>${r.got}</td>
            <td>${r.expected}</td>
            <td class="${r.pass ? "pass" : "fail"}">${r.pass ? "通过" : "偏差"}</td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>`;
  if (els.passChip) {
    els.passChip.textContent = cmp.pass ? "对照：全部通过" : "对照：存在偏差";
    els.passChip.className = "chip " + (cmp.pass ? "ok" : "bad");
  }
}

function loadPathBundleFromStorage() {
  try {
    const raw = sessionStorage.getItem("pidm.calc.bundle");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function setSourceUI() {
  if (activeMode === "path" && pathBundle) {
    if (els.sourceChip) {
      els.sourceChip.textContent = `几何：web_path / ${pathBundle.extract?.geometry_version || "G?"}`;
      els.sourceChip.className = "chip ok";
    }
    if (els.inputTitle) els.inputTitle.textContent = "路径提取输入（Web 正确提数）";
  } else {
    if (els.sourceChip) {
      els.sourceChip.textContent = "几何：GC-01 锚定";
      els.sourceChip.className = "chip";
    }
    if (els.inputTitle) els.inputTitle.textContent = "GC-01 输入（采用值）";
  }
}

function run() {
  const split = els.splitSelect?.value || "1:1";
  let input;
  let cmp = null;

  if (activeMode === "path" && pathBundle?.extract) {
    input = buildCalcInputFromExtract(pathBundle.path, pathBundle.extract, {
      power_split: split,
      FS1_N: pathBundle.path?.line?.FS1_N ?? 0,
      FS2_N: pathBundle.path?.line?.FS2_N ?? 0,
      S22_N: pathBundle.path?.line?.S22_N ?? 0,
    });
  } else {
    input = { ...GC01_INPUT, power_split: split };
  }

  const out = runDtiiP2P(input);
  if (els.algoChip) els.algoChip.textContent = out.algorithm || "DTII-P2P-v0.2";
  setSourceUI();

  renderKv(els.inputPanel, {
    case_id: input.case_id || input.case_id,
    geometry_source: input.geometry_source || "gc01",
    Q_tph: input.Q_tph,
    L_m: input.L_m,
    Ln_m: input.Ln_m,
    H_m: input.H_m,
    delta_deg: input.delta_deg,
    f: input.f,
    C: input.C,
    qG: input.qG,
    qB: input.qB,
    qRO: input.qRO,
    qRU: input.qRU,
    v: input.v_mps,
    eta: input.eta,
    FS1_N: input.FS1_N,
    FS2_N: input.FS2_N,
    power_split: split,
  });

  const a = out.summary.split_active || {};
  renderKv(els.summaryPanel, {
    FH_N: out.summary.FH_N,
    FS1_N: out.summary.FS1_N,
    FS2_N: out.summary.FS2_N,
    FSt_N: out.summary.FSt_N,
    FU_N: out.summary.FU_N,
    PA_kW: out.summary.PA_kW,
    PM_kW: out.summary.PM_kW,
    S1min_N: out.summary.S1min_N,
    [`F1(${split})_N`]: a.F1_N ?? out.summary.F1_N,
    [`F2(${split})_N`]: a.F2_N ?? out.summary.F2_N,
    F1max_N: out.summary.F1max_N,
    F2max_N: out.summary.F2max_N,
  });
  renderSteps(out.steps || []);

  if (activeMode === "gc01") {
    cmp = compareToExpected(out.summary, GC01_EXPECTED, GC01_TOL);
  }
  renderCompare(cmp);
  return { out, cmp };
}

document.getElementById("btnRun")?.addEventListener("click", () => {
  activeMode = "gc01";
  run();
});
document.getElementById("btnRunPath")?.addEventListener("click", () => {
  pathBundle = loadPathBundleFromStorage();
  if (!pathBundle?.extract) {
    alert("没有路径提取包。请先在路径编辑器点「提取并计算」。");
    return;
  }
  activeMode = "path";
  run();
});
document.getElementById("btnExpandAll")?.addEventListener("click", () => {
  document.querySelectorAll(".step").forEach((d) => (d.open = true));
});
document.getElementById("btnCollapseAll")?.addEventListener("click", () => {
  document.querySelectorAll(".step").forEach((d) => (d.open = false));
});
els.splitSelect?.addEventListener("change", () => run());

const params = new URLSearchParams(location.search);
pathBundle = loadPathBundleFromStorage();
if (params.get("source") === "path" && pathBundle?.extract) {
  activeMode = "path";
} else {
  activeMode = "gc01";
}
const { cmp } = run();
console.log("[PIDM] calc mode=", activeMode, cmp || pathBundle?.extract?.line_geometry);
