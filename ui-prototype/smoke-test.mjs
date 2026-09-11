/**
 * 轻量回归：路径导出主驱点序 + Web 正确提取 + GC-01 计算
 * 运行：node ui-prototype/smoke-test.mjs
 */
import { buildPathExport } from "./path-schema.js";
import { GC01_INPUT, GC01_EXPECTED, GC01_TOL } from "./calc/gc01-case.js";
import { runDtiiP2P, compareToExpected } from "./calc/dtii-engine.js";
import {
  segmentGeometry,
  extractGeometryFromPath,
  buildCalcInputFromExtract,
  pathToCalcBundle,
} from "./calc/path-extract.js";
import { buildAutoReturnLoop } from "./calc/auto-return.js";

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    failed += 1;
  } else {
    console.log("OK:", msg);
  }
}

function near(a, b, tol = 1e-6) {
  return Math.abs(a - b) <= tol;
}

// 1) 多驱时奔离点必须落在 is_main_drive
{
  const nodes = [
    { id: "a", x: 0, y: 0, z: 0, type: "tail" },
    { id: "b", x: 10, y: 0, z: 0, type: "drive", mainDrive: false },
    { id: "c", x: 20, y: 0, z: 0, type: "drive", mainDrive: true },
    { id: "d", x: 30, y: 0, z: 0, type: "head" },
  ];
  const path = buildPathExport({ nodes });
  assert(path.point_order.leave_point_node_id === "c", "leave point = main drive c");
  assert(path.nodes.find((n) => n.id === "c").drive_role === "main", "c drive_role main");
  assert(path.nodes.find((n) => n.id === "b").drive_role === "aux", "b drive_role aux");
  assert(path.closure.ok === true, "closure ok for demo multi-drive");
}

// 2) 单段几何公式正确性（3-4-5）
{
  const g = segmentGeometry({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 });
  assert(near(g.L_m, 5), `3-4-5 L=5 got ${g.L_m}`);
  assert(near(g.Ln_m, 5), `3-4-5 Ln=5 got ${g.Ln_m}`);
  assert(near(g.H_m, 0), `3-4-5 H=0 got ${g.H_m}`);
  assert(near(g.delta_deg, 0), `3-4-5 delta=0 got ${g.delta_deg}`);
}

// 3) 斜坡：dx=100, dz=100 → L=100√2, δ=45°
{
  const g = segmentGeometry({ x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 100 });
  assert(near(g.L_m, 100 * Math.SQRT2, 1e-6), `slope L got ${g.L_m}`);
  assert(near(g.Ln_m, 100, 1e-6), `slope Ln got ${g.Ln_m}`);
  assert(near(g.H_m, 100, 1e-6), `slope H got ${g.H_m}`);
  assert(near(g.delta_deg, 45, 1e-6), `slope delta=45 got ${g.delta_deg}`);
}

// 4) 多段累加 + 导出内嵌 extract
{
  const nodes = [
    { id: "t", x: 0, y: 0, z: 0, type: "tail", drum_D_mm: 800 },
    { id: "n1", x: 100, y: 0, z: 0, type: "node" },
    { id: "n2", x: 200, y: 0, z: 50, type: "drive", mainDrive: true, drum_D_mm: 1000 },
    { id: "h", x: 220, y: 0, z: 50, type: "head", drum_D_mm: 800 },
  ];
  const path = buildPathExport({ nodes, line: { line_id: "ext-01", name: "提取回归" } });
  assert(path.extract?.schema === "pidm.extract.v0", "export embeds extract schema");
  assert(path.extract.source === "web_path", "extract source web_path");
  assert(path.segments.every((s) => s.extract_status === "complete"), "segments extract complete");

  const lg = path.extract.line_geometry;
  const L_expect =
    100 + Math.hypot(100, 50) + 20; // horiz 100 + slope + head 20
  assert(near(lg.L_m, L_expect, 1e-5), `multi L ${lg.L_m} vs ${L_expect}`);
  assert(near(lg.H_m, 50, 1e-6), `multi H ${lg.H_m}`);
  assert(near(lg.Ln_m, 220, 1e-6), `multi Ln ${lg.Ln_m}`);
  const delta_expect = (Math.atan2(50, 220) * 180) / Math.PI;
  assert(near(lg.delta_deg, delta_expect, 1e-5), `multi delta ${lg.delta_deg}`);
  assert(path.extract.drums.length === 3, "drums extracted");
  assert(path.extract.drums.some((d) => d.is_main_drive), "main drive in drums");
}

