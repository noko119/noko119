import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { buildPathExport } from "./path-schema.js";

/** @typedef {{ id:string, x:number, y:number, z:number, type:string, mainDrive?:boolean }} PathNode */

const TYPE_LABEL = {
  node: "节点",
  tail: "尾滚筒",
  bend: "改向",
  drive: "传动",
  head: "头滚筒",
  takeup: "拉紧",
};

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
let pathLine, pointGroup, gridHelper, axesHelper;
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
  return L;
}

function loadDemo() {
  // 简化坡道：尾→改向→爬坡→头驱（示意，非 GC-01 精确坐标）
  state.nodes = [
    { id: uid(), x: 0, y: 0, z: 0, type: "tail" },
    { id: uid(), x: 40, y: 0, z: 0, type: "bend" },
    { id: uid(), x: 120, y: 0, z: 25, type: "node" },
    { id: uid(), x: 200, y: 0, z: 45, type: "node" },
    { id: uid(), x: 260, y: 0, z: 57, type: "drive", mainDrive: true },
    { id: uid(), x: 280, y: 0, z: 57, type: "head" },
  ];
  state.selectedId = state.nodes[0].id;
  rebuildSceneObjects();
  updateUI();
  fitView();
}

function clearPath() {
  state.nodes = [];
  state.selectedId = null;
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
  const color = TYPE_COLOR[node.type] || TYPE_COLOR.node;
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

  const positions = [];
  state.nodes.forEach((n) => positions.push(n.x, n.y, n.z));
  pathLine.geometry.dispose();
  if (positions.length >= 2) {
    pathLine.geometry = new THREE.BufferGeometry();
    pathLine.geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3)
    );
  } else {
    pathLine.geometry = new THREE.BufferGeometry();
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

  const positions = [];
  state.nodes.forEach((n) => positions.push(n.x, n.y, n.z));
  if (positions.length >= 2) {
    pathLine.geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3)
    );
    pathLine.geometry.attributes.position.needsUpdate = true;
    pathLine.geometry.computeBoundingSphere();
  }
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
  const node = {
    id: uid(),
    x: +pt.x.toFixed(3),
    y: state.mode === "2d-xz" ? 0 : +pt.y.toFixed(3),
    z: state.mode === "2d-xy" ? (state.nodes.at(-1)?.z ?? 0) : +pt.z.toFixed(3),
    type,
    mainDrive: type === "drive",
  };
  if (type === "drive") {
    state.nodes.forEach((n) => {
      if (n.type === "drive") n.mainDrive = false;
    });
  }
  state.nodes.push(node);
  state.selectedId = node.id;
  rebuildSceneObjects();
  updateUI();
}

function insertAfterSelected() {
  const idx = state.nodes.findIndex((n) => n.id === state.selectedId);
  if (idx < 0) return;
  const a = state.nodes[idx];
  const b = state.nodes[idx + 1] || { x: a.x + 20, y: a.y, z: a.z };
  const node = {
    id: uid(),
    x: +((a.x + b.x) / 2).toFixed(3),
    y: +((a.y + b.y) / 2).toFixed(3),
    z: +((a.z + b.z) / 2).toFixed(3),
    type: "node",
  };
  state.nodes.splice(idx + 1, 0, node);
  state.selectedId = node.id;
  rebuildSceneObjects();
  updateUI();
}

function deleteSelected() {
  if (!state.selectedId) return;
  state.nodes = state.nodes.filter((n) => n.id !== state.selectedId);
  state.selectedId = state.nodes[0]?.id ?? null;
  rebuildSceneObjects();
  updateUI();
}

function beginDrag(nodeId, ev) {
  const node = state.nodes.find((n) => n.id === nodeId);
  if (!node) return;
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
  state.dragging = false;
  state.dragId = null;
  controls.enabled = true;
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
  document.getElementById("btnClear").addEventListener("click", clearPath);
  document.getElementById("btnExport").addEventListener("click", () => {
    const payload = buildPathExport({
      nodes: state.nodes,
      modeHint: state.mode,
      line: {
        line_id: "demo-slope-01",
        name: "示例坡道（编辑器）",
      },
    });
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "pidm-path-v0.json";
    a.click();
    URL.revokeObjectURL(a.href);

    const chip = document.getElementById("closureChip");
    if (chip) {
      chip.textContent = payload.closure.ok ? "闭环：通过（含警告可继续）" : "闭环：有错误";
      chip.className = "chip " + (payload.closure.ok ? "ok" : "warn");
    }
  });

  document.getElementById("btnCheck")?.addEventListener("click", () => {
    const payload = buildPathExport({ nodes: state.nodes, modeHint: state.mode });
    const lines = payload.closure.items.map((i) => `[${i.level}] ${i.code}: ${i.message}`);
    alert(
      (payload.closure.ok ? "闭环检查：无 error\n\n" : "闭环检查：存在 error\n\n") +
        (lines.join("\n") || "无项")
    );
    const chip = document.getElementById("closureChip");
    if (chip) {
      chip.textContent = payload.closure.ok ? "闭环：通过" : "闭环：有错误";
      chip.className = "chip " + (payload.closure.ok ? "ok" : "warn");
    }
  });

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
