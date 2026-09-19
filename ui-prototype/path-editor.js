import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { buildPathExport } from "./path-schema.js";
import { buildAutoReturnLoop, extractCarryChain } from "./calc/auto-return.js";
import {
  buildDualDriveWrapTemplate,
  buildGravityTakeupTemplate,
} from "./calc/path-templates.js";
import { buildGc01ComplexPath } from "./calc/gc01-complex-path.js";
import { buildEasyInclineConveyor, buildEasyFromPreset, EASY_PRESETS } from "./calc/easy-wizard.js";
import { parseDxfPolylines, dxfPointsToCarryNodes, exportNodesToDxf } from "./calc/dxf-import.js";
import { insertVerticalCurveAt, suggestMinRadius_m } from "./calc/vertical-curve.js";
import { resolveDesignLoads } from "./calc/design-loads.js";
import { insertHorizontalCurveAt, suggestHorizontalRmin_m } from "./calc/horizontal-curve.js";
import {
  annotateWrapAngles,
  applyDrumRadiusOffsets,
  computeWrapAtNode,
  annotateDriveSlipChecks,
} from "./calc/drum-geometry.js";
import {
  buildFlightRows,
  pairCarryReturnFlights,
  flightRowsToOverrides,
  summarizeFlights,
  enforcePairedReturnOffset,
} from "./calc/flight-model.js";
import { finalizeProfile, checkVerticalCurveDtii, checkWrapDtii } from "./calc/finalize-checks.js";
import { nodesToCsv, csvToNodes, flightsToCsv, csvToFlightOverrides } from "./calc/excel-io.js";
import { GC01_INPUT } from "./calc/gc01-case.js";

/** @typedef {{ id:string, x:number, y:number, z:number, type:string, mainDrive?:boolean, branch?:string, strand?:string }} PathNode */

const TYPE_LABEL = {
  node: "节点",
  tail: "尾滚筒",
  bend: "改向",
  drive: "传动",
  head: "头滚筒",
  takeup: "拉紧",
};

const RETURN_COLOR = 0xfb923c;
const TYPE_COLOR = {
  node: 0x93c5fd,
  tail: 0xa78bfa,
  bend: 0xfbbf24,
  drive: 0xf87171,
  head: 0x34d399,
  takeup: 0x60a5fa,
};

const state = {
  /** @type {PathNode[]} */
  nodes: [],
  selectedId: null,
  mode: "3d", // 3d | 2d-xy | 2d-xz
  tool: "select",
  dragging: false,
  dragId: null,
  planeY: 0,
  returnMeta: null,
  returnMode: "auto", // auto | advanced
  flightOverrides: {},
  flights: [],
  finalizeResult: null,
  finalized: false,
};

const els = {
  viewport: document.getElementById("viewport"),
  modeChip: document.getElementById("modeChip"),
  pointCount: document.getElementById("pointCount"),
  lengthChip: document.getElementById("lengthChip"),
  hudHint: document.getElementById("hudHint"),
  noSelection: document.getElementById("noSelection"),
  nodeFields: document.getElementById("nodeFields"),
  fIndex: document.getElementById("fIndex"),
  fType: document.getElementById("fType"),
  fX: document.getElementById("fX"),
  fY: document.getElementById("fY"),
  fZ: document.getElementById("fZ"),
  fMainDrive: document.getElementById("fMainDrive"),
  fDrumD: document.getElementById("fDrumD"),
  fWrap: document.getElementById("fWrap"),
  tbody: document.querySelector("#xyzTable tbody"),
  segSummary: document.getElementById("segSummary"),
  flightBody: document.querySelector("#flightTable tbody"),
  flightSummary: document.getElementById("flightSummary"),
  finalizeSummary: document.getElementById("finalizeSummary"),
  finalizeChip: document.getElementById("finalizeChip"),
  panelXyz: document.getElementById("panelXyz"),
  panelFlight: document.getElementById("panelFlight"),
  easyModal: document.getElementById("easyModal"),
};

let renderer, scene, camera, controls;
let pathLine, returnLine, closeLine, pointGroup, labelGroup, gridHelper, axesHelper;
let raycaster, pointer, dragPlane, dragOffset;
let groundMesh;

function uid() {
  return "n_" + Math.random().toString(36).slice(2, 9);
}

function dist(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
  return Math.hypot(dx, dy, dz);
}

function totalLength() {
  let L = 0;
  for (let i = 1; i < state.nodes.length; i++) L += dist(state.nodes[i - 1], state.nodes[i]);
  if (state.returnMeta?.closed_loop && state.nodes.length >= 3) {
    L += dist(state.nodes[state.nodes.length - 1], state.nodes[0]);
  }
  return L;
}

function loadDemo() {
  // GC-01 风格上运坡道（示意坐标）+ Auto Return 闭环（大厂默认）
  const modeEl = document.getElementById("profileMode");
  if (modeEl) modeEl.value = "auto";
  state.returnMode = "auto";
  const carry = [
    { id: uid(), x: 0, y: 0, z: 0, type: "tail" },
    { id: uid(), x: 40, y: 0, z: 0, type: "bend" },
    { id: uid(), x: 120, y: 0, z: 25, type: "node" },
    { id: uid(), x: 200, y: 0, z: 45, type: "node" },
    { id: uid(), x: 260, y: 0, z: 57, type: "drive", mainDrive: true },
    { id: uid(), x: 280, y: 0, z: 57, type: "head" },
  ];
  applyAutoReturn(carry, { quiet: true });
}

function mapTemplateNode(n) {
  return {
    id: uid(),
    x: n.x,
    y: n.y ?? 0,
    z: n.z,
    type: n.type || "node",
    label: n.label,
    branch: n.branch || "return",
    strand: n.strand || n.branch || "return",
    mainDrive: !!n.mainDrive,
    drum_D_mm: n.drum_D_mm,
    pulley_no: n.pulley_no,
    takeup_kind: n.takeup_kind,
    template: n.template,
    auto_return: false,
  };
}

/** 确保 Advanced，必要时生成初值回程 */
function ensureAdvancedForEdit(reason) {
  if (isAdvancedReturn()) return true;
  const ok = confirm(
    (reason || "该操作") + " 需要 Advanced 模式（对标 Belt Analyst）。\n是否切换到 Advanced？"
  );
  if (!ok) return false;
  return setProfileMode("advanced", { confirmSwitch: false });
}

function markAdvancedReturnMeta(extra = {}) {
  const prev = state.returnMeta || {};
  state.returnMeta = {
    ...prev,
    closed_loop: true,
    open_path: false,
    carry_return_offset_m: prev.carry_return_offset_m ?? getReturnOffset(),
    ...extra,
    return_mode: "advanced",
  };
}

/**
 * 在选中点后插入局部模板节点（P1；插入后可再改）
 */
function insertTemplateNodes(tplNodes, title) {
  if (!tplNodes?.length) return;
  if (!ensureAdvancedForEdit(title)) return;
  if (extractCarryChain(state.nodes).length < 2) {
    alert("请先绘制承载中心线（至少尾→头），再插入回程局部模板。");
    return;
  }
  // 若尚无回程，先生成 Auto 回程作为可改底稿
  if (!state.nodes.some(isReturnNode)) {
    applyAutoReturn(null, { quiet: true, skipFit: true, force: true });
  }

  let idx = state.nodes.findIndex((n) => n.id === state.selectedId);
  if (idx < 0) idx = state.nodes.length - 1;
  const sel = state.nodes[idx];
  if (sel && !isReturnNode(sel)) {
    const firstRet = state.nodes.findIndex(isReturnNode);
    idx = firstRet >= 0 ? firstRet - 1 : state.nodes.length - 1;
  }

  const mapped = tplNodes.map(mapTemplateNode);
  // 模板内若含主驱，清掉路径上其它主驱标记（保持唯一主驱）
  if (mapped.some((n) => n.mainDrive)) {
    state.nodes.forEach((n) => {
      if (n.type === "drive") n.mainDrive = false;
    });
  }
  state.nodes.splice(idx + 1, 0, ...mapped);
  markAdvancedReturnMeta({
    source: "local_template",
    last_template: title,
    note: "局部模板已插入，可在 Advanced 下继续拖改",
  });
  state.selectedId = mapped[0].id;
  rebuildSceneObjects();
  updateUI();
  fitView();
}

function insertDualDriveWrap() {
  const base = state.nodes.find((n) => n.id === state.selectedId);
  const anchor = base
    ? { x: base.x, y: base.y ?? 0, z: base.z }
    : { x: 64, y: 0, z: 8 };
  insertTemplateNodes(buildDualDriveWrapTemplate(anchor), "双驱绕法");
}

function insertGravityTakeup() {
  const base = state.nodes.find((n) => n.id === state.selectedId);
  const anchor = base
    ? { x: base.x, y: base.y ?? 0, z: Math.max(base.z, 6) }
    : { x: 58, y: 0, z: 10 };
  insertTemplateNodes(buildGravityTakeupTemplate(anchor), "重锤拉紧");
}

/** 演示样例：GC-01 复杂回程（非主交互，规则 §3.0） */
function loadGc01Demo() {
  const ok = confirm(
    "载入 GC-01 复杂回程演示样例？\n\n" +
      "用途：演示/对照（图3-8 多滚筒回程）。\n" +
      "按规则 §3.0：这不是主录入方式；正式布置请自己画中心线 + Advanced/局部模板。"
  );
  if (!ok) return;
  const { nodes, meta } = buildGc01ComplexPath();
  const sel = document.getElementById("profileMode");
  if (sel) sel.value = "advanced";
  state.returnMode = "advanced";
  state.nodes = nodes.map((n) => mapTemplateNode({ ...n, id: n.id }));
  state.returnMeta = {
    closed_loop: true,
    open_path: false,
    return_mode: "advanced",
    carry_return_offset_m: null,
    carry_count: meta.carry_count,
    return_count: meta.return_count,
    source: "gc01_demo",
    case_id: meta.case_id,
    note: meta.note,
  };
  state.selectedId = state.nodes[0]?.id ?? null;
  rebuildSceneObjects();
  updateUI();
  fitView();
  updateReturnModeChip();
}

