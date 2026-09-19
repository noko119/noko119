import { designConeMold, coneDiaAt, roundMajor05, pickPipeByConeDia } from "./cone-mold-math.js";
import { renderAssembledConeDiagram } from "./cone-mold-diagram.js";

function assert(c, m) {
  if (!c) throw new Error(m);
}

assert(roundMajor05(161) === 160, "round");
assert(pickPipeByConeDia(194).od === 219 && pickPipeByConeDia(194).id === 200, "pick 194");
assert(pickPipeByConeDia(108).od === 130, "pick 108");
assert(pickPipeByConeDia(254).od === 299, "pick 254");

const r = designConeMold({});
assert(r.ok, r.error);
assert(r.model === "inner-cone-outer-sleeves", "model");
assert(r.summary.totalHeight === 730, `H ${r.summary.totalHeight}`);
assert(r.summary.coneHeight === 680, `coneH ${r.summary.coneHeight}`);
assert(r.cone.topDia === 194 && r.cone.bottomDia === 108, "cone dia");
assert(r.input.topAllowance === 45 && r.input.bottomAllowance === 5, "allow");
assert(Math.abs(coneDiaAt(45, r.input) - 194) < 0.01, "dia at cone start");
assert(Math.abs(coneDiaAt(725, r.input) - 108) < 0.01, "dia near bottom");
assert(r.sleeves[0].length === 210, "first sleeve 210");
assert(r.sleeves[0].pipeNom === 194, `pipe0 nom ${r.sleeves[0].pipeNom}`);
assert(r.sleeves[0].outerOd === 219, `pipe0 od ${r.sleeves[0].outerOd}`);
assert(r.sleeves[0].pipeId === 200, "pipe0 id");
assert(r.joints.every((j) => j.ok), "joints");
assert(r.joints[0].jointStackHeight === 24, "12+1+10+1");

const svg = renderAssembledConeDiagram(r);
assert(svg.includes("外径"), "od mark");
assert(svg.includes("自动"), "auto mark");

console.log("cone-mold smoke OK", {
  pipes: r.sleeves.map((s) => s.pipeLabel),
  threads: r.joints.map((j) => j.designation),
});
