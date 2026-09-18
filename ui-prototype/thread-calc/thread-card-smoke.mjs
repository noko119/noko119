/**
 * 螺纹型号 → 端头结构表 — 内测冒烟（无浏览器）
 */
import { computeThreadEndCards, parseManualMajor } from "./pipe-end-math.js";

function assert(c, m) {
  if (!c) throw new Error(m);
}

const r = computeThreadEndCards("M200×2");
assert(r.ok, "ok");
assert(r.designation === "M200×2", r.designation);
assert(r.crest.external === 200, "ext crest");
assert(r.crest.internal === 197.834, `int crest ${r.crest.internal}`);
assert(r.root.external === 197.834, "ext root");
assert(r.root.internal === 200, "int root");
assert(r.male.undercutWidth === 4, "ext groove w");
assert(r.female.undercutWidth === 4, "int groove w");
assert(r.male.undercutDf === 197, `df ${r.male.undercutDf}`);
assert(r.female.undercutDg === 203, `Dg ${r.female.undercutDg}`);
assert(r.male.total === 26, `male total ${r.male.total}`);
assert(r.female.total === 26, `female total ${r.female.total}`);
assert(r.male.title.includes("210"), "male title 210");
assert(r.female.title.includes("210"), "female title 210");

assert(parseManualMajor("M200X2").majorDia === 200, "parse X");
assert(parseManualMajor("200").majorDia === 200, "parse bare");
assert(computeThreadEndCards("M195X2").ok, "M195");
assert(computeThreadEndCards("").ok === false, "empty");

const shortG = computeThreadEndCards("M200×2", { grooveKind: "short" });
assert(shortG.male.undercutWidth === 3, "short g2");
assert(shortG.male.total === 25, "short total");

console.log("thread-card smoke OK", {
  designation: r.designation,
  crest: r.crest,
  df: r.male.undercutDf,
  Dg: r.female.undercutDg,
  total: r.male.total,
});
