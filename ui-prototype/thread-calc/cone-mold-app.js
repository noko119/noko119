import { designConeMold, CONE_MOLD_DEFAULTS } from "./cone-mold-math.js";
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
      let note = "—";
      if (s.topFaceOffset != null) note = `含上余量 ${s.topFaceOffset}`;
      else if (s.bottomFaceOffset != null) note = `含下余量 ${s.bottomFaceOffset}`;
      return `<tr>
        <th scope="row">套${s.index}</th>
        <td>ø${s.coneAtTop}→ø${s.coneAtBot}（需≥${s.coneNeed}）</td>
        <td>${s.pipeLabel || `ø${s.pipeNom}`}</td>
        <td><strong>ø${s.outerOd}</strong></td>
        <td>${s.length} mm</td>
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
        <td>锥 ø${j.coneDia}</td>
        <td>${stack}</td>
        <td><strong>${j.designation}</strong></td>
        <td>${j.crest.external} / ${j.crest.internal}</td>
        <td>≥ ${j.minFemaleWall ?? "—"} mm</td>
      </tr>`;
    })
    .join("");
}

function renderSchema(sleeves, cone) {
  $("schema").innerHTML = `
    <div class="seg"><strong>内锥</strong><span>ø${cone.topDia}→ø${cone.bottomDia}<br/>高 ${cone.height} mm</span></div>
    <div class="arrow">+</div>
    ${sleeves
      .map(
        (s, i) =>
          `<div class="seg"><strong>外套${s.index}</strong><span>${s.pipeLabel || "ø" + s.outerOd}<br/>${s.length}mm · ${s.kind}</span></div>${
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

function run() {
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
    coneTopDia: num("bigOd", CONE_MOLD_DEFAULTS.coneTopDia),
    coneBottomDia: num("smallOd", CONE_MOLD_DEFAULTS.coneBottomDia),
    totalHeight: num("moldHeight", CONE_MOLD_DEFAULTS.totalHeight),
    topAllowance: num("topAllowance", CONE_MOLD_DEFAULTS.topAllowance),
    bottomAllowance: num("bottomAllowance", CONE_MOLD_DEFAULTS.bottomAllowance),
    standardLen: num("standardLen", CONE_MOLD_DEFAULTS.standardLen),
    wall: num("wall", CONE_MOLD_DEFAULTS.wall),
    segmentCount: segRaw === "" ? undefined : Number(segRaw),
    preferredOuterOds,
    roundThread: true,
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
  $("status").textContent = `案例已生成：总高 ${r.summary.totalHeight}，内锥 ${r.summary.coneHeight}，外套 ${r.segmentCount} 节 / 接头 ${r.summary.jointCount}`;
  $("status").className = "status ok";
  $("summaryLine").textContent = `内锥 ø${r.summary.coneTopDia}→ø${r.summary.coneBottomDia} · 总高 ${r.summary.totalHeight}（上${r.input.topAllowance}+锥${r.summary.coneHeight}+下${r.input.bottomAllowance}）· ${r.summary.nestNote}`;
  $("assyDiagram").innerHTML = renderAssembledConeDiagram(r);
  renderSchema(r.sleeves, r.cone);
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
    `内锥+外套 总高${last.summary.totalHeight} 锥ø${last.summary.coneTopDia}→${last.summary.coneBottomDia}`,
    ...last.sleeves.map((s) => `套${s.index}${tab}外${s.outerOd}${tab}${s.length}${tab}锥${s.coneAtTop}→${s.coneAtBot}`),
    ...last.joints.filter((j) => j.ok).map((j) => `接头${j.index}${tab}${j.designation}${tab}锥${j.coneDia}`),
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
["bigOd", "smallOd", "moldHeight", "topAllowance", "bottomAllowance", "standardLen", "wall", "segmentCount", "midOds"].forEach(
  (id) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener("change", run);
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        run();
      }
    });
  }
);

run();
