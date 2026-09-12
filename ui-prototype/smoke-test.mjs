/**
 * 轻量回归：路径导出主驱点序 + Web 正确提取 + GC-01 计算
 * 运行：node ui-prototype/smoke-test.mjs
 */
import { buildPathExport } from "./path-schema.js";
import { GC01_INPUT, GC01_EXPECTED, GC01_TOL } from "./calc/gc01-case.js";
import { runDtiiP2P, compareToExpected, selectMotorFromPm } from "./calc/dtii-engine.js";
import {
  segmentGeometry,
  extractGeometryFromPath,
  buildCalcInputFromExtract,
  pathToCalcBundle,
} from "./calc/path-extract.js";
import { buildAutoReturnLoop } from "./calc/auto-return.js";
import {
  buildDualDriveWrapTemplate,
  buildGravityTakeupTemplate,
} from "./calc/path-templates.js";
import { buildGc01ComplexPath } from "./calc/gc01-complex-path.js";
import { buildEasyFromPreset, EASY_PRESETS } from "./calc/easy-wizard.js";
import { exportNodesToDxf } from "./calc/dxf-import.js";
import { buildFlightRows, pairCarryReturnFlights, enforcePairedReturnOffset } from "./calc/flight-model.js";
import { finalizeProfile, checkWrapDtii } from "./calc/finalize-checks.js";
import { nodesToCsv, csvToNodes, flightsToCsv } from "./calc/excel-io.js";

import { buildEasyInclineConveyor } from "./calc/easy-wizard.js";
import { parseDxfPolylines, dxfPointsToCarryNodes } from "./calc/dxf-import.js";
import { insertVerticalCurveAt, suggestMinRadius_m } from "./calc/vertical-curve.js";
import {
  annotateWrapAngles,
  applyDrumRadiusOffsets,
  computeWrapAtNode,
  checkDriveNoSlip,
  annotateDriveSlipChecks,
} from "./calc/drum-geometry.js";
import {
  insertHorizontalCurveAt,
  suggestHorizontalRmin_m,
  cornerAngleXY,
} from "./calc/horizontal-curve.js";
import {
  DTII_MAJORS,
  autoClassifyFlight,
  classifyFlightRows,
} from "./calc/dtii-flight-dict.js";
import { DEFAULT_COEFFS, coeffsToCalcInput } from "./calc/default-coeffs.js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
const __dirname = dirname(fileURLToPath(import.meta.url));


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

// 9) 局部模板：双驱绕法 / 重锤拉紧（P1，插入后可改）
{
  const dual = buildDualDriveWrapTemplate({ x: 10, z: 5 });
  assert(dual.length >= 4, "dual drive template has nodes");
  assert(dual.every((n) => n.branch === "return"), "dual drive on return");
  assert(dual.some((n) => n.type === "drive" && n.mainDrive), "dual drive has main");
  assert(dual.filter((n) => n.type === "drive").length === 2, "two drive drums");

  const take = buildGravityTakeupTemplate({ x: 20, z: 12 }, 8);
  assert(take.some((n) => n.type === "takeup" && n.takeup_kind === "gravity"), "gravity takeup node");
  assert(take.every((n) => n.branch === "return"), "takeup on return");
  const bot = take.find((n) => n.type === "takeup");
  assert(near(bot.z, 4, 1e-6), `takeup travel z=4 got ${bot.z}`);
}

// 10) GC-01 复杂路径演示样例可构建且闭环可导出
{
  const { nodes, meta } = buildGc01ComplexPath();
  assert(meta.return_count > 5, "gc01 complex has multi-pulley return");
  assert(nodes.some((n) => n.branch === "carry"), "gc01 has carry");
  assert(nodes.some((n) => n.branch === "return"), "gc01 has return");
  const path = buildPathExport({
    nodes,
    line: {
      open_path: false,
      closed_loop: true,
      line_id: "gc01-demo",
      name: "GC-01 demo",
      return_mode: "advanced",
    },
    returnMeta: {
      closed_loop: true,
      open_path: false,
      return_mode: "advanced",
      carry_count: meta.carry_count,
      return_count: meta.return_count,
    },
  });
  assert(path.closure.ok === true, "gc01 demo closure ok");
  assert(path.extract?.source === "web_path", "gc01 demo extractable");
}


// 11) Easy 向导（Sidewinder）
{
  const { nodes, meta } = buildEasyInclineConveyor({
    Ln_m: 60,
    H_m: 12,
    return_offset_m: 1.2,
    mid_points: 1,
    drive_at: "head",
  });
  assert(meta.closed_loop === true, "easy wizard closed_loop");
  assert(meta.source === "easy_wizard", "easy wizard source");
  assert(nodes.some((n) => n.branch === "return"), "easy has return");
  assert(nodes.filter((n) => n.branch !== "return").length >= 3, "easy carry count");
}

