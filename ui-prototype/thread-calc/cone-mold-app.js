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
      const ends = [s.femaleEnd ? "下母" : "", s.maleEnd ? "上公" : ""].filter(Boolean).join("+") || "—";
      let note = "—";
      if (s.topFaceOffset != null) {
        note = `含上口 ${s.topFaceOffset}；面下 ${s.belowTopFace}`;
      } else if (s.bottomFaceOffset != null) {
        note = `含下口 ${s.bottomFaceOffset}；面上 ${s.aboveBottomFace}`;
      }
      return `<tr>
        <th scope="row">${s.index}</th>
        <td>φ${s.od}</td>
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
        <td>φ${j.fromOd} → φ${j.toOd}</td>
        <td>${j.autoDesignation}</td>
        <td><strong>${j.designation}</strong></td>
        <td>${j.crest.external} / ${j.crest.internal}</td>
        <td>${j.undercutDf} / ${j.undercutDg}</td>
        <td>≥ ${j.minFemaleWall ?? "—"} mm</td>
      </tr>`;
    })
    .join("");
}

function renderSchema(segments) {
  const parts = [];
  segments.forEach((s, i) => {
    parts.push(`<div class="seg"><strong>φ${s.od}</strong><span>${s.length} mm · ${s.kind}</span></div>`);
    if (i < segments.length - 1) parts.push(`<div class="arrow">→</div>`);
  });
  $("schema").innerHTML = parts.join("");
}

function renderJointCards(joints) {
  const host = $("jointCards");
  host.innerHTML = joints
    .filter((j) => j.ok && j.maleCard && j.femaleCard)
    .map((j) => {
      const maleRows = j.maleCard.rows
        .map(([k, v]) => `<tr><th scope="row">${k}</th><td>${v}</td></tr>`)
        .join("");
      const femaleRows = j.femaleCard.rows
        .map(([k, v]) => `<tr><th scope="row">${k}</th><td>${v}</td></tr>`)
        .join("");
      return `<article class="card joint-block">
        <h4>第 ${j.index} 道 · ${j.designation}（φ${j.fromOd} 母 ← φ${j.toOd} 公）</h4>
        <p class="muted" style="margin:0 0 10px">${j.checkMessage}</p>
        <div class="card-pair">
          <div>
            <h3 style="margin-top:0">${j.maleCard.title}</h3>
            <table class="data"><tbody>${maleRows}</tbody></table>
          </div>
          <div>
            <h3 style="margin-top:0">${j.femaleCard.title}</h3>
            <table class="data"><tbody>${femaleRows}</tbody></table>
          </div>
        </div>
      </article>`;
    })
    .join("");
}

function run() {
  const midRaw = $("midOds").value.trim();
  const bigOd = num("bigOd", CONE_MOLD_DEFAULTS.bigOd);
  const smallOd = num("smallOd", CONE_MOLD_DEFAULTS.smallOd);
  const moldHeight = num("moldHeight", CONE_MOLD_DEFAULTS.moldHeight);
  const topAllowance = num("topAllowance", CONE_MOLD_DEFAULTS.topAllowance);
  const bottomAllowance = num("bottomAllowance", CONE_MOLD_DEFAULTS.bottomAllowance);
  const standardLen = num("standardLen", CONE_MOLD_DEFAULTS.standardLen);
  const segCountRaw = $("segmentCount").value.trim();
  const segmentCount = segCountRaw === "" ? undefined : Number(segCountRaw);

  let preferredOds;
  if (midRaw) {
    const mids = midRaw
      .split(/[,，\s]+/)
      .map((x) => Number(x))
      .filter((x) => Number.isFinite(x) && x > 0);
    if (mids.length) preferredOds = [bigOd, ...mids, smallOd];
  }

  const r = designConeMold({
    bigOd,
    smallOd,
    moldHeight,
    topAllowance,
    bottomAllowance,
    standardLen,
    segmentCount,
    preferredOds,
    roundThread: true,
  });

  if (!r.ok) {
    last = null;
    $("results").hidden = true;
    $("status").textContent = r.error;
    $("status").className = "status error";
    $("warnBox").classList.remove("show");
    $("assyDiagram").innerHTML = "";
    return;
  }

  last = r;
  $("results").hidden = false;
  $("status").textContent = `已生成 ${r.segmentCount} 节 / ${r.summary.jointCount} 道螺纹，总高 ${r.summary.moldHeight} mm`;
  $("status").className = "status ok";
  $("summaryLine").textContent =
    `总高 ${r.summary.moldHeight}（校核 ${r.summary.heightOk ? "OK" : "异常"}）· 大头面→小头面 ${r.summary.faceToFace} mm · P=${r.summary.pitch}`;
  $("assyDiagram").innerHTML = renderAssembledConeDiagram(r);
  renderSchema(r.segments);
  fillSegTable(r.segments);
  fillJointTable(r.joints);
  renderJointCards(r.joints);

  const warns = r.joints.filter((j) => j.ok && j.minFemaleWall != null).map((j) => `第${j.index}道母端局部 ≥${j.minFemaleWall}mm`);
  if (warns.length) {
    $("warnBox").textContent = "母扣需局部加厚，不能按薄壁管直车：" + warns.join("；");
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
    `锥管模具 ${last.input.bigOd}→${last.input.smallOd} 总高 ${last.summary.moldHeight}`,
    "各节",
    ...last.segments.map((s) => `第${s.index}${tab}φ${s.od}${tab}${s.length}${tab}${s.kind}${tab}t≈${s.wall}`),
    "",
    "螺纹",
    ...last.joints.filter((j) => j.ok).map(
      (j) => `第${j.index}${tab}φ${j.fromOd}→φ${j.toOd}${tab}${j.designation}${tab}母端≥${j.minFemaleWall}`
    ),
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
["bigOd", "smallOd", "moldHeight", "topAllowance", "bottomAllowance", "standardLen", "segmentCount", "midOds"].forEach(
  (id) => {
    $(id).addEventListener("change", run);
    $(id).addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        run();
      }
    });
  }
);

run();