function getReturnOffset() {
  const el = document.getElementById("returnOffset");
  const v = el ? parseFloat(el.value) : 1.2;
  return Number.isFinite(v) && v > 0 ? v : 1.2;
}

/** Belt Analyst: Auto Return | Advanced */
function getProfileMode() {
  const el = document.getElementById("profileMode");
  const v = el?.value || state.returnMode || "auto";
  return v === "advanced" ? "advanced" : "auto";
}

function isAdvancedReturn() {
  return getProfileMode() === "advanced";
}

function isReturnNode(n) {
  return !!(n && (n.branch === "return" || n.strand === "return"));
}

function updateReturnModeChip() {
  const chip = document.getElementById("returnModeChip");
  if (!chip) return;
  const mode = getProfileMode();
  chip.textContent = mode === "advanced" ? "模式：Advanced（回程可改）" : "模式：Auto Return（回程锁定）";
  chip.className = "chip " + mode;
}

/**
 * Auto 模式：改承载后自动重算回程（大厂默认）
 * Advanced：不自动覆盖手改回程
 */
function maybeResyncReturn(opts = {}) {
  if (!state.returnMeta && !opts.force) return false;
  if (isAdvancedReturn() && !opts.force) return false;
  return applyAutoReturn(null, { quiet: true, ...opts });
}

function applyAutoReturn(carryNodes, opts = {}) {
  const carry = extractCarryChain(carryNodes || state.nodes);
  if (carry.length < 2) {
    if (!(opts.quiet || opts.silent)) alert("Auto Return 需要至少 2 个承载节点（尾→头）");
    return false;
  }
  const mode = getProfileMode();
  const { nodes, meta } = buildAutoReturnLoop(carry, {
    offset_m: getReturnOffset(),
    mode,
  });
  // 尽量保持当前选中（若仍存在）
  const prevSel = state.selectedId;
  state.nodes = nodes;
  state.returnMeta = meta;
  state.returnMode = mode;
  if (!nodes.some((n) => n.id === prevSel)) {
    state.selectedId = nodes.find((n) => !isReturnNode(n))?.id ?? nodes[0]?.id ?? null;
  }
  rebuildSceneObjects();
  updateUI();
  if (!opts.skipFit) fitView();
  updateReturnModeChip();
  if (!opts.quiet) {
    alert(
      "已按大厂 Auto Return 生成闭环\n\n" +
        "模式：" + (mode === "advanced" ? "Advanced" : "Auto Return") + "\n" +
        "承载节点：" + meta.carry_count + "\n" +
        "回程节点：" + meta.return_count + "\n" +
        "间距：" + meta.carry_return_offset_m + " m\n\n" +
        (mode === "auto"
          ? "当前为 Auto：回程锁定，改承载会自动跟随。"
          : "当前为 Advanced：可单独拖改橙色回程点。")
    );
  }
  return true;
}

function setProfileMode(mode, { confirmSwitch = true } = {}) {
  const next = mode === "advanced" ? "advanced" : "auto";
  const prev = state.returnMode || "auto";
  const sel = document.getElementById("profileMode");
  if (sel) sel.value = next;

  if (prev === "advanced" && next === "auto" && state.returnMeta) {
    if (
      confirmSwitch &&
      !confirm("切回 Auto Return 将按承载重新生成回程，Advanced 下手改的回程会被覆盖。继续？")
    ) {
      if (sel) sel.value = "advanced";
      return false;
    }
    state.returnMode = "auto";
    applyAutoReturn(null, { quiet: true, force: true });
  } else {
    state.returnMode = next;
    // 首次进入且还没有回程时，自动生成
    if (next === "auto" && extractCarryChain(state.nodes).length >= 2) {
      const hasReturn = state.nodes.some(isReturnNode);
      if (!hasReturn) applyAutoReturn(null, { quiet: true, skipFit: true });
    }
    if (next === "advanced") {
      if (!state.nodes.some(isReturnNode) && extractCarryChain(state.nodes).length >= 2) {
        applyAutoReturn(null, { quiet: true, skipFit: true, force: true });
      }
      if (state.returnMeta) markAdvancedReturnMeta({ source: state.returnMeta.source || "advanced_switch" });
    }
  }
  updateReturnModeChip();
  updateUI();
  return true;
}

function clearPath() {
  state.nodes = [];
  state.selectedId = null;
  state.returnMeta = null;
  state.returnMode = "auto";
  rebuildSceneObjects();
  updateUI();
}

function initThree() {
  const w = els.viewport.clientWidth;
  const h = els.viewport.clientHeight;

  renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
    alpha: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h);
  renderer.setClearColor(0x0b1220, 1);
  els.viewport.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  // scene.fog disabled for performance
  // scene.fog = new THREE.Fog(0x0b1220, 400, 1200);

  camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 5000);
  camera.position.set(180, -220, 140);
  camera.up.set(0, 0, 1);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.addEventListener("change", () => { needsRender = true; });
  controls.enableDamping = true;
  controls.target.set(120, 0, 20);
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.PAN,
    MIDDLE: THREE.MOUSE.ROTATE,
    RIGHT: THREE.MOUSE.ROTATE,
  };

  const amb = new THREE.AmbientLight(0xffffff, 0.55);
  const dir = new THREE.DirectionalLight(0xffffff, 0.85);
  dir.position.set(80, -120, 200);
  scene.add(amb, dir);

  gridHelper = new THREE.GridHelper(600, 60, 0x334155, 0x1e293b);
  gridHelper.rotation.x = Math.PI / 2; // XY plane as ground, Z up
  scene.add(gridHelper);

  axesHelper = new THREE.AxesHelper(40);
  scene.add(axesHelper);

  // invisible ground for raycasting adds
  const groundGeo = new THREE.PlaneGeometry(2000, 2000);
  groundMesh = new THREE.Mesh(
    groundGeo,
    new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })
  );
  // default XY plane at z=0 (Z-up: plane is XY)
  scene.add(groundMesh);

  pointGroup = new THREE.Group();
  labelGroup = new THREE.Group();
  scene.add(labelGroup);
  scene.add(pointGroup);

  const lineMat = new THREE.LineBasicMaterial({ color: 0x38bdf8 });
  pathLine = new THREE.Line(new THREE.BufferGeometry(), lineMat);
  scene.add(pathLine);
  const returnMat = new THREE.LineBasicMaterial({ color: 0xfb923c });
  returnLine = new THREE.Line(new THREE.BufferGeometry(), returnMat);
  scene.add(returnLine);
  const closeMat = new THREE.LineBasicMaterial({ color: 0xfbbf24, linewidth: true });
  closeLine = new THREE.Line(new THREE.BufferGeometry(), closeMat);
  scene.add(closeLine);

  raycaster = new THREE.Raycaster();
  raycaster.params.Points = { threshold: 2 };
  pointer = new THREE.Vector2();
  dragPlane = new THREE.Plane();
  dragOffset = new THREE.Vector3();

  bindPointer();
  applyMode("3d");
  animate();
}

function makePointMesh(node, index) {
  const color = (node.branch === "return" || node.strand === "return")
    ? RETURN_COLOR
    : (TYPE_COLOR[node.type] || TYPE_COLOR.node);
  const geo = new THREE.SphereGeometry(node.type === "node" ? 1.6 : 2.4, 12, 10);
  const mat = new THREE.MeshBasicMaterial({
    color,
    // 选中时提亮（Basic 无 emissive，用颜色近似）
  });
  if (node.id === state.selectedId) {
    mat.color.offsetHSL(0, 0, 0.15);
  }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(node.x, node.y, node.z);
  mesh.userData.nodeId = node.id;
  mesh.userData.index = index;

  // ring for drums
  if (node.type !== "node") {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(3.2, 0.35, 8, 24),
      new THREE.MeshBasicMaterial({ color })
    );
    ring.rotation.x = Math.PI / 2;
    mesh.add(ring);
  }
  return mesh;
}


function isDrumType(t) {
  return ["tail", "head", "drive", "bend", "takeup"].includes(t);
}