// 12) DXF 导入中心线
{
  const dxf = readFileSync(join(__dirname, "samples/sample-carry.xz.dxf"), "utf8");
  const { points, meta } = parseDxfPolylines(dxf, { plane: "xz", unit_scale: 1 });
  assert(points.length >= 3, "dxf points >= 3");
  assert(meta.plane === "xz", "dxf plane xz");
  const carry = dxfPointsToCarryNodes(points);
  assert(carry[0].type === "tail", "dxf first tail");
  assert(carry.at(-1).type === "head", "dxf last head");
  const { nodes, meta: rm } = buildAutoReturnLoop(carry, { offset_m: 1.2, mode: "auto" });
  assert(rm.closed_loop === true, "dxf+auto return closed");
  assert(nodes.length > carry.length, "dxf path grew with return");
}

// 13) 竖曲线 + 正式 Rmin 分解
{
  const base = [
    { id: "a", x: 0, y: 0, z: 0, type: "tail", branch: "carry" },
    { id: "b", x: 50, y: 0, z: 0, type: "node", branch: "carry" },
    { id: "c", x: 100, y: 0, z: 25, type: "head", branch: "carry" },
  ];
  const sug = suggestMinRadius_m({ kind: "convex", v_mps: 2 });
  assert(sug.R_min_m > 0, "suggest Rmin > 0");
  assert(sug.breakdown && sug.breakdown.R_tension_m > 0, "Rmin has tension term");
  assert(sug.breakdown.R_velocity_m > 0, "Rmin has velocity term");
  const sugFull = suggestMinRadius_m({
    kind: "concave",
    v_mps: 2,
    T_N: 50000,
    qB: 47.6,
    qG: 236.1,
    a_idler_m: 1.2,
  });
  assert(sugFull.breakdown.R_sag_m > 0, "Rmin has sag term when a given");
  assert(sugFull.note.includes("DTⅡ") || sugFull.note.includes("正式"), "formal Rmin note");
  const { nodes, meta } = insertVerticalCurveAt(base, 1, { R_m: 120, kind: "convex", segments: 4 });
  assert(nodes.length > base.length, "curve inserts points");
  assert(meta.R_m === 120, "curve R recorded");
  assert(meta.kind === "convex", "curve kind convex");
  assert(meta.R_min_breakdown, "insert meta has Rmin breakdown");
}

// 14) 包角 + D/2 偏移
{
  const nodes = [
    { id: "t", x: 0, y: 0, z: 0, type: "tail", branch: "carry", drum_D_mm: 800 },
    { id: "b", x: 30, y: 0, z: 0, type: "bend", branch: "carry", drum_D_mm: 800 },
    { id: "h", x: 60, y: 0, z: 15, type: "head", branch: "carry", drum_D_mm: 1000 },
  ];
  const w = computeWrapAtNode(nodes, 1);
  assert(w.ok === true, "wrap at bend ok");
  assert(w.wrap_angle_deg > 0, "wrap angle > 0");
  const annotated = annotateWrapAngles(nodes);
  assert(annotated[1].wrap_angle_deg != null, "annotate wrap written");
  const { nodes: offNodes, meta } = applyDrumRadiusOffsets(annotated, { outward: true });
  assert(meta.offset_count >= 1, "drum offset applied");
  assert(offNodes[1].offset_applied === true, "bend offset flag");
}

// 15) Easy 机型库 + Flight 配对 + Finalize + DXF/CSV 往返
{
  assert(EASY_PRESETS.length >= 3, "easy presets >= 3");
  const easy = buildEasyFromPreset("incline_short");
  assert(easy.nodes.length >= 4, "easy preset nodes");
  assert(easy.meta.preset_id === "incline_short", "easy preset id");
  // ensure drums have D for finalize
  easy.nodes.forEach((n) => {
    if (["tail","head","drive","bend","takeup"].includes(n.type) && !(n.drum_D_mm > 0)) n.drum_D_mm = 800;
  });
  let flights = buildFlightRows(easy.nodes, { closed_loop: true });
  assert(flights.length >= 3, "flight rows built");
  assert(flights.every((f) => f.major_id), "flights auto-classified major_id");
  const paired = pairCarryReturnFlights(flights);
  assert(paired.meta.paired_pairs >= 1, "paired flights >= 1");
  const fin = finalizeProfile({
    nodes: easy.nodes,
    returnMeta: { ...easy.meta, closed_loop: true },
    flightOverrides: Object.fromEntries(
      paired.flights.filter((f) => f.paired_flight_id).map((f) => [f.id, { paired_flight_id: f.paired_flight_id, classify_status: "confirmed" }])
    ),
  });
  assert(fin.ok === true, "finalize ok after pair/drums");
  const dxf = exportNodesToDxf(easy.nodes.filter((n) => n.branch !== "return"), { plane: "xz" });
  assert(dxf.includes("LWPOLYLINE"), "dxf export lwpolyline");
  const csv = nodesToCsv(easy.nodes);
  const back = csvToNodes(csv);
  assert(back.length === easy.nodes.length, "csv roundtrip node count");
  const fcsv = flightsToCsv(paired.flights);
  assert(fcsv.includes("a_idler_m"), "flight csv header");
  const wrap = checkWrapDtii(easy.nodes, { min_drive_wrap_deg: 1 });
  assert(wrap.items.length >= 1, "wrap dtii has drive item");
}


