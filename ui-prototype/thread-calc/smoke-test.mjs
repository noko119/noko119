/**
 * Node smoke test for thread-math.js (no browser)
 */
import {
  computeThread,
  defaultPitch,
  parseThreadSpec,
} from "./thread-math.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function approx(a, b, eps = 0.002) {
  return Math.abs(a - b) <= eps;
}

// Parse
assert(parseThreadSpec("M20").ok, "parse M20");
assert(parseThreadSpec("M20×1.5").pitchGiven === 1.5, "parse fine");
assert(parseThreadSpec("m16*1").ok, "parse star");
assert(!parseThreadSpec("foo").ok, "reject junk");

assert(defaultPitch(20) === 2.5, "coarse M20");
assert(defaultPitch(10) === 1.5, "coarse M10");

const m20 = computeThread("M20");
assert(m20.ok, "M20 ok");
assert(m20.designation === "M20", "M20 name");
assert(approx(m20.basic.external.crest, 20), "ext crest");
assert(approx(m20.basic.external.pitch, 18.376), "d2");
assert(approx(m20.basic.external.minorBasic, 17.294), "d1");
assert(approx(m20.basic.external.root, 16.933), "d3");
assert(approx(m20.basic.internal.crest, 17.294), "D1");
assert(approx(m20.basic.internal.root, 20), "D");
assert(approx(m20.undercut.external.diameter, 16.4), "df"); // 20-3.6
assert(approx(m20.undercut.external.width, 5.0), "g1");
assert(approx(m20.machining.internalTapDrill, 17.294), "tap");

const fine = computeThread("M20×1.5");
assert(fine.isFine, "fine flag");
assert(approx(fine.basic.external.pitch, 19.026), "fine d2");

const shortG = computeThread("M12", { lengthKind: "short" });
assert(approx(shortG.undercut.external.width, 3.0) || shortG.undercut.external.width < 4, "short groove");

assert(parseThreadSpec("M320X2").ok && parseThreadSpec("M320X2").d === 320, "M320X2");
assert(parseThreadSpec("M320X2").pitchGiven === 2, "M320X2 pitch");
assert(parseThreadSpec("M195X2").ok && parseThreadSpec("M195X2").d === 195, "M195X2");
assert(parseThreadSpec("M195×2").pitchGiven === 2, "M195×2");

const custom = computeThread("M320X2");
assert(custom.ok, "custom M320×2");
assert(approx(custom.basic.external.crest, 320), "custom crest");
assert(approx(custom.basic.external.pitch, 318.701), "custom d2"); // 320 - 0.649519*2

const m195 = computeThread("M195X2");
assert(m195.ok && approx(m195.basic.external.root, 192.546), "M195 root");

console.log("thread-math smoke OK");
console.log(
  JSON.stringify(
    {
      M20: {
        d: m20.basic.external.crest,
        d2: m20.basic.external.pitch,
        d1: m20.basic.external.minorBasic,
        d3: m20.basic.external.root,
        D1: m20.basic.internal.crest,
        groove: m20.undercut.external,
      },
      custom320x2: {
        d: custom.basic.external.crest,
        d2: custom.basic.external.pitch,
        d3: custom.basic.external.root,
        D1: custom.basic.internal.crest,
      },
    },
    null,
    2
  )
);
