import {
  designConeMold,
  coneDiaAt,
  roundMajor05,
  pickPipeByConeDia,
  scalePuToMold,
  RECOMMENDED_SCALE_FACTOR,
} from "./cone-mold-math.js";
import { renderAssembledConeDiagram } from "./cone-mold-diagram.js";

function assert(c, m) {
  if (!c) throw new Error(m);
}

assert(roundMajor05(161) === 160, "round");
assert(pickPipeByConeDia(194).od === 219 && pickPipeByConeDia(194).id === 200, "pick 194");
assert(pickPipeByConeDia(108).od === 130, "pick 108");
assert(pickPipeByConeDia(254).od === 299, "pick 254");

const tip = scalePuToMold({ topDia: 194, bottomDia: 108, coneHeight: 680 }, 1.01, 45, 5);
assert(tip.ok, tip.error);
assert(tip.mold.topDia === 195.94, `mold top ${tip.mold.topDia}`);
assert(tip.mold.bottomDia === 109.08, `mold bot ${tip.mold.bottomDia}`);
assert(tip.mold.coneHeight === 686.8, `mold coneH ${tip.mold.coneHeight}`);
assert(tip.mold.totalHeight === 736.8, `mold H ${tip.mold.totalHeight}`);

// 系数=1：模具=聚氨酯（兼容原案例数值）
const r = designConeMold({ scaleFactor: 1 });
assert(r.ok, r.error);
assert(r.model === "inner-cone-outer-sleeves", "model");
assert(r.summary.totalHeight === 730, `H ${r.summary.totalHeight}`);
assert(r.summary.coneHeight === 680, `coneH ${r.summary.coneHeight}`);
assert(r.cone.topDia === 194 && r.cone.bottomDia === 108, "cone dia");
assert(r.pu.topDia === 194 && r.pu.coneHeight === 680, "pu");
assert(r.input.topAllowance === 45 && r.input.bottomAllowance === 5, "allow");
assert(Math.abs(coneDiaAt(45, r.input) - 194) < 0.01, "dia at cone start");
assert(Math.abs(coneDiaAt(725, r.input) - 108) < 0.01, "dia near bottom");
assert(r.sleeves.map((s) => s.length).reduce((a, b) => a + b, 0) === 730, "sum assy lengths");
const maleH = r.summary.maleEndLen;
assert(maleH === 26, `maleH ${maleH}`); // 10+12+4
assert(r.summary.stdAssy === 250 - maleH, `stdAssy ${r.summary.stdAssy}`);
assert(r.sleeves.slice(1).every((s) => s.partLength === 250 && s.kind === "标准"), "std part 250");
assert(r.sleeves[0].maleEndLen === 0 && r.sleeves[0].partLength === r.sleeves[0].length, "top no male");
assert(r.sleeves.every((s) => s.maleNeck === (s.index > 1)), "male on lower sleeves");
assert(r.sleeves[0].pipeNom === 194, `pipe0 nom ${r.sleeves[0].pipeNom}`);

const r2 = designConeMold({ totalHeight: 780, standardLen: 250, scaleFactor: 1 });
assert(r2.ok, r2.error);
assert(r2.sleeves.filter((s) => s.kind === "标准").every((s) => s.partLength === 250), "780 std 250");
assert(r2.sleeves.reduce((a, s) => a + s.length, 0) === 780, "780 sum");
assert(r2.sleeves.every((s) => (s.partLength ?? s.length) <= 250 + 1e-9), `part<=250 ${r2.sleeves.map((s) => s.partLength)}`);
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

// 默认推荐系数放大
const r3 = designConeMold({});
assert(r3.ok, r3.error);
assert(r3.scale.factor === RECOMMENDED_SCALE_FACTOR, `default k ${r3.scale.factor}`);
assert(r3.cone.topDia === 195.94 && r3.cone.bottomDia === 109.08, "scaled dia");
assert(r3.summary.totalHeight === 736.8, `scaled H ${r3.summary.totalHeight}`);

const svg = renderAssembledConeDiagram(r);
assert(svg.includes("外径"), "od mark");
assert(svg.includes(`止口 ${loc}`) || svg.includes(`止口${loc}`), "locator mark");
assert(svg.includes("退刀槽"), "undercut mark");
assert(svg.includes("螺纹"), "thread mark");
assert(svg.includes("df") && svg.includes("Dg"), "male/female undercut");
assert(svg.includes("对接内径"), "joint ID mark");
assert(/对接内径 ø\d+\.\d{3}/.test(svg), "joint ID 3 decimals");
const ids = r.joints.map((j) => Number(j.coneDia).toFixed(3));
assert(ids.every((s) => /^\d+\.\d{3}$/.test(s)), `id precision ${ids}`);
assert(ids.every((s) => svg.includes(`ø${s}`)), `svg has ids ${ids}`);

const svg3 = renderAssembledConeDiagram(r3);
assert(svg3.includes("聚氨酯") && svg3.includes("×"), "banner scale");

console.log("cone-mold smoke OK", {
  pipes: r.sleeves.map((s) => s.pipeLabel),
  threads: r.joints.map((j) => j.designation),
  locator: loc,
  stack: r.summary.jointStack.map((x) => x.h).join("+"),
  formula: r.summary.locatorFormula,
  scaleDefault: r3.summary.scaleFormula,
});
