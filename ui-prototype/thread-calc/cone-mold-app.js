import {
  designConeMold,
  CONE_MOLD_DEFAULTS,
  SCALE_FACTOR_PRESETS,
  RECOMMENDED_SCALE_FACTOR,
  scalePuToMold,
} from "./cone-mold-math.js";
import { renderAssembledConeDiagram } from "./cone-mold-diagram.js";

const $ = (id) => document.getElementById(id);
let last = null;

function num(id, fallback) {
  const v = Number($(id).value);
  return Number.isFinite(v) ? v : fallback;
}

function fillSegTable(sleeves) {
  $("segTable").innerHTML = sleeves
    .map((s) => {
      let note = s.kindNote || "—";
      if (s.topFaceOffset != null) note = `含上余量 ${s.topFaceOffset}；${note}`;
      else if (s.bottomFaceOffset != null) note = `含下余量 ${s.bottomFaceOffset}；${note}`;
      const part = s.partLength != null ? s.partLength : s.length;
      const male = s.maleEndLen ? `（体${s.length}+公${s.maleEndLen}）` : "（无公扣）";
      return `<tr>
        <th scope="row">套${s.index}</th>
        <td>ø${s.coneAtTop}→ø${s.coneAtBot}（需≥${s.coneNeed}）</td>
        <td>${s.pipeLabel || `ø${s.pipeNom}`}</td>
        <td><strong>ø${s.outerOd}</strong></td>
        <td><strong>${part} mm</strong> ${male}</td>
        <td>${s.kind}</td>
        <td>${s.wall} mm</td>
        <td>${note}</td>
      </tr>`;
    })
    .join("");
}

function fillJointTable(joints) {
  $("jointTable").innerHTML = joints
    .map((j) => {
      if (!j.ok) return `<tr><th>${j.index || "—"}</th><td colspan="6">${j.error}</td></tr>`;
      const stack = (j.jointStack || []).map((x) => `${x.name}${x.h}`).join("+");
      return `<tr>
        <th scope="row">${j.index}</th>
        <td>套外ø${j.fromOd} → ø${j.toOd}</td>
        <td>对接内径 ø${Number(j.coneDia).toFixed(3)}</td>
        <td>${stack}</td>
        <td><strong>${j.designation}</strong></td>
        <td>${j.crest.external} / ${j.crest.internal}</td>
        <td>≥ ${j.minFemaleWall ?? "—"} mm</td>
      </tr>`;
    })
    .join("");
}

function renderSchema(sleeves, cone, r) {
  const pu = r.pu || {};
  const k = r.scale?.factor ?? 1;
  $("schema").innerHTML = `
    <div class="seg"><strong>聚氨酯</strong><span>ø${pu.topDia}→ø${pu.bottomDia}<br/>锥高 ${pu.coneHeight} mm</span></div>
    <div class="arrow">×${k}</div>
    <div class="seg"><strong>模具内锥</strong><span>ø${cone.topDia}→ø${cone.bottomDia}<br/>高 ${cone.height} mm</span></div>
    <div class="arrow">+</div>
    ${sleeves
      .map(
        (s, i) =>
          `<div class="seg"><strong>外套${s.index}</strong><span>${s.pipeLabel || "ø" + s.outerOd}<br/>总高${s.partLength ?? s.length}mm · ${s.kind}</span></div>${
            i < sleeves.length - 1 ? `<div class="arrow">↕</div>` : ""
          }`
      )
      .join("")}
  `;
}