function makeTextSprite(text, opts = {}) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const fontSize = opts.fontSize || 28;
  canvas.width = 256;
  canvas.height = 64;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = `bold ${fontSize}px Segoe UI, Microsoft YaHei, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // background pill
  const tw = Math.min(240, ctx.measureText(text).width + 24);
  const x0 = (canvas.width - tw) / 2;
  ctx.fillStyle = "rgba(15, 23, 42, 0.78)";
  ctx.strokeStyle = "rgba(148, 163, 184, 0.55)";
  ctx.lineWidth = 2;
  const y0 = 14, h = 36, r = 10;
  ctx.beginPath();
  ctx.moveTo(x0 + r, y0);
  ctx.arcTo(x0 + tw, y0, x0 + tw, y0 + h, r);
  ctx.arcTo(x0 + tw, y0 + h, x0, y0 + h, r);
  ctx.arcTo(x0, y0 + h, x0, y0, r);
  ctx.arcTo(x0, y0, x0 + tw, y0, r);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = opts.color || "#e2e8f0";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const spr = new THREE.Sprite(mat);
  const scale = opts.scale || 12;
  spr.scale.set(scale, scale * 0.25, 1);
  spr.renderOrder = 10;
  return spr;
}

/** 在相邻节点中点标注段长；滚筒↔滚筒加粗显示 */
function updateDistLabels() {
  if (!labelGroup) return;
  while (labelGroup.children.length) {
    const c = labelGroup.children.pop();
    c.material?.map?.dispose?.();
    c.material?.dispose?.();
  }
  const nodes = state.nodes;
  for (let i = 1; i < nodes.length; i++) {
    const a = nodes[i - 1];
    const b = nodes[i];
    // 回程段标签略弱，避免太乱：只标承载，或两端都是滚筒
    const bothReturn = isReturnNode(a) && isReturnNode(b);
    const drumSpan = isDrumType(a.type) && isDrumType(b.type);
    if (bothReturn && !drumSpan) continue;
    const L = dist(a, b);
    if (!(L > 0.05)) continue;
    const mid = {
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      z: (a.z + b.z) / 2,
    };
    const label = drumSpan
      ? `${TYPE_LABEL[a.type]||a.type}→${TYPE_LABEL[b.type]||b.type} ${L.toFixed(2)}m`
      : `${L.toFixed(2)} m`;
    const spr = makeTextSprite(label, {
      color: drumSpan ? "#fde68a" : bothReturn ? "#fdba74" : "#bfdbfe",
      scale: drumSpan ? 18 : 12,
      fontSize: drumSpan ? 26 : 28,
    });
    spr.position.set(mid.x, mid.y, mid.z + (drumSpan ? 3.5 : 2.2));
    spr.userData.isDistLabel = true;
    labelGroup.add(spr);
  }
}

function drumNeighborGaps(node) {
  if (!node) return null;
  const carry = state.nodes.filter((n) => !isReturnNode(n));
  const idx = carry.findIndex((n) => n.id === node.id);
  if (idx < 0) return null;
  // find prev/next drum on carry
  let prev = null, next = null;
  for (let i = idx - 1; i >= 0; i--) {
    if (isDrumType(carry[i].type)) { prev = carry[i]; break; }
  }
  for (let i = idx + 1; i < carry.length; i++) {
    if (isDrumType(carry[i].type)) { next = carry[i]; break; }
  }
  return {
    prevDrum: prev,
    nextDrum: next,
    dPrev: prev ? dist(prev, node) : null,
    dNext: next ? dist(node, next) : null,
  };
}


function rebuildSceneObjects() {
  while (pointGroup.children.length) {
    const c = pointGroup.children.pop();
    c.geometry?.dispose?.();
    if (c.material) {
      if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose());
      else c.material.dispose?.();
    }
  }

  state.nodes.forEach((n, i) => pointGroup.add(makePointMesh(n, i)));

  updatePathLines();
}

function setLinePositions(line, pts) {
  if (!line) return;
  if (!pts || pts.length < 2) {
    if (line.geometry) line.geometry.setDrawRange(0, 0);
    return;
  }
  const n = pts.length;
  const need = n * 3;
  let attr = line.geometry.getAttribute("position");
  if (!attr || attr.array.length < need) {
    line.geometry.dispose();
    line.geometry = new THREE.BufferGeometry();
    attr = new THREE.BufferAttribute(new Float32Array(Math.max(need, 64)), 3);
    line.geometry.setAttribute("position", attr);
  }
  const arr = attr.array;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    arr[i * 3] = p.x;
    arr[i * 3 + 1] = p.y;
    arr[i * 3 + 2] = p.z;
  }
  attr.needsUpdate = true;
  line.geometry.setDrawRange(0, n);
  line.geometry.computeBoundingSphere();
}

function updatePathLines() {
  const carry = [];
  const ret = [];
  for (const n of state.nodes) {
    if (n.branch === "return" || n.strand === "return") ret.push(n);
    else carry.push(n);
  }
  // 承载折线
  setLinePositions(pathLine, carry);
  // 回程折线：头 → 回程点… （头作为回程起点视觉连接）
  if (ret.length && carry.length) {
    setLinePositions(returnLine, [carry[carry.length - 1], ...ret]);
    // 闭合：最后回程 → 尾
    setLinePositions(closeLine, [ret[ret.length - 1], carry[0]]);
  } else {
    // 无回程时整链用承载色
    setLinePositions(pathLine, state.nodes);
    setLinePositions(returnLine, []);
    setLinePositions(closeLine, []);
  }
}

function syncNodeMeshes() {
  // O(n) 索引，避免每帧 nodes.find
  const byId = new Map(state.nodes.map((n) => [n.id, n]));
  for (const mesh of pointGroup.children) {
    const n = byId.get(mesh.userData.nodeId);
    if (!n) continue;
    mesh.position.set(n.x, n.y, n.z);
    const selected = n.id === state.selectedId;
    const base = (n.branch === "return" || n.strand === "return")
      ? RETURN_COLOR
      : (TYPE_COLOR[n.type] || TYPE_COLOR.node);
    mesh.material.color.setHex(base);
    if (selected) mesh.material.color.offsetHSL(0, 0, 0.18);
  }
  updatePathLines();
}

function applyMode(mode) {
  state.mode = mode;
  document.querySelectorAll(".btn.mode").forEach((b) => {
    b.classList.toggle("active", b.dataset.mode === mode);
  });

  const w = els.viewport.clientWidth;
  const h = els.viewport.clientHeight;
  const aspect = w / h;
  const target = controls.target.clone();

  if (mode === "3d") {
    const persp = new THREE.PerspectiveCamera(50, aspect, 0.1, 5000);
    persp.up.set(0, 0, 1);
    persp.position.copy(camera.position);
    if (camera.isOrthographicCamera) {
      persp.position.set(target.x + 180, target.y - 220, target.z + 120);
    }
    camera = persp;
    controls.object = camera;
    controls.enableRotate = true;
    controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
    groundMesh.rotation.set(0, 0, 0);
    groundMesh.position.set(0, 0, 0);
    els.modeChip.textContent = "模式：3D";
    els.hudHint.textContent = "3D：左键拖点 / 空白处平移 · Alt+左键或中键旋转 · 滚轮缩放";
  } else if (mode === "2d-xy") {
    const frustum = 200;
    const ortho = new THREE.OrthographicCamera(
      (-frustum * aspect) / 2,
      (frustum * aspect) / 2,
      frustum / 2,
      -frustum / 2,
      0.1,
      5000
    );
    ortho.up.set(0, 1, 0);
    ortho.position.set(target.x, target.y, 400);
    ortho.lookAt(target.x, target.y, 0);
    camera = ortho;
    controls.object = camera;
    controls.enableRotate = false;
    controls.target.set(target.x, target.y, 0);
    groundMesh.rotation.set(0, 0, 0);
    groundMesh.position.set(0, 0, 0);
    els.modeChip.textContent = "模式：2D 俯视 XY";
    els.hudHint.textContent = "2D 俯视：拖点改 X/Y · 高程 Z 用右侧表或选中面板修改";
  } else {
    // 2d-xz side view: looking along -Y
    const frustum = 200;
    const ortho = new THREE.OrthographicCamera(
      (-frustum * aspect) / 2,
      (frustum * aspect) / 2,
      frustum / 2,
      -frustum / 2,
      0.1,
      5000
    );
    ortho.up.set(0, 0, 1);
    ortho.position.set(target.x, -400, target.z);
    ortho.lookAt(target.x, 0, target.z);
    camera = ortho;
    controls.object = camera;
    controls.enableRotate = false;
    controls.target.set(target.x, 0, target.z);
    // ground for raycast: XZ plane (rotate so normal is +Y)
    groundMesh.rotation.set(-Math.PI / 2, 0, 0);
    groundMesh.position.set(0, 0, 0);
    els.modeChip.textContent = "模式：2D 侧视 XZ";
    els.hudHint.textContent = "2D 侧视：拖点改 X/Z（看坡度）· Y 横向偏移用表修改";
  }

  controls.update();
  onResize();
}

function fitView() {
  if (!state.nodes.length) {
    controls.target.set(0, 0, 0);
    if (camera.isPerspectiveCamera) camera.position.set(120, -160, 80);
    controls.update();
    return;
  }
  const box = new THREE.Box3();
  state.nodes.forEach((n) => box.expandByPoint(new THREE.Vector3(n.x, n.y, n.z)));
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z, 40);
  controls.target.copy(center);
  if (state.mode === "3d") {
    camera.position.set(center.x + maxDim * 0.9, center.y - maxDim * 1.1, center.z + maxDim * 0.7);
  } else if (state.mode === "2d-xy") {
    camera.position.set(center.x, center.y, 400);
    const aspect = els.viewport.clientWidth / els.viewport.clientHeight;
    const frustum = maxDim * 1.4;
    camera.left = (-frustum * aspect) / 2;
    camera.right = (frustum * aspect) / 2;
    camera.top = frustum / 2;
    camera.bottom = -frustum / 2;
    camera.updateProjectionMatrix();
  } else {
    camera.position.set(center.x, -400, center.z);
    const aspect = els.viewport.clientWidth / els.viewport.clientHeight;
    const frustum = maxDim * 1.4;
    camera.left = (-frustum * aspect) / 2;
    camera.right = (frustum * aspect) / 2;
    camera.top = frustum / 2;
    camera.bottom = -frustum / 2;
    camera.updateProjectionMatrix();
  }
  controls.update();
}

function setPointerFromEvent(ev) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
}

function pickPoint() {
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(pointGroup.children, false);
  return hits[0] || null;
}

function hitGround() {
  raycaster.setFromCamera(pointer, camera);
  if (state.mode === "2d-xz") {
    // intersect XZ plane y=0
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const pt = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(plane, pt)) return pt;
    return null;
  }
  // XY plane z = selected z or 0
  const z = state.selectedId
    ? state.nodes.find((n) => n.id === state.selectedId)?.z ?? 0
    : 0;
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -z);
  const pt = new THREE.Vector3();
  if (raycaster.ray.intersectPlane(plane, pt)) return pt;
  return null;
}

function addNodeAt(pt, type = "node") {
  const selected = state.nodes.find((n) => n.id === state.selectedId);
  // Auto 模式只允许往承载加点（回程由 Auto Return 重算）
  if (!isAdvancedReturn() && selected && isReturnNode(selected)) {
    const carry = extractCarryChain(state.nodes);
    state.selectedId = carry.at(-1)?.id ?? null;
  }

  const selAfter = state.nodes.find((n) => n.id === state.selectedId);
  const asReturn = isAdvancedReturn() && selAfter && isReturnNode(selAfter);
  const branch = asReturn ? "return" : "carry";

  const node = {
    id: uid(),
    x: +pt.x.toFixed(3),
    y: state.mode === "2d-xz" ? 0 : +pt.y.toFixed(3),
    z: state.mode === "2d-xy" ? (extractCarryChain(state.nodes).at(-1)?.z ?? 0) : +pt.z.toFixed(3),
    type,
    mainDrive: type === "drive",
    branch,
    strand: branch,
    auto_return: false,
  };
  if (type === "drive") {
    state.nodes.forEach((n) => {
      if (n.type === "drive") n.mainDrive = false;
    });
  }

  if (selAfter) {
    const idx = state.nodes.findIndex((n) => n.id === selAfter.id);
    if (!isAdvancedReturn() && state.nodes.some(isReturnNode) && !isReturnNode(selAfter)) {
      // Auto：插到承载末尾（第一个回程点之前）若选中接近回程
      const firstRet = state.nodes.findIndex(isReturnNode);
      const insertAt = firstRet >= 0 && idx >= firstRet - 1 ? firstRet : idx + 1;
      state.nodes.splice(insertAt, 0, node);
    } else {
      state.nodes.splice(idx + 1, 0, node);
    }
  } else if (!isAdvancedReturn() && state.nodes.some(isReturnNode)) {
    const firstRet = state.nodes.findIndex(isReturnNode);
    const idx = firstRet >= 0 ? firstRet : state.nodes.length;
    state.nodes.splice(idx, 0, node);
  } else {
    state.nodes.push(node);
  }

  if (asReturn) markAdvancedReturnMeta({ source: state.returnMeta?.source || "advanced_edit" });

  state.selectedId = node.id;
  rebuildSceneObjects();
  maybeResyncReturn({ skipFit: true });
  updateUI();
  if (isDrumType(type)) {
    const gaps = drumNeighborGaps(node);
    const bits = [];
    if (gaps?.dPrev != null) bits.push(`距上一滚筒(${TYPE_LABEL[gaps.prevDrum.type]}) ${gaps.dPrev.toFixed(2)} m`);
    if (gaps?.dNext != null) bits.push(`距下一滚筒(${TYPE_LABEL[gaps.nextDrum.type]}) ${gaps.dNext.toFixed(2)} m`);
    // 轻提示：不打断拖放流程，写到 HUD
    if (els.hudHint && bits.length) {
      els.hudHint.textContent = `已放置${TYPE_LABEL[type] || type} · ` + bits.join(" · ");
    }
  }
}

function insertAfterSelected() {
  const idx = state.nodes.findIndex((n) => n.id === state.selectedId);
  if (idx < 0) return;
  const a = state.nodes[idx];
  if (!isAdvancedReturn() && isReturnNode(a)) {
    alert("Auto Return 模式：请在承载上插点。\n回程点会随承载自动重算。");
    return;
  }
  const b = state.nodes[idx + 1] || { x: a.x + 20, y: a.y, z: a.z };
  const branch = isAdvancedReturn() && isReturnNode(a) ? "return" : "carry";
  const node = {
    id: uid(),
    x: +((a.x + b.x) / 2).toFixed(3),
    y: +((a.y + b.y) / 2).toFixed(3),
    z: +((a.z + b.z) / 2).toFixed(3),
    type: "node",
    branch,
    strand: branch,
    auto_return: false,
  };
  state.nodes.splice(idx + 1, 0, node);
  state.selectedId = node.id;
  if (branch === "return") markAdvancedReturnMeta({ source: state.returnMeta?.source || "advanced_edit" });
  rebuildSceneObjects();
  maybeResyncReturn({ skipFit: true });
  updateUI();
}

function deleteSelected() {
  if (!state.selectedId) return;
  const cur = state.nodes.find((n) => n.id === state.selectedId);
  if (cur && isReturnNode(cur) && !isAdvancedReturn()) {
    alert("Auto Return 模式不能删除回程点。\n请切换到 Advanced，或改承载后自动重算回程。");
    return;
  }
  state.nodes = state.nodes.filter((n) => n.id !== state.selectedId);
  state.selectedId = state.nodes[0]?.id ?? null;
  rebuildSceneObjects();
  maybeResyncReturn({ skipFit: true });
  updateUI();
}

function beginDrag(nodeId, ev) {
  const node = state.nodes.find((n) => n.id === nodeId);
  if (!node) return;
  // Auto Return：回程点锁定（对标 Belt Analyst）
  if (!isAdvancedReturn() && isReturnNode(node)) {
    alert("当前为 Auto Return 模式：回程点锁定。\n如需手改回程，请切换到 Advanced。");
    state.selectedId = nodeId;
    updateUI();
    return;
  }
  state.dragging = true;
  state.dragId = nodeId;
  controls.enabled = false;

  const origin = new THREE.Vector3(node.x, node.y, node.z);
  if (state.mode === "3d") {
    // drag on plane parallel to view, through point — or horizontal/vertical combo
    // Use camera-facing plane for free 3D feel, then constrain lightly
    const normal = new THREE.Vector3();
    camera.getWorldDirection(normal);
    dragPlane.setFromNormalAndCoplanarPoint(normal.negate(), origin);
  } else if (state.mode === "2d-xy") {
    dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 0, 1), origin);
  } else {
    dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), origin);
  }

  setPointerFromEvent(ev);
  raycaster.setFromCamera(pointer, camera);
  const hit = new THREE.Vector3();
  raycaster.ray.intersectPlane(dragPlane, hit);
  dragOffset.copy(origin).sub(hit);
}

let dragRaf = 0;
let returnResyncTimer = 0;
let needsRender = true;

/** 拖拽中只更新右侧 XYZ，避免每帧重绘 Flight/区段表导致卡顿 */
function updateDragHud(node) {
  if (!node) return;
  if (els.fX) els.fX.value = String(node.x);
  if (els.fY) els.fY.value = String(node.y);
  if (els.fZ) els.fZ.value = String(node.z);
  els.lengthChip.textContent = `展开长：${totalLength().toFixed(2)} m`;
}

function onDrag(ev) {
  if (!state.dragging || !state.dragId) return;
  const node = state.nodes.find((n) => n.id === state.dragId);
  if (!node) return;

  setPointerFromEvent(ev);
  raycaster.setFromCamera(pointer, camera);
  const hit = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(dragPlane, hit)) return;
  hit.add(dragOffset);

  if (state.mode === "2d-xy") {
    node.x = +hit.x.toFixed(3);
    node.y = +hit.y.toFixed(3);
  } else if (state.mode === "2d-xz") {
    node.x = +hit.x.toFixed(3);
    node.z = +hit.z.toFixed(3);
  } else {
    node.x = +hit.x.toFixed(3);
    node.y = +hit.y.toFixed(3);
    node.z = +hit.z.toFixed(3);
  }

  // 只同步三维网格/折线；DOM 用 rAF 节流
  syncNodeMeshes();
  if (!dragRaf) {
    dragRaf = requestAnimationFrame(() => {
      dragRaf = 0;
      updateDragHud(node);
    });
  }
}

function endDrag() {
  if (!state.dragging) return;
  const dragged = state.nodes.find((n) => n.id === state.dragId);
  state.dragging = false;
  state.dragId = null;
  controls.enabled = true;
  if (dragRaf) {
    cancelAnimationFrame(dragRaf);
    dragRaf = 0;
  }
  if (dragged && isReturnNode(dragged)) {
    markAdvancedReturnMeta({ source: state.returnMeta?.source || "advanced_edit" });
  }
  if (dragged && !isReturnNode(dragged)) {
    // 松手后短延迟再整网重算回程，避免拖一下就卡一下
    if (returnResyncTimer) clearTimeout(returnResyncTimer);
    returnResyncTimer = setTimeout(() => {
      returnResyncTimer = 0;
      maybeResyncReturn({ skipFit: true });
      updateUI();
      needsRender = true;
    }, 80);
  } else {
    updateUI();
  }
  needsRender = true;
}

function bindPointer() {
  const el = renderer.domElement;

  el.addEventListener("pointerdown", (ev) => {
    if (ev.button !== 0) return;
    if (ev.altKey) return; // orbit
    setPointerFromEvent(ev);
    const hit = pickPoint();

    if (state.tool === "add" && !hit) {
      const pt = hitGround();
      if (pt) addNodeAt(pt);
      return;
    }

    if (hit) {
      const id = hit.object.userData.nodeId;
      state.selectedId = id;
      updateUI();
      if (state.tool === "delete") {
        deleteSelected();
        return;
      }
      if (state.tool === "insert") {
        insertAfterSelected();
        return;
      }
      if (state.tool === "select" || state.tool === "add") {
        beginDrag(id, ev);
      }
    }
  });

  el.addEventListener("pointermove", (ev) => onDrag(ev));
  el.addEventListener("pointerup", () => endDrag());
  el.addEventListener("pointerleave", () => endDrag());

  // drop drum from palette
  el.addEventListener("dragover", (ev) => ev.preventDefault());
  el.addEventListener("drop", (ev) => {
    ev.preventDefault();
    const type = ev.dataTransfer.getData("text/drum-type") || "bend";
    setPointerFromEvent(ev);
    const pt = hitGround();
    if (pt) addNodeAt(pt, type);
  });
}

function updateUI(rebuildTable = true) {
  // 拖拽中禁止走完整 UI（Flight/区段表很重）
  if (state.dragging) {
    const n = state.nodes.find((x) => x.id === state.selectedId);
    updateDragHud(n);
    return;
  }

  updateReturnModeChip();
  els.pointCount.textContent = `节点：${state.nodes.length}`;
  els.lengthChip.textContent = `展开长：${totalLength().toFixed(2)} m`;

  const node = state.nodes.find((n) => n.id === state.selectedId);
  if (!node) {
    els.noSelection.classList.remove("hidden");
    els.nodeFields.classList.add("hidden");
  } else {
    els.noSelection.classList.add("hidden");
    els.nodeFields.classList.remove("hidden");
    const idx = state.nodes.indexOf(node);
    els.fIndex.value = String(idx + 1);
    els.fType.value = node.type;
    els.fX.value = String(node.x);
    els.fY.value = String(node.y);
    els.fZ.value = String(node.z);
    els.fMainDrive.checked = !!node.mainDrive;
    els.fMainDrive.disabled = node.type !== "drive";
    if (els.fDrumD) {
      els.fDrumD.value = node.drum_D_mm != null ? String(node.drum_D_mm) : "";
      els.fDrumD.disabled = !isAdvancedReturn() && isReturnNode(node);
    }
    if (els.fWrap) {
      const i = state.nodes.indexOf(node);
      const w = node.wrap_angle_deg != null ? node.wrap_angle_deg : computeWrapAtNode(state.nodes, i).wrap_angle_deg;
      els.fWrap.value = w != null ? String(w) : "";
    }
  }

  if (rebuildTable) renderTable();
  else syncTableInputs();
  if (!els.panelFlight?.classList.contains("hidden")) renderFlightTable();
  else refreshFlights();

  // segment summary
  let html = "";
  for (let i = 1; i < state.nodes.length; i++) {
    const a = state.nodes[i - 1];
    const b = state.nodes[i];
    const L = dist(a, b);
    const dH = b.z - a.z;
    const ang = (Math.atan2(dH, Math.hypot(b.x - a.x, b.y - a.y)) * 180) / Math.PI;
    html += `<div><strong>段 ${i}</strong>：L=${L.toFixed(2)} m，ΔH=${dH.toFixed(2)} m，倾角≈${ang.toFixed(2)}°</div>`;
  }
  if (!html) html = "<div>暂无区段</div>";
  els.segSummary.innerHTML = html;

  // 选中滚筒时显示与相邻滚筒间距
  const gapEl = document.getElementById("drumGapChip");
  const gaps = drumNeighborGaps(node);
  if (gapEl) {
    if (node && isDrumType(node.type) && gaps) {
      const parts = [];
      if (gaps.dPrev != null) parts.push(`←${TYPE_LABEL[gaps.prevDrum.type]} ${gaps.dPrev.toFixed(2)}m`);
      if (gaps.dNext != null) parts.push(`${TYPE_LABEL[gaps.nextDrum.type]}→ ${gaps.dNext.toFixed(2)}m`);
      gapEl.textContent = parts.length ? `滚筒间距：${parts.join(" · ")}` : "滚筒间距：无相邻滚筒";
      gapEl.classList.remove("hidden", "muted");
    } else {
      gapEl.textContent = "滚筒间距：—";
      gapEl.classList.add("muted");
    }
  }
  updateDistLabels();

  syncNodeMeshes();
}

function renderTable() {
  els.tbody.innerHTML = "";
  state.nodes.forEach((n, i) => {
    const prev = state.nodes[i - 1];
    const seg = prev ? dist(prev, n).toFixed(2) : "—";
    const tr = document.createElement("tr");
    if (n.id === state.selectedId) tr.classList.add("selected");
    tr.dataset.id = n.id;
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${TYPE_LABEL[n.type] || n.type}${n.mainDrive ? "★" : ""}${isReturnNode(n) ? "·回" : ""}${n.template ? "·模" : ""}</td>
      <td><input data-f="x" type="number" step="0.01" value="${n.x}" /></td>
      <td><input data-f="y" type="number" step="0.01" value="${n.y}" /></td>
      <td><input data-f="z" type="number" step="0.01" value="${n.z}" /></td>
      <td>${seg}</td>
    `;
    tr.addEventListener("click", (ev) => {
      if (ev.target.tagName === "INPUT") return;
      state.selectedId = n.id;
      updateUI();
    });
    tr.querySelectorAll("input").forEach((inp) => {
      inp.addEventListener("change", () => {
        if (!isAdvancedReturn() && isReturnNode(n)) {
          alert("Auto Return 模式：回程锁定，不能手改。\n请切换 Advanced。");
          updateUI();
          return;
        }
        const f = inp.dataset.f;
        n[f] = parseFloat(inp.value) || 0;
        if (isReturnNode(n)) markAdvancedReturnMeta({ source: state.returnMeta?.source || "advanced_edit" });
        rebuildSceneObjects();
        if (!isReturnNode(n)) maybeResyncReturn({ skipFit: true });
        updateUI();
      });
    });
    els.tbody.appendChild(tr);
  });
}

