/**
 * 轻量回归：路径导出主驱点序 + GC-01 计算
 * 运行：node --input-type=module ui-prototype/smoke-test.mjs
 */
import { buildPathExport } from "./path-schema.js";
import { GC01_INPUT, GC01_EXPECTED, GC01_TOL } from "./calc/gc01-case.js";
import { runDtiiP2P, compareToExpected } from "./calc/dtii-engine.js";

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    failed += 1;
  } else {
    console.log("OK:", msg);
  }
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

// 2) GC-01 主链
{
  const out = runDtiiP2P(GC01_INPUT);
  const cmp = compareToExpected(out.summary, GC01_EXPECTED, GC01_TOL);
  assert(cmp.pass === true, "GC-01 compare all pass");
  assert(out.algorithm === "DTII-P2P-v0.2", "algorithm version");
}

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll smoke tests passed.");