function renderJointCards(joints) {
  $("jointCards").innerHTML = joints
    .filter((j) => j.ok && j.maleCard && j.femaleCard)
    .map((j) => {
      const maleRows = j.maleCard.rows.map(([k, v]) => `<tr><th scope="row">${k}</th><td>${v}</td></tr>`).join("");
      const femaleRows = j.femaleCard.rows.map(([k, v]) => `<tr><th scope="row">${k}</th><td>${v}</td></tr>`).join("");
      const stack = (j.jointStack || []).map((x) => `${x.name}${x.h}`).join(" + ");
      const locNote = j.locatorDim
        ? `安装止口 ${j.locatorDim.height}（壁${j.locatorDim.wall}）· ${j.locatorDim.formula || ""}`
        : "";
      return `<article class="card joint-block">
        <h4>接头 ${j.index} · ${j.designation}</h4>
        <p class="muted" style="margin:0 0 10px">轴向：${stack}。${locNote} ${j.checkMessage}</p>
        <div class="card-pair">
          <div><h3 style="margin-top:0">公端（下套）</h3><table class="data"><tbody>${maleRows}</tbody></table></div>
          <div><h3 style="margin-top:0">母端（上套）</h3><table class="data"><tbody>${femaleRows}</tbody></table></div>
        </div>
      </article>`;
    })
    .join("");
}

function updateScaleHint() {
  const tip = scalePuToMold(
    {
      topDia: num("bigOd", CONE_MOLD_DEFAULTS.puTopDia),
      bottomDia: num("smallOd", CONE_MOLD_DEFAULTS.puBottomDia),
      coneHeight: num("puConeHeight", CONE_MOLD_DEFAULTS.puConeHeight),
    },
    num("scaleFactor", CONE_MOLD_DEFAULTS.scaleFactor),
    num("topAllowance", CONE_MOLD_DEFAULTS.topAllowance),
    num("bottomAllowance", CONE_MOLD_DEFAULTS.bottomAllowance)
  );
  if (!tip.ok) {
    $("scaleHint").textContent = tip.error;
    return;
  }
  const m = tip.mold;
  $("scaleHint").textContent =
    `模具内锥 ø${m.topDia.toFixed(3)}→ø${m.bottomDia.toFixed(3)} · 锥段 ${m.coneHeight.toFixed(3)} · 总高 ${m.totalHeight.toFixed(3)}` +
    `（上余量${m.topAllowance}+锥段+下余量${m.bottomAllowance}；约缩水 ${tip.shrinkagePct}%）`;
}

function renderScalePresets() {
  const box = $("scalePresets");
  if (!box) return;
  box.innerHTML = SCALE_FACTOR_PRESETS.map((p) => {
    const rec = p.recommend || p.value === RECOMMENDED_SCALE_FACTOR ? " · 推荐" : "";
    return `<button type="button" class="btn ghost" data-scale="${p.value}" title="${p.note}${rec}" style="padding:4px 10px;font-size:12px">${p.label}${p.recommend ? "★" : ""}</button>`;
  }).join("");
  box.querySelectorAll("[data-scale]").forEach((btn) => {
    btn.addEventListener("click", () => {
      $("scaleFactor").value = Number(btn.getAttribute("data-scale")).toFixed(3);
      run();
    });
  });
}