function syncTableInputs() {
  els.tbody.querySelectorAll("tr").forEach((tr) => {
    const n = state.nodes.find((x) => x.id === tr.dataset.id);
    if (!n) return;
    tr.classList.toggle("selected", n.id === state.selectedId);
    tr.querySelector('input[data-f="x"]').value = n.x;
    tr.querySelector('input[data-f="y"]').value = n.y;
    tr.querySelector('input[data-f="z"]').value = n.z;
  });
}

function onResize() {
  if (!renderer || !camera) return;
  const w = els.viewport.clientWidth;
  const h = els.viewport.clientHeight;
  renderer.setSize(w, h);
  if (camera.isPerspectiveCamera) {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  } else {
    const frustum = (camera.top - camera.bottom);
    const aspect = w / h;
    camera.left = (-frustum * aspect) / 2;
    camera.right = (frustum * aspect) / 2;
    camera.updateProjectionMatrix();
  }
}

function animate() {
  requestAnimationFrame(animate);
  if (controls) controls.update();
  // 拖拽或显式脏标记时必画；其余帧也画（保证旋转惯性），但避免额外重活已在拖拽路径去掉
  renderer.render(scene, camera);
}


function currentExportOpts(extraLine = {}) {
  const closed = !!(state.returnMeta && state.returnMeta.closed_loop);
  return {
    nodes: state.nodes,
    modeHint: state.mode,
    returnMeta: state.returnMeta,
    line: {
      line_id: "demo-slope-01",
      name: closed ? "示例坡道（含 Auto Return 闭环）" : "示例坡道（编辑器）",
      open_path: !closed,
      closed_loop: closed,
      return_mode: state.returnMeta?.return_mode || "none",
      carry_return_offset_m: state.returnMeta?.carry_return_offset_m ?? getReturnOffset(),
      ...extraLine,
    },
  };
}