// 5) 提取结果可驱动计算（几何来自 extract，不被系数覆盖）
{
  const nodes = [
    { id: "t", x: 0, y: 0, z: 0, type: "tail" },
    { id: "d", x: 310, y: 0, z: 57.051, type: "drive", mainDrive: true },
    { id: "h", x: 320, y: 0, z: 57.051, type: "head" },
  ];
  const bundle = pathToCalcBundle(
    buildPathExport({ nodes, line: { Q: 1700, v: 2, name: "web-extract-calc" } }),
    { f: 0.023, C: 1.3, qB: 47.6, qRO: 29.1, qRU: 10, FS1_N: 0, FS2_N: 0 }
  );
  assert(bundle.calc_input.geometry_source === "web_path", "calc geometry_source");
  assert(bundle.calc_input.L_m === bundle.extract.line_geometry.L_m, "calc L from extract");
  assert(bundle.calc_input.H_m === bundle.extract.line_geometry.H_m, "calc H from extract");
  const out = runDtiiP2P(bundle.calc_input);
  assert(out.summary.PM_kW > 0, `path-driven PM=${out.summary.PM_kW}`);
}

// 6) 重提：改坐标后几何变化
{
  const path = buildPathExport({
    nodes: [
      { id: "a", x: 0, y: 0, z: 0, type: "tail" },
      { id: "b", x: 10, y: 0, z: 0, type: "drive", mainDrive: true },
      { id: "c", x: 20, y: 0, z: 0, type: "head" },
    ],
  });
  const L1 = path.extract.line_geometry.L_m;
  path.nodes[1].x = 30;
  const ex2 = extractGeometryFromPath(path, { geometry_version: "G-web-2" });
  assert(ex2.line_geometry.L_m > L1, "re-extract reflects XYZ change");
  assert(ex2.geometry_version === "G-web-2", "geometry version bump");
}

// 7) GC-01 主链
{
  const out = runDtiiP2P(GC01_INPUT);
  const cmp = compareToExpected(out.summary, GC01_EXPECTED, GC01_TOL);
  assert(cmp.pass === true, "GC-01 compare all pass");
  assert(out.algorithm === "DTII-P2P-v0.2", "algorithm version");
}

// 8) Auto Return 闭环（对标 Belt Analyst）
{
  const carry = [
    { id: "t", x: 0, y: 0, z: 0, type: "tail", drum_D_mm: 800 },
    { id: "b", x: 50, y: 0, z: 0, type: "bend", drum_D_mm: 630 },
    { id: "n", x: 150, y: 0, z: 30, type: "node" },
    { id: "d", x: 250, y: 0, z: 55, type: "drive", mainDrive: true, drum_D_mm: 1000 },
    { id: "h", x: 270, y: 0, z: 55, type: "head", drum_D_mm: 800 },
  ];
  const { nodes, meta } = buildAutoReturnLoop(carry, { offset_m: 1.2, mode: "auto" });
  assert(meta.closed_loop === true, "auto return closed_loop");
  assert(meta.return_count === 3, "auto return interiors = 3");
  assert(nodes.filter((n) => n.branch === "return").length === 3, "has 3 return nodes");
  const path = buildPathExport({
    nodes,
    line: { open_path: false, closed_loop: true, line_id: "loop-01", name: "闭环回归" },
    returnMeta: meta,
  });
  assert(path.line.closed_loop === true, "export closed_loop");
  assert(path.segments.some((seg) => seg.branch === "return"), "export has return segments");
  assert(path.closure.ok === true, "closed loop closure ok");
  assert(path.segments.length === nodes.length, "closed loop segments = nodes (with closing edge)");
}

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll smoke tests passed.");
