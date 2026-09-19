import { designConeMold, CONE_MOLD_DEFAULTS } from "./cone-mold-math.js";
import { renderAssembledConeDiagram } from "./cone-mold-diagram.js";

const $ = (id) => document.getElementById(id);
let last = null;

function num(id, fallback) {
  const v = Number($(id).value);
  return Number.isFinite(v) ? v : fallback;
}

function fillSegTable(segments) {
  $("segTable").innerHTML = segments
    .map((s) => {
      const ends = [s.femaleSleeve ? "下母套" : "", s.maleNeck ? "上公颈" : ""].filter(Boolean).join("+") || "—";
      let note = "—";
      if (s.topFaceOffset != null) note = `含上口余量 ${s.topFaceOffset}；面下 ${s.belowTopFace}`;
      else if (s.bottomFaceOffset != null) note = `含下口余量 ${s.bottomFaceOffset}；面上 ${s.aboveBottomFace}`;
      return `<tr>
        <th scope="row">${s.index}</th>
        <td>ø${s.cavityTop}→ø${s.cavityBottom}</td>
        <td>ø${s.outerOd}</td>
        <td>${s.length} mm</td>
        <td>${s.kind}</td>
        <td>${s.wall} mm</td>
        <td>${ends}</td>
        <td>${note}</td>
      </tr>`;
    })
    .join("");
}

function fillJointTable(joints) {
  $("jointTable").innerHTML = joints
    .map((j) => {
      if (!j.ok) {
        return `<tr><th>${j.index || "—"}</th><td colspan="6">${j.error}</td></tr>`;
      }
      return `<tr>
        <th scope="row">${j.index}</th>
        <td>外ø${j.fromOd}套 → ø${j.toOd}颈</td>
        <td>型腔 ø${j.cavityAtJoint}</td>
        <td>${j.autoDesignation}</td>
        <td><strong>${j.designation}</strong></td>
        <td>${j.crest.external} / ${j.crest.internal}</td>
        <td>≥ ${j.minFemaleWall ?? "—"} mm</td>
      </tr>`;
    })
    .join("");
}

function renderSchema(segments) {
  const parts = [];
  segments.forEach((s, i) => {
    parts.push(
      `<div class="seg"><strong>§${s.index}</strong><span>型腔 ${s.cavityTop}→${s.cavityBottom}<br/>外圆 ø${s.outerOd} · ${s.length} mm · ${s.kind}</span></div>`
    );
    if (i < segments.length - 1) parts.push(`<div class="arrow">↕</div>`);
  });
  $("schema").innerHTML = parts.join("");
}

function renderJointCards(joints) {
  const host = $("jointCards");
  host.innerHTML = joints
    .filter((j) => j.ok && j.maleCard && j.femaleCard)
    .map((j) => {
      const maleRows = j.maleCard.rows.map(([k, v]) => `<tr><th scope="row">${k}</th><td>${v}</td></tr>`).join("");
      const femaleRows = j.femaleCard.rows.map(([k, v]) => `<tr><th scope="row">${k}</th><td>${v}</td></tr>`).join("");
      return `<article class="card joint-block">
        <h4>第 ${j.index} 道 · ${j.designation}（上外套 ← 下公颈，型腔 ø${j.cavityAtJoint}）</h4>
        <p class="muted" style="margin:0 0 10px">${j.nestStyle}。${j.checkMessage}</p>
        <div class="card-pair">
          <div>
            <h3 style="margin-top:0">公颈端头（下段）</h3>
            <table class="data"><tbody>${maleRows}</tbody></table>
          </div>
          <div>
            <h3 style="margin-top:0">外套内腔（上段）</h3>
            <table class="data"><tbody>${femaleRows}</tbody></table>
          </div>
        </div>
      </article>`;
    })
    .join("");
}

function run() {
  const midRaw = $("midOds").value.trim();
  const cavityTop = num("bigOd", CONE_MOLD_DEFAULTS.cavityTop);
  const cavityBottom = num("smallOd", CONE_MOLD_DEFAULTS.cavityBottom);
  const moldHeight = num("moldHeight", CONE_MOLD_DEFAULTS.moldHeight);
  const topAllowance = num("topAllowance", CONE_MOLD_DEFAULTS.topAllowance);
  const bottomAllowance = num("bottomAllowance", CONE_MOLD_DEFAULTS.bottomAllowance);
  const standardLen = num("standardLen", CONE_MOLD_DEFAULTS.standardLen);
  const wall = num("wall", CONE_MOLD_DEFAULTS.wall);
  const segCountRaw = $("segmentCount").value.trim();
  const segmentCount = segCountRaw === "" ? undefined : Number(segCountRaw);

  let preferredOuterOds;
  if (midRaw) {
    const ods = midRaw
      .split(/[,，\s]+/)
      .map((x) => Number(x))
      .filter((x) => Number.isFinite(x) && x > 0);
    if (ods.length) preferredOuterOds = ods;
  }

  const r = designConeMold({
    cavityTop,
    cavityBottom,
    moldHeight,
    topAllowance,
    bottomAllowance,
    standardLen,
    wall,
    segmentCount,
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
  $("status").textContent = `已生成 ${r.segmentCount} 节嵌套模具 / ${r.summary.jointCount} 道接头，总高 ${r.summary.moldHeight} mm`;
  $("status").className = "status ok";
  $("summaryLine").textContent =
    `型腔 ø${r.summary.cavityTop}→ø${r.summary.cavityBottom} · 总高 ${r.summary.moldHeight} · 面距 ${r.summary.faceToFace} · ${r.summary.nestNote}`;
  $("assyDiagram").innerHTML = renderAssembledConeDiagram(r);
  renderSchema(r.segments);
  fillSegTable(r.segments);
  fillJointTable(r.joints);
  renderJointCards(r.joints);

  const warns = r.joints
    .filter((j) => j.ok && j.minFemaleWall != null)
    .map((j) => `第${j.index}道外套局部 ≥${j.minFemaleWall}mm`);
  if (warns.length) {
    $("warnBox").textContent = "嵌套外套需局部加厚以保证螺纹实体：" + warns.join("；");
    $("warnBox").classList.add("show");
  } else {
    $("warnBox").classList.remove("show");
  }
}

async function copy() {
  if (!last) {
    $("status").textContent = "请先生成方案";
    $("status").className = "status error";
    return;
  }
  const nl = String.fromCharCode(10);
  const tab = String.fromCharCode(9);
  const lines = [
    `锥管模具（内锥嵌套）型腔 ${last.summary.cavityTop}→${last.summary.cavityBottom} 总高 ${last.summary.moldHeight}`,
    "各节",
    ...last.segments.map(
      (s) =>
        `第${s.index}${tab}型腔${s.cavityTop}→${s.cavityBottom}${tab}外圆${s.outerOd}${tab}${s.length}${tab}${s.kind}`
    ),
    "",
    "接头",
    ...last.joints
      .filter((j) => j.ok)
      .map((j) => `第${j.index}${tab}${j.designation}${tab}型腔${j.cavityAtJoint}${tab}外套≥${j.minFemaleWall}`),
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
["bigOd", "smallOd", "moldHeight", "topAllowance", "bottomAllowance", "standardLen", "segmentCount", "midOds", "wall"].forEach(
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