function remapNodeIds(nodes) {
  return (nodes || []).map((n) => ({
    ...n,
    id: uid(),
    y: n.y ?? 0,
    branch: n.branch || "carry",
    strand: n.strand || n.branch || "carry",
    mainDrive: !!n.mainDrive,
    drum_D_mm: n.drum_D_mm,
    wrap_angle_deg: n.wrap_angle_deg,
  }));
}


function isClosedPath() {
  const m = state.returnMeta || {};
  return !!(m.closed_loop || m.closedLoop);
}

function refreshFlights() {
  state.flights = buildFlightRows(state.nodes, {
    closed_loop: isClosedPath(),
    flightOverrides: state.flightOverrides,
  });
  return state.flights;
}

function renderFlightTable() {
  if (!els.flightBody) return;
  const flights = refreshFlights();
  const sum = summarizeFlights(flights);
  if (els.flightSummary) {
    els.flightSummary.textContent =
      `承载 ${sum.carry_count} / 回程 ${sum.return_count} · L_c=${sum.L_carry_m} · 配对 ${sum.paired_pairs}`;
  }
  els.flightBody.innerHTML = "";
  flights.forEach((f) => {
    const tr = document.createElement("tr");
    tr.dataset.id = f.id;
    tr.innerHTML = `
      <td>${f.seq}</td>
      <td>${f.branch}</td>
      <td>${f.major_id || ""}</td>
      <td>${f.L_m}</td>
      <td>${f.H_m}</td>
      <td>${f.delta_deg}</td>
      <td><input data-f="a_idler_m" type="number" step="0.1" value="${f.a_idler_m ?? ""}" style="width:4rem" /></td>
      <td><input data-f="R_m" type="number" step="0.1" value="${f.R_m ?? ""}" style="width:4rem" /></td>
      <td>
        <select data-f="curve_kind">
          <option value="">—</option>
          <option value="convex" ${f.curve_kind === "convex" ? "selected" : ""}>凸</option>
          <option value="concave" ${f.curve_kind === "concave" ? "selected" : ""}>凹</option>
          <option value="horizontal" ${f.curve_kind === "horizontal" ? "selected" : ""}>水平弯</option>
        </select>
      </td>
      <td>${f.paired_flight_id || "—"}</td>
      <td>${f.classify_status}</td>`;
    tr.querySelectorAll("input,select").forEach((el) => {
      el.addEventListener("change", () => {
        const key = el.dataset.f;
        let val = el.value;
        if (key === "a_idler_m" || key === "R_m") {
          val = val === "" ? null : parseFloat(val);
        }
        state.flightOverrides[f.id] = {
          ...(state.flightOverrides[f.id] || {}),
          [key]: val,
        };
        state.finalized = false;
        updateFinalizeChip();
        renderFlightTable();
      });
    });
    els.flightBody.appendChild(tr);
  });
}

function updateFinalizeChip() {
  if (!els.finalizeChip) return;
  if (state.finalized && state.finalizeResult?.ok) {
    els.finalizeChip.textContent = "Finalize：已锁定";
    els.finalizeChip.className = "chip ok";
  } else if (state.finalizeResult && !state.finalizeResult.ok) {
    els.finalizeChip.textContent = "Finalize：未通过";
    els.finalizeChip.className = "chip warn";
  } else {
    els.finalizeChip.textContent = "Finalize：未锁定";
    els.finalizeChip.className = "chip";
  }
}

function switchTableTab(tab) {
  const flight = tab === "flight";
  document.getElementById("tabXyz")?.classList.toggle("active", !flight);
  document.getElementById("tabFlight")?.classList.toggle("active", flight);
  els.panelXyz?.classList.toggle("hidden", flight);
  els.panelFlight?.classList.toggle("hidden", !flight);
  if (flight) renderFlightTable();
}

function openEasyModal() {
  const sel = document.getElementById("easyPreset");
  if (sel && !sel.options.length) {
    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "自定义参数";
    sel.appendChild(opt0);
    EASY_PRESETS.forEach((p) => {
      const o = document.createElement("option");
      o.value = p.id;
      o.textContent = p.name;
      sel.appendChild(o);
    });
  }
  els.easyModal?.classList.remove("hidden");
}

function closeEasyModal() {
  els.easyModal?.classList.add("hidden");
}

