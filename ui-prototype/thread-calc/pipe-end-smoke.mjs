/**
 * 接管端头螺纹 — 内测冒烟（无浏览器）
 */
import { computePipeEndThread, parseManualMajor } from "./pipe-end-math.js";

function assert(c, m) {
  if (!c) throw new Error(m);
}
function approx(a, b, e = 0.02) {
  return Math.abs(a - b) <= e;
}

const r = computePipeEndThread({ D1: 168, t1: 8, D2: 180, t2: 12 });
assert(r.ok, "ok");
assert(approx(r.smallCenterDia, 160), "center");
assert(r.majorDia === 161, `major int got ${r.majorDia}`);
assert(r.designation === "M161×2", r.designation);
assert(r.recommendedDesignation === "M161×2", "recommend");
assert(!r.isManual, "auto");

const manual = computePipeEndThread(
  { D1: 168, t1: 8, D2: 180, t2: 12 },
  { majorDia: 160 }
);
assert(manual.ok && manual.isManual, "manual flag");
assert(manual.designation === "M160×2", manual.designation);
assert(manual.recommendedDesignation === "M161×2", "keep recommend");
assert(approx(manual.femaleInternal.minor, 157.835, 0.01), "manual minor");
assert(parseManualMajor("M160X2").majorDia === 160, "parse X");
assert(parseManualMajor("160").majorDia === 160, "parse bare");

const bad = computePipeEndThread({ D1: 168, t1: 8, D2: 219, t2: 10 });
assert(bad.ok && !bad.checkPass, "warn pierce");

console.log("pipe-end smoke OK", {
  recommend: r.recommendedDesignation,
  manual: manual.designation,
  check: r.checkMessage,
});
