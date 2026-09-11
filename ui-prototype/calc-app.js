import { GC01_INPUT, GC01_EXPECTED, GC01_TOL } from "./calc/gc01-case.js";
import { runDtiiP2P, compareToExpected } from "./calc/dtii-engine.js";

const els = {
  inputPanel: document.getElementById("inputPanel"),
  summaryPanel: document.getElementById("summaryPanel"),
  comparePanel: document.getElementById("comparePanel"),
  stepsPanel: document.getElementById("stepsPanel"),
  passChip: document.getElementById("passChip"),
  algoChip: document.getElementById("algoChip"),
};

function fmt(v) {
  if (v == null) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function renderKv(el, obj) {
  el.innerHTML = Object.entries(obj)
    .map(([k, v]) => `<div><span>${k}</span><strong>${fmt(v)}</strong></div>`)
    .join("");
}

function renderSteps(steps) {
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
  els.passChip.textContent = cmp.pass ? "对照：全部通过" : "对照：存在偏差";
  els.passChip.className = "chip " + (cmp.pass ? "ok" : "bad");
}

function run() {
  const out = runDtiiP2P(GC01_INPUT);
  els.algoChip.textContent = out.algorithm;
  renderKv(els.inputPanel, {
    Q_tph: GC01_INPUT.Q_tph,
    L_m: GC01_INPUT.L_m,
    H_m: GC01_INPUT.H_m,
    delta_deg: GC01_INPUT.delta_deg,
    f: GC01_INPUT.f,
    C: GC01_INPUT.C,
    qG: GC01_INPUT.qG,
    qB: GC01_INPUT.qB,
    qRO: GC01_INPUT.qRO,
    qRU: GC01_INPUT.qRU,
    v: GC01_INPUT.v_mps,
    eta: GC01_INPUT.eta,
  });
  renderKv(els.summaryPanel, {
    FH_N: out.summary.FH_N,
    FS1_N: out.summary.FS1_N,
    FS2_N: out.summary.FS2_N,
    FSt_N: out.summary.FSt_N,
    FU_N: out.summary.FU_N,
    PA_kW: out.summary.PA_kW,
    PM_kW: out.summary.PM_kW,
    S1min_N: out.summary.S1min_N,
    F1_N: out.summary.split_1_1.F1_N,
    F2_N: out.summary.split_1_1.F2_N,
  });
  renderSteps(out.steps);
  const cmp = compareToExpected(out.summary, GC01_EXPECTED, GC01_TOL);
  renderCompare(cmp);
  return { out, cmp };
}

document.getElementById("btnRun").addEventListener("click", () => run());
document.getElementById("btnExpandAll").addEventListener("click", () => {
  document.querySelectorAll(".step").forEach((d) => (d.open = true));
});
document.getElementById("btnCollapseAll").addEventListener("click", () => {
  document.querySelectorAll(".step").forEach((d) => (d.open = false));
});

const { cmp } = run();
console.log("[PIDM] GC-01 compare", cmp);