function applyEasyFromModal() {
  try {
    const preset = document.getElementById("easyPreset")?.value || "";
    const Ln = parseFloat(document.getElementById("easyLn")?.value || "100");
    const H = parseFloat(document.getElementById("easyH")?.value || "0");
    const offset = parseFloat(document.getElementById("easyOffset")?.value || "1.2");
    const mids = parseInt(document.getElementById("easyMids")?.value || "2", 10);
    const driveAt = document.getElementById("easyDriveAt")?.value || "head";
    const { nodes, meta } = preset
      ? buildEasyFromPreset(preset, {
          Ln_m: Ln,
          H_m: H,
          return_offset_m: offset,
          mid_points: mids,
          drive_at: driveAt,
        })
      : buildEasyInclineConveyor({
          Ln_m: Ln,
          H_m: H,
          return_offset_m: offset,
          mid_points: mids,
          drive_at: driveAt,
        });
    const modeEl = document.getElementById("profileMode");
    if (modeEl) modeEl.value = "auto";
    state.returnMode = "auto";
    state.nodes = remapNodeIds(nodes);
    state.returnMeta = { ...meta, closed_loop: true, open_path: false, return_mode: "auto" };
    state.selectedId = state.nodes[0]?.id ?? null;
    state.flightOverrides = {};
    state.finalized = false;
    const offEl = document.getElementById("returnOffset");
    if (offEl && Number.isFinite(meta.carry_return_offset_m)) offEl.value = String(meta.carry_return_offset_m);
    rebuildSceneObjects();
    updateUI();
    fitView();
    updateReturnModeChip();
    updateFinalizeChip();
    closeEasyModal();
    alert(
      "Easy 向导已生成（对标 Sidewinder）\n\n" +
        `模板：${meta.preset_name || "自定义"}\n` +
        `Ln=${meta.Ln_m} m · H=${meta.H_m} m · δ≈${meta.delta_deg}°\n` +
        `节点 ${state.nodes.length}`
    );
  } catch (err) {
    alert("Easy 向导失败：\n" + (err?.message || err));
  }
}

function onEasyPresetChange() {
  const id = document.getElementById("easyPreset")?.value;
  const p = EASY_PRESETS.find((x) => x.id === id);
  const desc = document.getElementById("easyPresetDesc");
  if (!p) {
    if (desc) desc.textContent = "自定义参数快搭斜坡机。";
    return;
  }
  if (desc) desc.textContent = p.desc;
  const set = (i, v) => { const el = document.getElementById(i); if (el) el.value = v; };
  set("easyLn", p.opts.Ln_m);
  set("easyH", p.opts.H_m);
  set("easyOffset", p.opts.return_offset_m);
  set("easyMids", p.opts.mid_points);
  set("easyDriveAt", p.opts.drive_at);
}

function pairFlightsAction() {
  const flights = refreshFlights();
  const { flights: paired, meta } = pairCarryReturnFlights(flights);
  state.flightOverrides = {
    ...state.flightOverrides,
    ...flightRowsToOverrides(paired),
  };
  state.finalized = false;
  renderFlightTable();
  updateFinalizeChip();
  const lock = confirm(
    `航段配对完成\n\n配对对数：${meta.paired_pairs}\n${meta.note}\n\n是否强制间距跟随（按承载重算回程）？`
  );
  if (lock) enforceSpacingFollowAction({ quiet: true });
}

function enforceSpacingFollowAction(opts = {}) {
  const offset = parseFloat(document.getElementById("returnOffset")?.value || "1.2");
  try {
    const { nodes, meta } = enforcePairedReturnOffset(state.nodes, offset, { mode: "auto" });
    const modeEl = document.getElementById("profileMode");
    if (modeEl) modeEl.value = "auto";
    state.returnMode = "auto";
    state.nodes = remapNodeIds(nodes);
    state.returnMeta = {
      ...meta,
      closed_loop: true,
      open_path: false,
      return_mode: "auto",
      spacing_locked: true,
    };
    state.selectedId = state.nodes[0]?.id ?? null;
    state.flightOverrides = {};
    state.finalized = false;
    rebuildSceneObjects();
    updateUI();
    fitView();
    updateReturnModeChip();
    updateFinalizeChip();
    renderFlightTable();
    if (!opts.quiet) {
      alert(`强制间距跟随已应用\n\n${meta.note}\n节点 ${state.nodes.length}`);
    }
  } catch (err) {
    alert("强制间距跟随失败：\n" + (err?.message || err));
  }
}


function getCurveDesignOpts() {
  const loads = resolveDesignLoads(GC01_INPUT);
  return {
    v_mps: loads.v_mps,
    T_N: loads.T_N,
    qB: loads.qB,
    qG: loads.qG,
    a_idler_m: loads.a_idler_m,
    B_mm: loads.B_mm,
    mu: loads.mu,
    S_tight_N: loads.S_tight_N,
    S_slack_N: loads.S_slack_N,
    _source: loads.source,
    _note: loads.note,
  };
}

function runFinalizeAction() {
  // ensure wraps annotated
  state.nodes = annotateWrapAngles(state.nodes);
  const curveOpts = getCurveDesignOpts();
  const result = finalizeProfile({
    nodes: state.nodes,
    returnMeta: state.returnMeta,
    flightOverrides: state.flightOverrides,
    ...curveOpts,
  });
  const wrapChk = checkWrapDtii(state.nodes, {
    min_drive_wrap_deg: 180,
    mu: curveOpts.mu,
    S_tight_N: curveOpts.S_tight_N,
    S_slack_N: curveOpts.S_slack_N,
  });
  const curveChk = checkVerticalCurveDtii(result.flights, curveOpts);
  state.finalizeResult = result;
  state.finalized = !!result.ok;
  if (result.ok) {
    state.flightOverrides = {
      ...state.flightOverrides,
      ...flightRowsToOverrides(result.flights),
    };
  }
  updateFinalizeChip();
  renderFlightTable();
  if (els.finalizeSummary) {
    const lines = result.items.map((i) => `[${i.level}] ${i.code}: ${i.message}`);
    lines.push(`包角校核：${wrapChk.ok ? "通过" : "有告警"}`);
    lines.push(`竖曲线正式 Rmin：${curveChk.ok ? "通过" : "有告警/无曲线"}`);
    if (curveChk.items?.[0]?.breakdown) {
      const b = curveChk.items[0].breakdown;
      lines.push(
        `Rmin 分解示例：张力 ${b.R_tension_m} / 速度 ${b.R_velocity_m}` +
          (b.R_sag_m != null ? ` / 下垂 ${b.R_sag_m}` : "") +
          " m"
      );
    }
    if (result.slip?.items?.length) {
      lines.push(`不打滑：${result.slip.ok ? "通过" : "有告警"}`);
    }
    els.finalizeSummary.innerHTML = `<div><strong>Finalize</strong>：${result.meta.note}</div>` +
      lines.map((l) => `<div>${l}</div>`).join("");
  }
  alert(
    (result.ok ? "Finalize 通过，剖面已锁定\n\n" : "Finalize 未通过\n\n") +
      result.items.slice(0, 8).map((i) => `[${i.level}] ${i.message}`).join("\n")
  );
  updateUI(false);
}

function downloadText(filename, text, mime = "text/plain") {
  const blob = new Blob([text], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function exportDxfAction() {
  try {
    const carry = extractCarryChain(state.nodes);
    const dxf = exportNodesToDxf(carry, { plane: "xz", unit_scale: 1 });
    downloadText("pidm-centerline.xz.dxf", dxf, "application/dxf");
  } catch (err) {
    alert("DXF 导出失败：\n" + (err?.message || err));
  }
}

function exportExcelAction() {
  const flights = refreshFlights();
  const kind = confirm("确定=导出节点CSV；取消=导出 Flight CSV") ? "nodes" : "flights";
  if (kind === "nodes") downloadText("pidm-nodes.csv", nodesToCsv(state.nodes), "text/csv");
  else downloadText("pidm-flights.csv", flightsToCsv(flights), "text/csv");
}

function importExcelFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const text = String(reader.result || "");
      const header = text.split(/\\r?\n/)[0] || "";
      if (/\bL_m\b/i.test(header) || /\bpaired_flight_id\b/i.test(header)) {
        state.flightOverrides = { ...state.flightOverrides, ...csvToFlightOverrides(text) };
        state.finalized = false;
        renderFlightTable();
        alert("Flight CSV 已合并到段属性覆盖层");
      } else {
        const nodes = remapNodeIds(csvToNodes(text));
        const modeEl = document.getElementById("profileMode");
        if (modeEl) modeEl.value = "auto";
        state.returnMode = "auto";
        applyAutoReturn(nodes, { quiet: true });
        state.flightOverrides = {};
        state.finalized = false;
        alert(`节点 CSV 已导入并 Auto Return\n节点：${state.nodes.length}`);
      }
      updateFinalizeChip();
      updateUI();
      fitView();
    } catch (err) {
      alert("Excel/CSV 导入失败：\n" + (err?.message || err));
    }
  };
  reader.readAsText(file);
}


function loadEasyWizard() {
  openEasyModal();
}

function importDxfFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const plane = prompt("DXF 平面：xy 或 xz（侧视坡度用 xz）", "xz") || "xz";
      const scale = parseFloat(prompt("单位缩放（mm→m 填 0.001）", "1") || "1");
      const { points, meta } = parseDxfPolylines(String(reader.result || ""), {
        plane: plane === "xy" ? "xy" : "xz",
        unit_scale: Number.isFinite(scale) && scale > 0 ? scale : 1,
      });
      if (points.length < 2) {
        alert("DXF 未解析到有效折线（需 LINE / LWPOLYLINE）");
        return;
      }
      const carry = remapNodeIds(dxfPointsToCarryNodes(points));
      const modeEl = document.getElementById("profileMode");
      if (modeEl) modeEl.value = "auto";
      state.returnMode = "auto";
      applyAutoReturn(carry, { quiet: true });
      state.returnMeta = {
        ...(state.returnMeta || {}),
        source: "dxf_import",
        dxf: meta,
        note: "DXF 中心线 + Auto Return；可切 Advanced 精修",
      };
      alert(
        `DXF 已导入并 Auto Return\n\n实体折线点：${meta.point_count}\n平面：${meta.plane}\n节点：${state.nodes.length}`
      );
    } catch (err) {
      alert("DXF 导入失败：\n" + (err?.message || err));
    }
  };
  reader.readAsText(file);
}

