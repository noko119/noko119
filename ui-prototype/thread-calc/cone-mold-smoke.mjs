import { designConeMold, coneDiaAt, roundMajor05 } from "./cone-mold-math.js";
import { renderAssembledConeDiagram } from "./cone-mold-diagram.js";

function assert(c, m) {
  if (!c) throw new Error(m);
}

assert(roundMajor05(161) === 160, "round");

const r = designConeMold({}); // 默认案例 730 / 194→108
assert(r.ok, r.error);
assert(r.model === "inner-cone-outer-sleeves", "model");
assert(r.summary.totalHeight === 730, `H ${r.summary.totalHeight}`);
assert(r.summary.coneHeight === 680, `coneH ${r.summary.coneHeight}`);
assert(r.cone.topDia === 194 && r.cone.bottomDia === 108, "cone dia");
assert(r.input.topAllowance === 45 && r.input.bottomAllowance === 5, "allow");
assert(Math.abs(coneDiaAt(45, r.input) - 194) < 0.01, "dia at cone start");
assert(Math.abs(coneDiaAt(725, r.input) - 108) < 0.01, "dia near bottom");
assert(r.sleeves[0].length === 210, "first sleeve 210");
assert(r.joints.every((j) => j.ok), "joints");
assert(r.joints[0].jointStackHeight === 24, "12+1+10+1");

const svg = renderAssembledConeDiagram(r);
assert(svg.includes("内锥"), "svg");
assert(svg.includes("接头细节"), "detail");
assert(svg.includes("ø194") || svg.includes("194"), "194");

console.log("cone-mold smoke OK", {
  sleeves: r.sleeves.map((s) => `${s.outerOd}×${s.length}`),
  threads: r.joints.map((j) => j.designation),
});
