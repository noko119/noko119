/**
 * 锥管模具分段 — 冒烟（无浏览器）
 */
import { designConeMold, pickSegmentOds, roundMajor05 } from "./cone-mold-math.js";

function assert(c, m) {
  if (!c) throw new Error(m);
}

assert(roundMajor05(161) === 160, "round 161");
assert(roundMajor05(128) === 130, "round 128");
assert(roundMajor05(103) === 105, "round 103");

const ods = pickSegmentOds(219, 108, 4);
assert(ods.ok && ods.ods.join(",") === "219,168,133,108", `ods ${ods.ods}`);

const r = designConeMold({
  bigOd: 219,
  smallOd: 108,
  moldHeight: 930,
  topAllowance: 45,
  bottomAllowance: 5,
  standardLen: 210,
});
assert(r.ok, r.error);
assert(r.summary.moldHeight === 930, "height");
assert(r.summary.faceToFace === 880, `face ${r.summary.faceToFace}`);
assert(r.segments.map((s) => s.length).join(",") === "210,210,210,300", "lens");
assert(r.segments[3].kind === "非标", "small nonstd");
assert(r.joints.map((j) => j.designation).join(",") === "M160×2,M130×2,M105×2", "threads");
assert(r.segments[0].topFaceOffset === 45 && r.segments[0].belowTopFace === 165, "top");
assert(r.segments[3].bottomFaceOffset === 5 && r.segments[3].aboveBottomFace === 295, "bottom");

const { renderAssembledConeDiagram } = await import("./cone-mold-diagram.js");
const svg = renderAssembledConeDiagram(r);
assert(svg.includes("<svg"), "diagram svg");
assert(svg.includes("M160×2") && svg.includes("M130×2") && svg.includes("M105×2"), "diagram threads");
assert(svg.includes("930") && svg.includes("880"), "diagram heights");
assert(svg.includes("上口") && svg.includes("下口"), "diagram allowances");

console.log("cone-mold smoke OK", {
  segs: r.segments.map((s) => `φ${s.od}×${s.length}`),
  threads: r.joints.map((j) => j.designation),
});