/**
 * 导入 pidm.path.v0 / pidm.bundle.v0 JSON（SolidWorks 插件或网页导出）。
 * 节点按 seq 顺序全部载入（承载 + 回程），进入 Advanced 模式；不做任何计算。
 */
function importPathJsonFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const root = JSON.parse(String(reader.result || ""));
      const path = String(root?.schema || "").startsWith("pidm.bundle") ? root.path : root;
      if (!String(path?.schema || "").startsWith("pidm.path")) {
        throw new Error(`schema 不支持：${path?.schema ?? "(空)"}，需要 pidm.path.v0`);
      }
      const src = Array.isArray(path.nodes) ? [...path.nodes] : [];
      if (src.length < 2) throw new Error("节点不足 2 个");
      src.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
      const segs = Array.isArray(path.segments) ? path.segments : [];
      const branchOf = (n) => {
        if (n.branch) return n.branch;
        const adj = segs.filter((s) => s.from_node_id === n.id || s.to_node_id === n.id);
        return adj.length && adj.every((s) => s.branch === "return") ? "return" : "carry";
      };
      const nodes = src.map((n) =>
        mapTemplateNode({
          x: Number(n.x) || 0,
          y: Number(n.y) || 0,
          z: Number(n.z) || 0,
          type: n.type || "node",
          label: n.label,
          branch: branchOf(n),
          mainDrive: !!n.is_main_drive,
          drum_D_mm: n.drum_D_mm,
          takeup_kind: n.takeup_kind,
        })
      );
      nodes.forEach((n, i) => {
        if (src[i].wrap_angle_deg != null) n.wrap_angle_deg = src[i].wrap_angle_deg;
      });
      const hasReturn = nodes.some(isReturnNode);
      const sel = document.getElementById("profileMode");
      if (hasReturn) {
        if (sel) sel.value = "advanced";
        state.returnMode = "advanced";
        state.nodes = nodes;
        state.returnMeta = {
          closed_loop: true,
          open_path: false,
          return_mode: "advanced",
          carry_return_offset_m: path.line?.carry_return_gap_m ?? null,
          carry_count: nodes.filter((n) => !isReturnNode(n)).length,
          return_count: nodes.filter(isReturnNode).length,
          source: path.source === "sw_addin" ? "sw_import" : "json_import",
          side_type: path.line?.side_type,
          note: `JSON 导入（${path.source || "web"}）：几何+标签，计算在网页`,
        };
      } else {
        if (sel) sel.value = "auto";
        state.returnMode = "auto";
        applyAutoReturn(nodes, { quiet: true, skipFit: true });
        state.returnMeta = { ...(state.returnMeta || {}), source: "json_import" };
      }
      state.flightOverrides = {};
      state.finalized = false;
      state.selectedId = state.nodes[0]?.id ?? null;
      rebuildSceneObjects();
      updateFinalizeChip();
      updateUI();
      fitView();
      const errs = (path.closure?.items || []).filter((i) => i.level === "error").length;
      alert(
        `JSON 已导入（${path.source || "web"}）\n\n节点：${state.nodes.length}（回程 ${nodes.filter(isReturnNode).length}）\n` +
          `区段：${segs.length}\n侧型：${path.line?.side_type || "-"}\n` +
          (errs ? `⚠ 源文件门禁有 ${errs} 个 error，请在网页“闭环检查”复核` : "源文件门禁：无 error")
      );
    } catch (err) {
      alert("JSON 导入失败：\n" + (err?.message || err));
    }
  };
  reader.readAsText(file);
}

function insertVerticalCurve() {
  const idx = state.nodes.findIndex((n) => n.id === state.selectedId);
  if (idx <= 0 || idx >= state.nodes.length - 1) {
    alert("请先选中一个中间转角点（非端点），再插入竖曲线。");
    return;
  }
  if (isReturnNode(state.nodes[idx]) && !isAdvancedReturn()) {
    alert("Auto 模式下不能改回程转角。请切 Advanced，或选承载转角。");
    return;
  }
  const kindRaw = (prompt("竖曲线类型：convex=凸弧 / concave=凹弧", "convex") || "convex").toLowerCase();
  const kind = kindRaw.startsWith("conca") ? "concave" : "convex";
  const design = getCurveDesignOpts();
  const suggest = suggestMinRadius_m({
    kind,
    v_mps: design.v_mps,
    T_N: design.T_N,
    qB: design.qB,
    qG: design.qG,
    a_idler_m: design.a_idler_m,
  });
  const b = suggest.breakdown;
  const R = parseFloat(
    prompt(
      `半径 R (m)\n正式 Rmin≈${suggest.R_min_m} m\n（张力 ${b.R_tension_m} / 速度 ${b.R_velocity_m}` +
        (b.R_sag_m != null ? ` / 下垂 ${b.R_sag_m}` : "") +
        "）",
      String(Math.max(suggest.R_min_m, 50))
    ) || ""
  );
  if (!(R > 0)) return;
  const segs = parseInt(prompt("弧段离散点数", "6") || "6", 10);
  try {
    const { nodes, meta } = insertVerticalCurveAt(state.nodes, idx, {
      R_m: R,
      kind,
      segments: Number.isFinite(segs) ? segs : 6,
      v_mps: design.v_mps,
      T_N: design.T_N,
      qB: design.qB,
      qG: design.qG,
      a_idler_m: design.a_idler_m,
    });
    state.nodes = nodes.map((n) => ({
      ...n,
      id: n.id && String(n.id).startsWith("arc_") ? uid() : n.id || uid(),
      y: n.y ?? 0,
    }));
    state.selectedId = state.nodes[Math.min(idx, state.nodes.length - 1)]?.id ?? null;
    if (!isReturnNode(state.nodes[idx] || {}) && !isAdvancedReturn()) {
      maybeResyncReturn({ skipFit: true });
    } else if (isReturnNode(state.nodes.find((n) => n.id === state.selectedId))) {
      markAdvancedReturnMeta({ source: "vertical_curve" });
    }
    rebuildSceneObjects();
    updateUI();
    fitView();
    alert(
      `已插入${kind === "convex" ? "凸" : "凹"}弧\n\n` +
        `R=${meta.R_m} m · θ=${meta.theta_deg}° · T=${meta.T_m} m\n` +
        `正式 Rmin≈${meta.R_min_suggest_m} m · ${meta.ok_vs_suggest ? "满足正式下限" : "小于正式下限，请复核"}\n` +
        `${meta.note}`
    );
  } catch (err) {
    alert("插入竖曲线失败：\n" + (err?.message || err));
  }
}

function insertHorizontalCurve() {
  const idx = state.nodes.findIndex((n) => n.id === state.selectedId);
  if (idx <= 0 || idx >= state.nodes.length - 1) {
    alert("请先选中一个中间转角点（非端点），再插入水平弯。");
    return;
  }
  if (isReturnNode(state.nodes[idx]) && !isAdvancedReturn()) {
    alert("Auto 模式下不能改回程转角。请切 Advanced，或选承载转角。");
    return;
  }
  const designH = getCurveDesignOpts();
  const suggest = suggestHorizontalRmin_m({ v_mps: designH.v_mps, B_mm: designH.B_mm });
  const R = parseFloat(
    prompt(`水平弯半径 R (m)\n建议最小约 ${suggest.R_min_m} m`, String(Math.max(suggest.R_min_m, 50))) || ""
  );
  if (!(R > 0)) return;
  const segs = parseInt(prompt("弧段离散点数", "6") || "6", 10);
  try {
    const { nodes, meta } = insertHorizontalCurveAt(state.nodes, idx, {
      R_m: R,
      segments: Number.isFinite(segs) ? segs : 6,
      v_mps: designH.v_mps,
      B_mm: designH.B_mm,
    });
    state.nodes = nodes.map((n) => ({
      ...n,
      id: n.id && String(n.id).startsWith("harc_") ? uid() : n.id || uid(),
      z: n.z ?? 0,
    }));
    state.selectedId = state.nodes[Math.min(idx, state.nodes.length - 1)]?.id ?? null;
    if (!isReturnNode(state.nodes[idx] || {}) && !isAdvancedReturn()) {
      maybeResyncReturn({ skipFit: true });
    } else if (isReturnNode(state.nodes.find((n) => n.id === state.selectedId))) {
      markAdvancedReturnMeta({ source: "horizontal_curve" });
    }
    rebuildSceneObjects();
    updateUI();
    fitView();
    alert(
      `已插入水平弯\n\n` +
        `R=${meta.R_m} m · θ=${meta.theta_deg}° · T=${meta.T_m} m\n` +
        `建议 Rmin≈${meta.R_min_suggest_m} m · ${meta.ok_vs_suggest ? "满足示意下限" : "小于示意下限，请复核"}`
    );
  } catch (err) {
    alert("插入水平弯失败：\n" + (err?.message || err));
  }
}

function annotateAllWraps() {
  state.nodes = annotateWrapAngles(state.nodes);
  const slip = annotateDriveSlipChecks(state.nodes, { mu: getCurveDesignOpts().mu, S_tight_N: getCurveDesignOpts().S_tight_N, S_slack_N: getCurveDesignOpts().S_slack_N });
  state.nodes = slip.nodes;
  rebuildSceneObjects();
  updateUI();
  const drums = state.nodes.filter((n) => n.wrap_angle_deg != null);
  const slipLines = (slip.items || [])
    .map((it) => `· ${it.node_id}: ${it.message}`)
    .join("\n");
  alert(
    `已重算包角（邻段几何）\n\n写入 ${drums.length} 个滚筒/改向点。\n` +
      `不打滑校核：${slip.ok ? "通过" : "有告警"}\n` +
      (slipLines ? `${slipLines}\n` : "") +
      `选中节点可在表单查看 φ。`
  );
}

