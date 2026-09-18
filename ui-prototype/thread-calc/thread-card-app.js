import { computeThreadEndCards } from "./pipe-end-math.js";

const $ = (id) => document.getElementById(id);
let last = null;

function fill(tbody, rows) {
  tbody.innerHTML = rows
    .map(([k, v]) => `<tr><th scope="row">${k}</th><td>${v}</td></tr>`)
    .join("");
}

function run() {
  const r = computeThreadEndCards($("specInput").value, {
    grooveKind: $("grooveKind").value,
  });

  if (!r.ok) {
    $("cards").hidden = true;
    $("status").textContent = r.error;
    $("status").className = "status error";
    last = null;
    return;
  }

  last = r;
  $("cards").hidden = false;
  $("specInput").value = r.designation;
  $("maleTitle").textContent = r.male.title;
  $("femaleTitle").textContent = r.female.title;
  $("maleSub").textContent = "";
  $("femaleSub").textContent = "";
  fill($("maleTable"), r.male.rows);
  fill($("femaleTable"), r.female.rows);
  $("status").textContent = `已生成 ${r.designation} 公/母扣端头结构`;
  $("status").className = "status ok";
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
    last.male.title,
    ...last.male.rows.map(([k, v]) => `${k}${tab}${v}`),
    "",
    last.female.title,
    ...last.female.rows.map(([k, v]) => `${k}${tab}${v}`),
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
$("grooveKind").addEventListener("change", run);
$("specInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    run();
  }
});
$("specInput").addEventListener("change", run);

run();
