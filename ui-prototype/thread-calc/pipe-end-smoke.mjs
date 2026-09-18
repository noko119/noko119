/**
 * 接管端头螺纹 — 内测冒烟（无浏览器）
 */
import { computePipeEndThread } from "./pipe-end-math.js";

function assert(c, m) {
  if (!c) throw new Error(m);
}
function approx(a, b, e = 0.02) {
  return Math.abs(a - b) <= e;
}

// D1=168,t1=8 → 中心=160；h=1.0826；理论大径=161.0826 → 161
// D2=180,t2=12 → 内孔=156；内螺纹小径≈158.835 > 156 → 通过
const r = computePipeEndThread({ D1: 168, t1: 8, D2: 180, t2: 12 });
assert(r.ok, "ok");
assert(approx(r.smallCenterDia, 160), "center");
assert(approx(r.h, 1.0826, 0.001), "h");
assert(approx(r.H, 1.732, 0.001), "H");
assert(approx(r.R, 0.288, 0.001), "R");
assert(approx(r.theoryMajor, 161.083, 0.01), "theory major");
assert(r.majorDia === 161, `major int got ${r.majorDia}`);
assert(r.designation === "M161×2", r.designation);
assert(r.P === 2 && r.maleEnd.thread === 12 && r.maleEnd.locator === 10, "const");
assert(r.bodyTotalLen === 210, "210");
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

import { parseManualMajor } from "./pipe-end-math.js";
assert(parseManualMajor("M160X2").majorDia === 160, "parse X");
assert(parseManualMajor("160").majorDia === 160, "parse bare");


// 击穿：大管壁薄 → 内孔太大
const bad = computePipeEndThread({ D1: 168, t1: 8, D2: 219, t2: 10 });
assert(bad.ok && !bad.checkPass, "warn pierce");
assert(/无法加工|不足/.test(bad.checkMessage), "warn text");

// 取整不强制 0/5
const r2 = computePipeEndThread({ D1: 108.4, t1: 8, D2: 120, t2: 10 });
assert(r2.majorDia === Math.round(r2.theoryMajor), "near int");

console.log("pipe-end smoke OK", {
  designation: r.designation,
  majorDia: r.majorDia,
  internalMinor: r.femaleInternal.minor,
  check: r.checkMessage,
  bad: bad.checkMessage,
  r2: r2.designation,
});