// 16) 驱动不打滑欧拉校核
{
  const ok = checkDriveNoSlip({ wrap_deg: 210, mu: 0.35, S_tight_N: 80000, S_slack_N: 25000 });
  assert(ok.ok === true, "no-slip ok when e^{μφ} sufficient");
  const ratio = ok.ratio ?? ok.S_ratio ?? (80000/25000);
  const e = ok.e_mu_phi ?? ok.e_mu_phi ?? ok.emu_phi;
  assert(e > ratio - 1e-9, "e_mu_phi > ratio");
  const bad = checkDriveNoSlip({ wrap_deg: 90, mu: 0.2, S_tight_N: 200000, S_slack_N: 20000 });
  assert(bad.ok === false, "no-slip fails when wrap insufficient");
  const driveNodes = [
    { id: "t", x: 0, y: 0, z: 0, type: "tail" },
    { id: "d", x: 10, y: 0, z: 0, type: "drive", mainDrive: true, wrap_angle_deg: 200 },
    { id: "h", x: 20, y: 0, z: 0, type: "head" },
  ];
  const ann = annotateDriveSlipChecks(driveNodes, { mu: 0.35, S_tight_N: 80000, S_slack_N: 25000 });
  assert((ann.items || []).length >= 1, "annotate slip one drive");
  assert(ann.nodes[1].no_slip_ok != null, "drive has no_slip_ok");
}

// 17) DTⅡ 十二大项分类
{
  assert(DTII_MAJORS.length === 12, "12 DTII majors");
  const cls = autoClassifyFlight({ branch: "carry", delta_deg: 12 });
  assert(!!cls.major_id, "classify incline has major_id");
  const clsH = autoClassifyFlight({ branch: "return", delta_deg: 0.5 });
  assert(!!clsH.major_id, "classify return has major_id");
  const clsCv = autoClassifyFlight({ branch: "carry", curve_kind: "convex", delta_deg: 5 });
  assert(String(clsCv.major_id).includes("convex"), "classify convex");
  const rows = classifyFlightRows([
    { id: "s1", branch: "carry", delta_deg: 0, from_node_id: "a", to_node_id: "b" },
  ]);
  assert(!!rows[0].major_id, "classifyFlightRows major_id");
}

// 18) 水平弯
{
  const base = [
    { id: "a", x: 0, y: 0, z: 0, type: "tail", branch: "carry" },
    { id: "b", x: 40, y: 0, z: 2, type: "node", branch: "carry" },
    { id: "c", x: 40, y: 40, z: 4, type: "head", branch: "carry" },
  ];
  const ang = cornerAngleXY(base, 1);
  assert(ang.ok === true, "horizontal corner ok");
  const sug = suggestHorizontalRmin_m({ v_mps: 2 });
  assert(sug.R_min_m >= 30, "horizontal Rmin floor");
  const { nodes, meta } = insertHorizontalCurveAt(base, 1, { R_m: 25, segments: 4 });
  assert(nodes.length > base.length, "horizontal curve inserts");
  assert(meta.kind === "horizontal", "horizontal kind");
  assert(nodes.some((n) => n.curve === "horizontal" || n.curve_kind === "horizontal"), "nodes marked horizontal");
  const flights = buildFlightRows(nodes, { closed_loop: false });
  assert(flights.length >= 1, "flight rows after horizontal");
}

// 19) 强制间距跟随 + 系数面板映射 + 电机选型
{
  const carry = [
    { id: "t", x: 0, y: 0, z: 0, type: "tail", drum_D_mm: 800 },
    { id: "n", x: 100, y: 0, z: 20, type: "node" },
    { id: "d", x: 200, y: 0, z: 40, type: "drive", mainDrive: true, drum_D_mm: 1000 },
    { id: "h", x: 220, y: 0, z: 40, type: "head", drum_D_mm: 800 },
  ];
  const locked = enforcePairedReturnOffset(carry, 1.5);
  const meta = locked.meta || {};
  assert(meta.spacing_locked === true || meta.source === "enforce_paired_return_offset" || meta.spacing_locked === true, "spacing locked");
  assert(locked.nodes.some((n) => n.branch === "return"), "has return after enforce");

  const mapped = coeffsToCalcInput({ f: 0.02, f_duty: "empty", qG: 0 }, { ...GC01_INPUT });
  assert(mapped.f === 0.02, "coeffsToCalcInput f override");
  assert(mapped.C === DEFAULT_COEFFS.C || mapped.C === GC01_INPUT.C, "coeffs keep C");
  assert(mapped.v_mps === GC01_INPUT.v_mps, "coeffs keep v");

  const motor = selectMotorFromPm(399.1);
  const Pk = motor.P_kW ?? motor.kW ?? motor.P_motor_kW;
  assert(Pk === 400, "motor select 400 for PM 399.1");
  const out = runDtiiP2P(GC01_INPUT);
  assert(out.steps.some((s) => s.id === "Motor" || /选型/.test(s.title || "")), "Motor step present");
}


if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll smoke tests passed.");
