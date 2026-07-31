const majors = [
  { id: "carryH", name: "承载分支水平段", subs: ["一般承载水平段", "受料后水平段", "卸料前水平段"] },
  { id: "carryI", name: "承载分支倾斜段", subs: ["上运倾斜段", "下运倾斜段"] },
  { id: "retH", name: "回程分支水平段", subs: ["一般回程水平段", "拉紧区前后水平段"] },
  { id: "retI", name: "回程分支倾斜段", subs: ["回程上运段", "回程下运段"] },
  { id: "convex", name: "凸弧段", subs: ["承载凸弧段", "回程凸弧段"] },
  { id: "concave", name: "凹弧段", subs: ["承载凹弧段", "回程凹弧段"] },
  { id: "load", name: "受料段", subs: ["单点受料段", "多点受料段", "受料加速段"] },
  { id: "unload", name: "卸料段", subs: ["头部卸料段", "犁式卸料段", "中部卸料段"] },
  { id: "trans", name: "过渡段", subs: ["机头过渡段", "机尾过渡段"] },
  { id: "drive", name: "传动滚筒", subs: ["单传动滚筒", "双传动滚筒", "多滚筒驱动"], drum: true },
  { id: "bend", name: "改向滚筒", subs: ["头部改向滚筒", "尾部改向滚筒", "增面滚筒", "中部改向滚筒"], drum: true },
  { id: "takeup", name: "拉紧滚筒", subs: ["重锤拉紧滚筒", "车式拉紧滚筒", "螺旋拉紧滚筒"], drum: true },
];

const classifyRows = [
  ["01", "01_承载分支水平段_一般承载水平段", "承载水平", "一般...", '<span class="tag ok">完整</span>'],
  ["02", "02_凸弧段_承载凸弧段", "凸弧", "承载凸弧", '<span class="tag bad">不完整</span>'],
  ["03", "03_承载分支倾斜段_上运倾斜段", "承载倾斜", "上运", '<span class="tag warn">未确认</span>'],
];

let currentMajor = majors[1];
let currentSub = currentMajor.subs[0];

function $(sel) { return document.querySelector(sel); }

function initTabs() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
      tab.classList.add("active");
      $(`#panel-${tab.dataset.panel}`).classList.add("active");
    });
  });
}

function renderMajors() {
  const grid = $("#majorGrid");
  grid.innerHTML = majors.map((m) => {
    const active = m.id === currentMajor.id ? "active" : "";
    return `<button class="major-btn ${active}" data-id="${m.id}">${m.name}</button>`;
  }).join("");

  grid.querySelectorAll(".major-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentMajor = majors.find((m) => m.id === btn.dataset.id);
      currentSub = currentMajor.subs[0];
      renderMajors();
      renderSubs();
      updateNamePreview();
      toggleDrumExtra();
    });
  });
}

function renderSubs() {
  const list = $("#subList");
  list.innerHTML = currentMajor.subs.map((s) => {
    const active = s === currentSub ? "active" : "";
    return `<label class="sub-item ${active}"><input type="radio" name="sub" ${s === currentSub ? "checked" : ""}/> ${s}</label>`;
  }).join("");

  list.querySelectorAll(".sub-item").forEach((item, idx) => {
    item.addEventListener("click", () => {
      currentSub = currentMajor.subs[idx];
      renderSubs();
      updateNamePreview();
    });
  });
}

function updateNamePreview() {
  const role = currentMajor.id === "drive"
    ? (_("input[name=driveRole]:checked")?.value === "aux" ? "_辅助驱动" : "_主驱动")
    : "";
  $("#namePreview").textContent = `03_${currentMajor.name}_${currentSub}${role}`;
}

function toggleDrumExtra() {
  $("#drumExtra").style.display = currentMajor.drum ? "block" : "none";
}

function _(sel) { return document.querySelector(sel); }

function renderClassifyTable() {
  $("#classifyTable").innerHTML = classifyRows.map((r) => `
    <tr>
      <td>${r[0]}</td>
      <td>${r[1]}</td>
      <td>${r[2]}</td>
      <td>${r[3]}</td>
      <td>${r[4]}</td>
      <td><button class="link-btn">定位</button> <button class="link-btn">重分</button></td>
    </tr>
  `).join("");
}

function initConfirm() {
  $("#confirmClassify").addEventListener("click", () => {
    const toast = $("#classifyToast");
    toast.textContent = `已写入模型树：${$("#namePreview").textContent}`;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2600);
  });

  document.querySelectorAll('input[name="driveRole"]').forEach((el) => {
    el.addEventListener("change", updateNamePreview);
  });
}

function renderAudit() {
  const groups = [
    {
      title: "1. 承载分支水平段（2）",
      items: [
        ["01_承载分支水平段_一般承载水平段", "完整", "L=80.0 · 托辊均距=1.2"],
        ["06_承载分支水平段_受料后水平段", "完整", "L=12.0 · 托辊均距=1.0"],
      ],
    },
    {
      title: "2. 承载分支倾斜段（1）",
      items: [
        ["02_承载分支倾斜段_上运倾斜段", "完整", "L=46.5 · δ=12.00° · H=9.65"],
      ],
    },
    {
      title: "5. 凸弧段（1）",
      items: [
        ["03_凸弧段_承载凸弧段", "不完整", "R=? · θ=?"],
      ],
    },
    {
      title: "10. 传动滚筒（2）",
      items: [
        ["04_传动滚筒_单传动滚筒_主驱动", "完整", "D=1000 · α=210 · 奔离点=1"],
        ["09_传动滚筒_单传动滚筒_辅助驱动", "完整", "D=1000 · α=180"],
      ],
    },
  ];

  $("#auditGroups").innerHTML = groups.map((g) => `
    <details class="audit-group" open>
      <summary>${g.title}</summary>
      ${g.items.map((it) => `
        <div class="audit-item">
          <div>${it[0]}</div>
          <div><span class="tag ${it[1] === "完整" ? "ok" : "bad"}">${it[1]}</span></div>
          <div class="muted">${it[2]}</div>
          <div>
            <button class="link-btn">定位</button>
            <button class="link-btn">查看属性</button>
          </div>
        </div>
      `).join("")}
    </details>
  `).join("");
}

document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  renderMajors();
  renderSubs();
  updateNamePreview();
  toggleDrumExtra();
  renderClassifyTable();
  initConfirm();
  renderAudit();
  document.querySelector('input[name="driveRole"][value="main"]').checked = true;
});
