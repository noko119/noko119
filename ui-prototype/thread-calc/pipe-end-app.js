import {
  computePipeEndThread,
  parseManualMajor,
  pipeEndToRows,
} from "./pipe-end-math.js";
import {
  renderAssemblyDiagram,
  renderFemaleDiagram,
  renderMaleDiagram,
} from "./pipe-end-diagram.js";

const $ = (id) => document.getElementById(id);

let last = null;
let syncing = false;

function num(id) {
  return Number($(id).value);
}

function fill(tbody, rows) {
  tbody.innerHTML = rows
    .map(([k, v]) => `<tr><th scope="row">${k}</th><td>${v}</td></tr>`)
    .join("");
}

function baseInput() {
  return { D1: num("D1"), t1: num("t1"), D2: num("D2"), t2: num("t2") };
}

/** 仅刷新推荐框（不强制覆盖手动输入） */
function refreshRecommend() {
  const preview = computePipeEndThread(baseInput(), {
    grooveKind: $("grooveKind").value,
  });
  if (!preview.ok) {
    $("recommendOut").value = "";
    return null;
  }
  $("recommendOut").value = preview.recommendedDesignation;
  return preview;
}

function renderNearby(r) {
  const box = $("nearbyChips");
  if (!r?.nearby) {
    box.innerHTML = "";
    return;
  }
  box.innerHTML = r.nearby
    .map((n) => {
      const active = n.majorDia === r.majorDia ? " active" : "";
      const tag = n.isRecommended ? "（推荐）" : "";
      return `<button type="button" class="chip${active}" data-maj="${n.majorDia}">${n.designation}${tag}</button>`;
    })
    .join("");
}

function run(forceManual) {
  const warnBox = $("warnBox");
  const okBox = $("okBox");
  warnBox.classList.remove("show");
  okBox.classList.remove("show");

  const preview = refreshRecommend();
  if (!preview) {
    const bad = computePipeEndThread(baseInput());
    $("results").hidden = true;
    $("status").textContent = bad.error || "输入无效";
    $("status").className = "status error";
    warnBox.textContent = bad.error || "输入无效";
    warnBox.classList.add("show");
    last = null;
    return;
  }

  const opt = { grooveKind: $("grooveKind").value };
  const manualRaw = $("manualSpec").value.trim();

  if (forceManual === false) {
    // 采用推荐
    opt.majorDia = preview.recommendedMajor;
    syncing = true;
    $("manualSpec").value = preview.recommendedDesignation;
    syncing = false;
  } else if (manualRaw) {
    const parsed = parseManualMajor(manualRaw);
    if (!parsed.ok) {
      $("status").textContent = parsed.error;
      $("status").className = "status error";
      warnBox.textContent = parsed.error;
      warnBox.classList.add("show");
      return;
    }
    opt.majorDia = parsed.majorDia;
  } else {
    opt.majorDia = preview.recommendedMajor;
    syncing = true;
    $("manualSpec").value = preview.recommendedDesignation;
    syncing = false;
  }

  const r = computePipeEndThread(baseInput(), opt);
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
  $("meta").textContent = `${r.isManual ? "手动规格" : "推荐规格"} · ${r.jointKind} · ${r.jointCombo} · 推荐 ${r.recommendedDesignation} · 理论大径 ${r.theoryMajor} → 采用 ${r.majorDia}`;

  syncing = true;
  $("manualSpec").value = r.designation;
  $("recommendOut").value = r.recommendedDesignation;
  syncing = false;

  $("maleSvg").innerHTML = renderMaleDiagram(r);
  $("femaleSvg").innerHTML = renderFemaleDiagram(r);
  $("assySvg").innerHTML = renderAssemblyDiagram(r);
  renderNearby(r);

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
    $("status").textContent = r.isManual
      ? `已按手动规格重算 ${r.designation}（推荐 ${r.recommendedDesignation}）`
      : `已按推荐生成 ${r.designation}`;
    $("status").className = "status ok";
    const extra = r.warnings.filter((w) => !w.includes("手动规格"));
    if (extra.length) {
      warnBox.textContent = extra.join("；");
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
  const nl = String.fromCharCode(10);
  const tab = String.fromCharCode(9);
  const text = pipeEndToRows(last)
    .map(([k, v]) => `${k}${tab}${v}`)
    .join(nl);
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

$("calcBtn").addEventListener("click", () => run(true));
$("useRecBtn").addEventListener("click", () => run(false));
$("copyBtn").addEventListener("click", copy);

$("nearbyChips").addEventListener("click", (e) => {
  const btn = e.target.closest(".chip");
  if (!btn) return;
  syncing = true;
  $("manualSpec").value = `M${btn.dataset.maj}×2`;
  syncing = false;
  run(true);
});

["D1", "t1", "D2", "t2", "grooveKind"].forEach((id) => {
  $(id).addEventListener("change", () => run(true));
  $(id).addEventListener("input", () => {
    clearTimeout($(id)._t);
    $(id)._t = setTimeout(() => {
      refreshRecommend();
      run(true);
    }, 150);
  });
});

$("manualSpec").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    run(true);
  }
});

run(false);
