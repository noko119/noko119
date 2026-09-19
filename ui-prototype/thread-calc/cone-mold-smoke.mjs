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
assert(r.sleeves[0].length === 230, `first(top rem) ${r.sleeves[0].length}`);
assert(r.sleeves[1].length === 250 && r.sleeves[2].length === 250, "bottom standards 250");
assert(r.sleeves[0].kind === "非标" && r.sleeves[2].kind === "标准", "kinds bottom-up");
assert(r.sleeves.map((s) => s.length).reduce((a, b) => a + b, 0) === 730, "sum lengths");
// 余段>250 自动再拆：例如总高 780 → 顶 280 会拆成 30+250+250+250
const r2 = designConeMold({ totalHeight: 780, standardLen: 250 });
assert(r2.ok, r2.error);
assert(r2.sleeves.every((s) => s.length <= 250 + 1e-9), `auto split ${r2.sleeves.map((s) => s.length)}`);
assert(r2.sleeves[0].length === 30 && r2.sleeves.slice(1).every((s) => s.length === 250), "780 plan");
assert(r.sleeves[0].pipeNom === 194, `pipe0 nom ${r.sleeves[0].pipeNom}`);
assert(r.sleeves[0].outerOd === 219, `pipe0 od ${r.sleeves[0].outerOd}`);
assert(r.sleeves[0].pipeId === 200, "pipe0 id");
assert(r.joints.every((j) => j.ok), "joints");
const loc = r.summary.locator;
const eng = r.summary.engage;
const und = r.summary.undercut;
assert(eng === 12, `engage ${eng}`);
assert(und === 4, `undercut ${und}`);
assert(loc === und + eng / 2, `locator auto ${loc} != ${und}+${eng}/2`);
assert(r.joints[0].jointStackHeight === eng + 1 + loc + 1, `stackH ${r.joints[0].jointStackHeight}`);
assert(r.joints[0].locatorDim?.formula?.includes("止口="), "locator formula");

const svg = renderAssembledConeDiagram(r);
assert(svg.includes("外径"), "od mark");
assert(svg.includes(`止口 ${loc}`) || svg.includes(`止口${loc}`), "locator mark");
assert(svg.includes("退刀槽"), "undercut mark");
assert(svg.includes("螺纹"), "thread mark");
assert(svg.includes("df") && svg.includes("Dg"), "male/female undercut");
assert(svg.includes("公") || svg.includes("母"), "male/female labels");

console.log("cone-mold smoke OK", {
  pipes: r.sleeves.map((s) => s.pipeLabel),
  threads: r.joints.map((j) => j.designation),
  locator: loc,
  stack: r.summary.jointStack.map((x) => x.h).join("+"),
  formula: r.summary.locatorFormula,
});