function applyAllDrumOffsets() {
  if (!confirm("对所有带 D 的中间滚筒按 D/2 角平分线偏移中心线？\n（对标大厂带面绕经修正）")) return;
  // ensure diameters on drum types
  state.nodes.forEach((n) => {
    if (["tail", "head", "drive", "bend", "takeup"].includes(n.type) && !(n.drum_D_mm > 0)) {
      n.drum_D_mm = n.type === "drive" ? 1000 : 800;
    }
  });
  const { nodes, meta } = applyDrumRadiusOffsets(state.nodes, { outward: true });
  state.nodes = nodes;
  if (!isAdvancedReturn()) maybeResyncReturn({ skipFit: true, force: true });
  else markAdvancedReturnMeta({ source: "drum_D2_offset" });
  rebuildSceneObjects();
  updateUI();
  fitView();
  alert(`D/2 偏移完成\n\n偏移点数：${meta.offset_count}\n${meta.note}`);
}


function bindChrome() {
  document.querySelectorAll(".btn.mode").forEach((btn) => {
    btn.addEventListener("click", () => applyMode(btn.dataset.mode));
  });
  document.querySelectorAll(".btn.tool").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.tool = btn.dataset.tool;
      document.querySelectorAll(".btn.tool").forEach((b) => b.classList.toggle("active", b === btn));
      // 插点/删点：点选工具后，再在视图里点目标节点执行（不在工具栏上直接改路径）
    });
  });

  document.getElementById("btnFit").addEventListener("click", fitView);
  document.getElementById("btnDemo").addEventListener("click", loadDemo);
  document.getElementById("btnInsertDualDrive")?.addEventListener("click", insertDualDriveWrap);
  document.getElementById("btnInsertTakeup")?.addEventListener("click", insertGravityTakeup);
  document.getElementById("btnGc01Demo")?.addEventListener("click", loadGc01Demo);

  document.getElementById("btnEasyWizard")?.addEventListener("click", loadEasyWizard);

  document.getElementById("tabXyz")?.addEventListener("click", () => switchTableTab("xyz"));
  document.getElementById("tabFlight")?.addEventListener("click", () => switchTableTab("flight"));
  document.getElementById("btnEasyClose")?.addEventListener("click", closeEasyModal);
  document.getElementById("btnEasyApply")?.addEventListener("click", applyEasyFromModal);
  document.getElementById("easyPreset")?.addEventListener("change", onEasyPresetChange);
  document.getElementById("btnPairFlights")?.addEventListener("click", pairFlightsAction);
  document.getElementById("btnEnforceSpacing")?.addEventListener("click", () => enforceSpacingFollowAction());
  document.getElementById("btnFinalize")?.addEventListener("click", runFinalizeAction);
  document.getElementById("btnExportDxf")?.addEventListener("click", exportDxfAction);
  document.getElementById("btnExportExcel")?.addEventListener("click", exportExcelAction);
  document.getElementById("btnImportExcel")?.addEventListener("click", () => document.getElementById("excelFileInput")?.click());
  document.getElementById("excelFileInput")?.addEventListener("change", (ev) => {
    importExcelFile(ev.target.files?.[0]);
    ev.target.value = "";
  });

  document.getElementById("btnImportDxf")?.addEventListener("click", () => {
    document.getElementById("dxfFileInput")?.click();
  });
  document.getElementById("dxfFileInput")?.addEventListener("change", (ev) => {
    const f = ev.target.files?.[0];
    importDxfFile(f);
    ev.target.value = "";
  });
  document.getElementById("btnImportJson")?.addEventListener("click", () => {
    document.getElementById("jsonFileInput")?.click();
  });
  document.getElementById("jsonFileInput")?.addEventListener("change", (ev) => {
    importPathJsonFile(ev.target.files?.[0]);
    ev.target.value = "";
  });
  document.getElementById("btnInsertCurve")?.addEventListener("click", insertVerticalCurve);
  document.getElementById("btnInsertHCurve")?.addEventListener("click", insertHorizontalCurve);
  document.getElementById("btnAnnotateWrap")?.addEventListener("click", annotateAllWraps);
  document.getElementById("btnDrumOffset")?.addEventListener("click", applyAllDrumOffsets);

  document.getElementById("btnAutoReturn")?.addEventListener("click", () => applyAutoReturn());
  document.getElementById("returnOffset")?.addEventListener("change", () => {
    if (getProfileMode() === "auto") applyAutoReturn(null, { quiet: true, skipFit: true });
    else if (state.returnMeta && confirm("Advanced 下改间距将重算回程并覆盖手改，继续？")) {
      applyAutoReturn(null, { quiet: true, skipFit: true, force: true });
    }
  });
  document.getElementById("profileMode")?.addEventListener("change", (ev) => {
    setProfileMode(ev.target.value);
  });
  document.getElementById("btnClear").addEventListener("click", clearPath);
  document.getElementById("btnExport").addEventListener("click", () => {
    const payload = buildPathExport(currentExportOpts());
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "pidm-path-v0.json";
    a.click();
    URL.revokeObjectURL(a.href);
    applyClosureChip(payload);
    renderExtractSummary(payload.extract);
  });

  document.getElementById("btnExtract")?.addEventListener("click", () => {
    const payload = buildPathExport(currentExportOpts());
    applyClosureChip(payload);
    renderExtractSummary(payload.extract);
    const lg = payload.extract.line_geometry;
    alert(
      `网页几何提取完成（source=web_path）\n\n` +
        `L = ${lg.L_m} m\n` +
        `Ln = ${lg.Ln_m} m\n` +
        `H = ${lg.H_m} m\n` +
        `δ = ${lg.delta_deg} °\n` +
        `区段数 = ${lg.segment_count}\n` +
        `滚筒数 = ${payload.extract.drums.length}`
    );
  });

  document.getElementById("btnCalc")?.addEventListener("click", () => {
    const payload = buildPathExport(currentExportOpts());
    if (!payload.closure.ok) {
      const errs = payload.closure.items.filter((i) => i.level === "error").map((i) => i.message);
      alert("闭环存在 error，无法进入计算：\n\n" + errs.join("\n"));
      applyClosureChip(payload);
      return;
    }
    sessionStorage.setItem(
      "pidm.calc.bundle",
      JSON.stringify({
        schema: "pidm.bundle.v0",
        path: payload,
        extract: payload.extract,
        from: "path-editor",
      })
    );
    window.location.href = "calc.html?source=path";
  });

  document.getElementById("btnCheck")?.addEventListener("click", () => {
    const payload = buildPathExport(currentExportOpts());
    const lines = payload.closure.items.map((i) => `[${i.level}] ${i.code}: ${i.message}`);
    alert(
      (payload.closure.ok ? "闭环检查：无 error\n\n" : "闭环检查：存在 error\n\n") +
        (lines.join("\n") || "无项")
    );
    applyClosureChip(payload);
    renderExtractSummary(payload.extract);
  });

  function applyClosureChip(payload) {
    const chip = document.getElementById("closureChip");
    if (!chip) return;
    chip.textContent = payload.closure.ok ? "闭环：通过" : "闭环：有错误";
    chip.className = "chip " + (payload.closure.ok ? "ok" : "warn");
  }

  function renderExtractSummary(extract) {
    const el = document.getElementById("segSummary");
    if (!el || !extract) return;
    const lg = extract.line_geometry;
    el.innerHTML = `
      <div class="kv-mini">
        <div><span>来源</span><strong>${extract.source}</strong></div>
        <div><span>L</span><strong>${lg.L_m} m</strong></div>
        <div><span>Ln</span><strong>${lg.Ln_m} m</strong></div>
        <div><span>H</span><strong>${lg.H_m} m</strong></div>
        <div><span>δ</span><strong>${lg.delta_deg} °</strong></div>
        <div><span>版本</span><strong>${extract.geometry_version}</strong></div>
      </div>
      <ul class="seg-list">
        ${extract.segments
          .map(
            (s) =>
              `<li>${s.path_segment_id}: L=${s.L_m} · H=${s.H_m} · δ=${s.delta_deg}°</li>`
          )
          .join("")}
      </ul>`;
  }

  document.querySelectorAll(".drum-btn").forEach((btn) => {
    btn.addEventListener("dragstart", (ev) => {
      ev.dataTransfer.setData("text/drum-type", btn.dataset.type);
    });
    btn.addEventListener("click", () => {
      // place after last or at origin
      const last = state.nodes.at(-1);
      const pt = last
        ? { x: last.x + 25, y: last.y, z: last.z }
        : { x: 0, y: 0, z: 0 };
      addNodeAt(pt, btn.dataset.type);
    });
  });

  const applyForm = () => {
    const node = state.nodes.find((n) => n.id === state.selectedId);
    if (!node) return;
    if (!isAdvancedReturn() && isReturnNode(node)) {
      alert("Auto Return 模式：回程锁定，不能手改。\n请切换 Advanced。");
      updateUI();
      return;
    }
    node.type = els.fType.value;
    node.x = parseFloat(els.fX.value) || 0;
    node.y = parseFloat(els.fY.value) || 0;
    node.z = parseFloat(els.fZ.value) || 0;
    if (els.fDrumD) {
      const d = parseFloat(els.fDrumD.value);
      node.drum_D_mm = Number.isFinite(d) && d > 0 ? d : undefined;
    }
    if (node.type === "drive") {
      node.mainDrive = els.fMainDrive.checked;
      if (node.mainDrive) {
        state.nodes.forEach((n) => {
          if (n.id !== node.id && n.type === "drive") n.mainDrive = false;
        });
      }
    } else {
      node.mainDrive = false;
    }
    rebuildSceneObjects();
    if (isReturnNode(node)) markAdvancedReturnMeta({ source: state.returnMeta?.source || "advanced_edit" });
    if (!isReturnNode(node)) maybeResyncReturn({ skipFit: true });
    updateUI();
  };
  ["fType", "fX", "fY", "fZ", "fMainDrive", "fDrumD"].forEach((id) => {
    document.getElementById(id).addEventListener("change", applyForm);
  });

  window.addEventListener("resize", onResize);
}

initThree();
bindChrome();
loadDemo();
