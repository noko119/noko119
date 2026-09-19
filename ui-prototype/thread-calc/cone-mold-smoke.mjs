/**
 * 锥管模具（内锥嵌套）— 冒烟
 */
import { designConeMold, cavityDiaAt, roundMajor05 } from "./cone-mold-math.js";
import { renderAssembledConeDiagram } from "./cone-mold-diagram.js";

function assert(c, m) {
  if (!c) throw new Error(m);
}

assert(roundMajor05(161) === 160, "round");
assert(Math.abs(cavityDiaAt(0, 219, 108, 930) - 219) < 1e-9, "cav top");
assert(Math.abs(cavityDiaAt(930, 219, 108, 930) - 108) < 1e-9, "cav bot");

const r = designConeMold({
  cavityTop: 219,
  cavityBottom: 108,
  moldHeight: 930,
  topAllowance: 45,
  bottomAllowance: 5,
  standardLen: 210,
  wall: 25,
});
assert(r.ok, r.error);
assert(r.model === "cavity-cone-nested", "model");
assert(r.summary.moldHeight === 930, "H");
assert(r.summary.faceToFace === 880, "face");
assert(r.segments.length === 4, "n");
assert(r.segments.map((s) => s.length).join(",") === "210,210,210,300", "lens");
assert(r.segments[0].cavityTop === 219, "seg0 cav");
assert(r.segments[3].cavityBottom === 108, "seg3 cav");
// 外圆应大于型腔
r.segments.forEach((s) => {
  assert(s.outerOd > s.cavityTop, `outer ${s.outerOd} vs cav ${s.cavityTop}`);
});
assert(r.joints.every((j) => j.ok), "joints ok");
assert(r.joints[0].nestStyle.includes("外套"), "nest style");

const svg = renderAssembledConeDiagram(r);
assert(svg.includes("内锥"), "svg title");
assert(svg.includes("接头细节"), "joint detail");
assert(svg.includes("型腔上口"), "cav label");

console.log("cone-mold smoke OK", {
  outers: r.segments.map((s) => s.outerOd),
  threads: r.joints.map((j) => j.designation),
  cavAtJoints: r.joints.map((j) => j.cavityAtJoint),
});