function run() {
  updateScaleHint();
  const midRaw = $("midOds").value.trim();
  let preferredOuterOds;
  if (midRaw) {
    const ods = midRaw
      .split(/[,，\s]+/)
      .map((x) => Number(x))
      .filter((x) => Number.isFinite(x) && x > 0);
    if (ods.length) preferredOuterOds = ods;
  }

  const segRaw = $("segmentCount").value.trim();
  const r = designConeMold({
    puTopDia: num("bigOd", CONE_MOLD_DEFAULTS.puTopDia),
    puBottomDia: num("smallOd", CONE_MOLD_DEFAULTS.puBottomDia),
    puConeHeight: num("puConeHeight", CONE_MOLD_DEFAULTS.puConeHeight),
    scaleFactor: num("scaleFactor", CONE_MOLD_DEFAULTS.scaleFactor),
    topAllowance: num("topAllowance", CONE_MOLD_DEFAULTS.topAllowance),
    bottomAllowance: num("bottomAllowance", CONE_MOLD_DEFAULTS.bottomAllowance),
    standardLen: num("standardLen", CONE_MOLD_DEFAULTS.standardLen),
    wall: num("wall", CONE_MOLD_DEFAULTS.wall),
    segmentCount: segRaw === "" ? undefined : Number(segRaw),
    preferredOuterOds,
    roundThread: false,
  });

  if (!r.ok) {
    last = null;
    $("status").textContent = r.error;
    $("status").className = "status error";
    $("warnBox").classList.remove("show");
    $("assyDiagram").innerHTML = `<p class="muted">无法绘图：${r.error}</p>`;
    $("summaryLine").textContent = "";
    return;
  }

  last = r;
  $("status").textContent =
    `已生成：PU×${r.scale.factor} → 模具总高 ${r.summary.totalHeight}，内锥 ${r.summary.coneHeight}，外套 ${r.segmentCount} 节 / 接头 ${r.summary.jointCount}`;
  $("status").className = "status ok";
  $("summaryLine").textContent =
    `聚氨酯 ø${r.pu.topDia}→ø${r.pu.bottomDia} · 锥高 ${r.pu.coneHeight} → ×${r.scale.factor} → ` +
    `模具 ø${r.summary.coneTopDia}→ø${r.summary.coneBottomDia} · 总高 ${r.summary.totalHeight}` +
    `（上${r.input.topAllowance}+锥${r.summary.coneHeight}+下${r.input.bottomAllowance}）· ${r.summary.scaleFormula}`;
  $("assyDiagram").innerHTML = renderAssembledConeDiagram(r);
  renderSchema(r.sleeves, r.cone, r);
  fillSegTable(r.sleeves);
  fillJointTable(r.joints);
  renderJointCards(r.joints);

  const warns = r.joints.filter((j) => j.ok && j.minFemaleWall != null).map((j) => `接头${j.index}≥${j.minFemaleWall}mm`);
  if (warns.length) {
    $("warnBox").textContent = "外套局部需加厚：" + warns.join("；");
    $("warnBox").classList.add("show");
  } else $("warnBox").classList.remove("show");
}

async function copy() {
  if (!last) {
    $("status").textContent = "请先生成";
    $("status").className = "status error";
    return;
  }
  const nl = String.fromCharCode(10);
  const tab = String.fromCharCode(9);
  const lines = [
    `聚氨酯ø${last.pu.topDia}→${last.pu.bottomDia}×${last.pu.coneHeight} ×${last.scale.factor} → 模具总高${last.summary.totalHeight} 锥ø${last.summary.coneTopDia}→${last.summary.coneBottomDia}`,
    ...last.sleeves.map((s) => {
      const pl = s.partLength ?? s.length;
      const male = s.maleEndLen ? `公${s.maleEndLen}` : "无公";
      return `套${s.index}${tab}外${s.outerOd}${tab}总高${pl}${tab}${male}${tab}锥${s.coneAtTop}→${s.coneAtBot}`;
    }),
    ...last.joints.filter((j) => j.ok).map((j) => `接头${j.index}${tab}${j.designation}${tab}对接内径${Number(j.coneDia).toFixed(3)}`),
  ];
  const text = lines.join(nl);
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
  $("status").textContent = "已复制";
  $("status").className = "status ok";
}

$("calcBtn").addEventListener("click", run);
$("copyBtn").addEventListener("click", copy);
[
  "bigOd",
  "smallOd",
  "puConeHeight",
  "scaleFactor",
  "topAllowance",
  "bottomAllowance",
  "standardLen",
  "wall",
  "segmentCount",
  "midOds",
].forEach((id) => {
  const el = $(id);
  if (!el) return;
  el.addEventListener("change", run);
  el.addEventListener("input", () => {
    if (id === "scaleFactor" || id === "bigOd" || id === "smallOd" || id === "puConeHeight" || id === "topAllowance" || id === "bottomAllowance") {
      updateScaleHint();
    }
  });
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      run();
    }
  });
});

renderScalePresets();
run();
