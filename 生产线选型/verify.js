#!/usr/bin/env node
"use strict";
const C = require("./calc.js");
const r = C.analyze();
const fail = [];
function ok(cond, msg) { if (!cond) fail.push(msg); }

ok(Math.abs(C.pipeKgPerM(219, 6) - 31.517) < 0.02, "Φ219×6 kg/m");
ok(Math.abs(r.heaviest.kgMax - 50.43) < 0.05, "最长 Φ219 单重");
ok(r.cyl.bore === 63, "四缸缸径 SI63");
ok(r.cyl.sf >= 1.6, "0.5 MPa 安全系数");
ok(r.travel.pNeedW < 750, "水平功率低于 0.75 kW");
ok(r.travel.powerOk, "功率预算标志");
ok(r.rail.size === 45, "地轨 45");
ok(r.rod.d === 35, "导柱 Φ35");
ok(r.steel.H >= 160, "托臂截面高度");
ok(r.gantry.zBore.bore === 63, "空中 Z 向缸径");
ok(C.shaftMass(30, 1700) > 9 && C.shaftMass(30, 1700) < 10, "轴重");

const heavy = C.analyze({ pipesPerTrip: 8, cartTareKg: 800 });
ok(heavy.warnings.length >= 1, "超载应报警");
ok(heavy.cyl.bore >= 63, "超载缸径不减小");

if (fail.length) {
  console.error("FAIL:\n" + fail.join("\n"));
  process.exit(1);
}
console.log("calc.js OK", {
  payloadKg: r.payloadKg,
  cyl: r.cyl.model,
  sf: r.cyl.sf,
  pNeedW: r.travel.pNeedW,
  rail: r.rail.model,
  rod: r.rod.d,
  arm: r.steel.name,
});
