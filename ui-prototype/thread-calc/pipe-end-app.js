import { computePipeEndThread, pipeEndToRows } from "./pipe-end-math.js";
import {
  renderAssemblyDiagram,
  renderFemaleDiagram,
  renderMaleDiagram,
} from "./pipe-end-diagram.js";

const $ = (id) => document.getElementById(id);

let last = null;

function num(id) {
  return Number($(id).value);
}

function fill(tbody, rows) {
  tbody.innerHTML = rows
    .map(([k, v]) => `<tr><th scope="row">${k}</th><td>${v}</td></tr>`)
    .join("");
}

function run() {
  const r = computePipeEndThread(
    { D1: num("D1"), t1: num("t1"), D2: num("D2"), t2: num("t2") },
    { grooveKind: $("grooveKind").value }
  );

  const warnBox = $("warnBox");
  const okBox = $("okBox");
  warnBox.classList.remove("show");
  okBox.classList.remove("show");

  if (!r.ok) {
    $("results").hidden = true;
    $("status").textContent = r.error;
    $("status").className = "status error";
    warnBox.textContent = r.error;
    warnBox.classList.add("show");
    last = null;
    return;
  }

  last = r;
  $("results").hidden = false;
  $("title").textContent = r.designation;
  $("meta").textContent = `${r.jointKind} · ${r.jointCombo} · 壁中心径 ${r.smallCenterDia} mm · 理论大径 ${r.theoryMajor} → 取整 ${r.majorDia}`;

  $("maleSvg").innerHTML = renderMaleDiagram(r);
  $("femaleSvg").innerHTML = renderFemaleDiagram(r);
  $("assySvg").innerHTML = renderAssemblyDiagram(r);

  fill($("outTable"), pipeEndToRows(r));
  fill($("maleTable"), [
    ["定位止口", `${r.maleEnd.locator} mm`],
    ["螺纹有效旋合段", `${r.maleEnd.thread} mm`],
    ["外螺纹退刀槽宽", `${r.maleEnd.undercutWidth} mm`],
    ["退刀槽底径 df", `${r.maleEnd.undercutDf} mm`],
    ["端头合计", `${r.maleEnd.total} mm`],
  ]);
  fill($("femaleTable"), [
    ["定位止口接收段", `${r.femaleEnd.locator} mm`],
    ["内螺纹旋合段", `${r.femaleEnd.thread} mm`],
    ["内螺纹退刀槽宽", `${r.femaleEnd.undercutWidth} mm`],
    ["退刀槽底径 Dg", `${r.femaleEnd.undercutDg} mm`],
    ["内腔合计", `${r.femaleEnd.total} mm`],
  ]);
  $("assy").textContent = r.assemblyNote;

  if (!r.checkPass) {
    warnBox.textContent = r.checkMessage;
    warnBox.classList.add("show");
    $("status").textContent = r.checkMessage;
    $("status").className = "status error";
  } else {
    okBox.textContent = r.checkMessage;
    okBox.classList.add("show");
    $("status").textContent = `已生成 ${r.designation}`;
    $("status").className = "status ok";
    if (r.warnings.length) {
      warnBox.textContent = r.warnings.join("；");
      warnBox.classList.add("show");
    }
  }
}

async function copy() {
  if (!last) {
    $("status").textContent = "请先生成数据";
    $("status").className = "status error";
    return;
  }
  const text = pipeEndToRows(last)
    .map(([k, v]) => `${k}\t${v}`)
    .join("\n");
  try {
    await navigator.clipboard.writeText(text);
    $("status").textContent = "结果已复制";
    $("status").className = "status ok";
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    $("status").textContent = "结果已复制";
    $("status").className = "status ok";
  }
}

$("calcBtn").addEventListener("click", run);
$("copyBtn").addEventListener("click", copy);
["D1", "t1", "D2", "t2", "grooveKind"].forEach((id) => {
  $(id).addEventListener("change", run);
  $(id).addEventListener("input", () => {
    clearTimeout($(id)._t);
    $(id)._t = setTimeout(run, 150);
  });
});

run();
