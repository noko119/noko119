import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { buildPathExport } from "./path-schema.js";
import { buildAutoReturnLoop, extractCarryChain } from "./calc/auto-return.js";

/** @typedef {{ id:string, x:number, y:number, z:number, type:string, mainDrive?:boolean }} PathNode */

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
  tbody: document.querySelector("#xyzTable tbody"),
  segSummary: document.getElementById("segSummary"),
};

let renderer, scene, camera, controls;
let pathLine, returnLine, closeLine, pointGroup, gridHelper, axesHelper;
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

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h);
  renderer.setClearColor(0x0b1220, 1);
  els.viewport.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0b1220, 400, 1200);

  camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 5000);
  camera.position.set(180, -220, 140);
  camera.up.set(0, 0, 1);

  controls = new OrbitControls(camera, renderer.domElement);
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
  const geo = new THREE.SphereGeometry(node.type === "node" ? 1.6 : 2.4, 16, 16);
  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive: node.id === state.selectedId ? 0x1d4ed8 : 0x000000,
    emissiveIntensity: node.id === state.selectedId ? 0.55 : 0,
    metalness: 0.2,
    roughness: 0.45,
  });
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
  line.geometry.dispose();
  if (!pts || pts.length < 2) {
    line.geometry = new THREE.BufferGeometry();
    return;
  }
  const positions = [];
  pts.forEach((n) => positions.push(n.x, n.y, n.z));
  // 闭合段：若最后一点不是首点，调用方可自行传入首点
  line.geometry = new THREE.BufferGeometry();
  line.geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
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
  pointGroup.children.forEach((mesh) => {
    const n = state.nodes.find((x) => x.id === mesh.userData.nodeId);
    if (!n) return;
    mesh.position.set(n.x, n.y, n.z);
    const selected = n.id === state.selectedId;
    mesh.material.emissive?.setHex?.(selected ? 0x1d4ed8 : 0x000000);
    mesh.material.emissiveIntensity = selected ? 0.55 : 0;
  });

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
  // Auto 模式只允许往承载加点（回程由 Auto Return 重算）
  if (!isAdvancedReturn() && isReturnNode(state.nodes.find((n) => n.id === state.selectedId))) {
    // 若当前选中回程，改选最后一个承载点
    const carry = extractCarryChain(state.nodes);
    state.selectedId = carry.at(-1)?.id ?? null;
  }

  const node = {
    id: uid(),
    x: +pt.x.toFixed(3),
    y: state.mode === "2d-xz" ? 0 : +pt.y.toFixed(3),
    z: state.mode === "2d-xy" ? (extractCarryChain(state.nodes).at(-1)?.z ?? 0) : +pt.z.toFixed(3),
    type,
    mainDrive: type === "drive",
    branch: "carry",
    strand: "carry",
  };
  if (type === "drive") {
    state.nodes.forEach((n) => {
      if (n.type === "drive") n.mainDrive = false;
    });
  }

  if (!isAdvancedReturn() && state.nodes.some(isReturnNode)) {
    // 插到承载末尾（第一个回程点之前）
    const firstRet = state.nodes.findIndex(isReturnNode);
    const idx = firstRet >= 0 ? firstRet : state.nodes.length;
    state.nodes.splice(idx, 0, node);
  } else {
    state.nodes.push(node);
  }
  state.selectedId = node.id;
  rebuildSceneObjects();
  maybeResyncReturn({ skipFit: true });
  updateUI();
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
  // Auto：若下一点是回程，则插在承载末与回程之间
  const node = {
    id: uid(),
    x: +((a.x + b.x) / 2).toFixed(3),
    y: +((a.y + b.y) / 2).toFixed(3),
    z: +((a.z + b.z) / 2).toFixed(3),
    type: "node",
    branch: "carry",
    strand: "carry",
  };
  state.nodes.splice(idx + 1, 0, node);
  state.selectedId = node.id;
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
  syncNodeMeshes();
  updateUI(false);
}

function endDrag() {
  if (!state.dragging) return;
  const dragged = state.nodes.find((n) => n.id === state.dragId);
  state.dragging = false;
  state.dragId = null;
  controls.enabled = true;
  if (dragged && !isReturnNode(dragged)) {
    maybeResyncReturn({ skipFit: true });
  }
  updateUI();
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
  }

  if (rebuildTable) renderTable();
  else syncTableInputs();

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
      <td>${TYPE_LABEL[n.type] || n.type}${n.mainDrive ? "★" : ""}</td>
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
        const f = inp.dataset.f;
        n[f] = parseFloat(inp.value) || 0;
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
  controls.update();
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
    if (!isReturnNode(node)) maybeResyncReturn({ skipFit: true });
    updateUI();
  };
  ["fType", "fX", "fY", "fZ", "fMainDrive"].forEach((id) => {
    document.getElementById(id).addEventListener("change", applyForm);
  });

  window.addEventListener("resize", onResize);
}

initThree();
bindChrome();
loadDemo();
