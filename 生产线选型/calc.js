/**
 * 托辊生产线 · 中间物流 / 上料 / 料仓 选型计算
 * 公式与 GB/T 17395 管重、气动推力、伺服牵引功率一致，浏览器与 node 共用。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.LineCalc = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const E_STEEL = 2.06e5; // N/mm²
  const G = 9.81;
  const PI = Math.PI;

  const DEFAULT_WALL = { 89: 3.5, 108: 3.75, 133: 4, 159: 4.5, 194: 6, 219: 6 };
  const ODS = [89, 108, 133, 159, 194, 219];
  const BORES = [40, 50, 63, 80, 100, 125];
  const ROD_BY_BORE = { 40: 16, 50: 20, 63: 20, 80: 25, 100: 25, 125: 32 };

  const RAIL_CATALOG = [
    { size: 30, model: "HGW30CC", rail: "HGR30R", C: 38.7, C0: 54.2, alt: "银泰 SME30E / 南京工艺 GGB30" },
    { size: 35, model: "HGW35CC", rail: "HGR35R", C: 49.5, C0: 81.8, alt: "银泰 SME35E / 南京工艺 GGB35" },
    { size: 45, model: "HGW45CC", rail: "HGR45R", C: 77.9, C0: 126.5, alt: "银泰 MSA45E / 南京工艺 GGB45" },
    { size: 55, model: "HGW55CC", rail: "HGR55R", C: 114.4, C0: 175.7, alt: "银泰 MSA55E" },
  ];

  function round(n, d) {
    const m = Math.pow(10, d == null ? 2 : d);
    return Math.round(n * m) / m;
  }

  /** GB/T 17395 钢管理论质量 kg/m */
  function pipeKgPerM(od, t) {
    return 0.0246615 * t * (od - t);
  }

  function pipeMass(od, t, lengthMm) {
    return pipeKgPerM(od, t) * (lengthMm / 1000);
  }

  /** 圆钢理论质量 kg/m */
  function shaftKgPerM(d) {
    return 0.006165 * d * d;
  }

  function shaftMass(d, lengthMm) {
    return shaftKgPerM(d) * (lengthMm / 1000);
  }

  function cylPushN(boreMm, mpa) {
    return mpa * 1e6 * PI / 4 * Math.pow(boreMm / 1000, 2);
  }

  function cylPullN(boreMm, rodMm, mpa) {
    return mpa * 1e6 * PI / 4 * (Math.pow(boreMm / 1000, 2) - Math.pow(rodMm / 1000, 2));
  }

  function pickCylBore(needN, mpaCheck, nCyl, minSF) {
    for (let i = 0; i < BORES.length; i++) {
      const bore = BORES[i];
      const push = nCyl * cylPushN(bore, mpaCheck);
      const sf = push / needN;
      if (sf >= minSF) {
        return {
          bore,
          rod: ROD_BY_BORE[bore],
          sf: round(sf, 2),
          pushN: round(push, 0),
          oneN: round(cylPushN(bore, mpaCheck), 0),
          pullN: round(nCyl * cylPullN(bore, ROD_BY_BORE[bore], mpaCheck), 0),
        };
      }
    }
    const bore = BORES[BORES.length - 1];
    const push = nCyl * cylPushN(bore, mpaCheck);
    return {
      bore,
      rod: ROD_BY_BORE[bore],
      sf: round(push / needN, 2),
      pushN: round(push, 0),
      oneN: round(cylPushN(bore, mpaCheck), 0),
      pullN: round(nCyl * cylPullN(bore, ROD_BY_BORE[bore], mpaCheck), 0),
      undersized: true,
    };
  }

  function rectTubeI(B, H, t) {
    const b = B - 2 * t;
    const h = H - 2 * t;
    return (B * Math.pow(H, 3) - b * Math.pow(h, 3)) / 12;
  }

  /** 简支梁均布载荷跨中挠度 mm；W 为总载荷 N，L、截面 mm */
  function udlDeflectionMm(totalN, L, I) {
    const w = totalN / L;
    return (5 * w * Math.pow(L, 4)) / (384 * E_STEEL * I);
  }

  function pickArmSection(spanMm, loadN, minH) {
    const minHeight = minH || 0;
    const candidates = [
      { name: "矩形管 120×80×6", B: 80, H: 120, t: 6 },
      { name: "矩形管 160×80×6", B: 80, H: 160, t: 6 },
      { name: "矩形管 160×80×8", B: 80, H: 160, t: 8 },
      { name: "矩形管 200×100×8", B: 100, H: 200, t: 8 },
      { name: "箱型焊接 12mm 200×120", B: 120, H: 200, t: 12 },
    ];
    const limit = spanMm / 800;
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      if (c.H < minHeight) continue;
      const I = rectTubeI(c.B, c.H, c.t);
      const def = udlDeflectionMm(loadN, spanMm, I);
      if (def <= limit) {
        return Object.assign({}, c, { I: round(I, 0), defMm: round(def, 3), limitMm: round(limit, 3) });
      }
    }
    const c = candidates[candidates.length - 1];
    const I = rectTubeI(c.B, c.H, c.t);
    const def = udlDeflectionMm(loadN, spanMm, I);
    return Object.assign({}, c, { I: round(I, 0), defMm: round(def, 3), limitMm: round(limit, 3), tight: true });
  }

  function pickGuideRod(liftKg) {
    if (liftKg <= 220) return { d: 30, bush: "MPBZ30-40", Lextra: 220 };
    if (liftKg <= 420) return { d: 35, bush: "MPBZ35-50", Lextra: 250 };
    return { d: 40, bush: "MPBZ40-50", Lextra: 280 };
  }

  function pickRail(movingKg, railLenMm, where) {
    let size;
    if (where === "overhead") {
      size = movingKg <= 180 && railLenMm <= 6000 ? 30 : 35;
    } else {
      if (movingKg <= 450 && railLenMm <= 8000) size = 35;
      else if (movingKg <= 1200) size = 45;
      else size = 55;
    }
    const row = RAIL_CATALOG.filter(function (r) { return r.size === size; })[0];
    const nBlocks = 4;
    const pEach = (movingKg * G) / nBlocks / 1000;
    const L10 = Math.pow(row.C / Math.max(pEach, 0.1), 3) * 50;
    return {
      size: row.size,
      model: row.model,
      rail: row.rail,
      C: row.C,
      C0: row.C0,
      alt: row.alt,
      pEachKN: round(pEach, 2),
      lifeKm: round(L10, 0),
      nBlocks: nBlocks,
      nRails: 2,
    };
  }

  function pickServo(powerNeedW, specKw) {
    const stock = [
      { kw: 0.4, tRated: 1.27, rpm: 3000, motor: "MS1H4-40B30CB-A334Z", drive: "SV660NS0R4I" },
      { kw: 0.75, tRated: 2.39, rpm: 3000, motor: "MS1H4-75B30CB-A334Z", drive: "SV660NS0R7I" },
      { kw: 1.0, tRated: 3.18, rpm: 3000, motor: "MS1H4-10C30CB-A334Z", drive: "SV660NS001I" },
    ];
    const specW = specKw * 1000;
    let chosen = stock[1];
    if (powerNeedW > specW * 0.85) {
      chosen = stock.filter(function (s) { return s.kw * 1000 >= powerNeedW * 1.3; })[0] || stock[stock.length - 1];
    } else if (powerNeedW < 180 && specKw <= 0.4) {
      chosen = stock[0];
    }
    if (specKw >= 0.75 && chosen.kw < 0.75) chosen = stock[1];
    return chosen;
  }

  function defaults() {
    return {
      ods: ODS.slice(),
      walls: Object.assign({}, DEFAULT_WALL),
      pipeLenMin: 275,
      pipeLenMax: 1600,
      shaftLenMin: 320,
      shaftLenMax: 1700,
      shaftDia: 30,
      pipesPerTrip: 4,
      speedMPerMin: 15,
      specPowerKw: 0.75,
      airWorkMPa: 0.6,
      airCheckMPa: 0.5,
      liftStroke: 250,
      railLength: 12000,
      cartTareKg: 380,
      armKg: 110,
      gripperKg: 28,
      accelMs2: 0.5,
      mu: 0.02,
      eta: 0.7,
      reducerI: 15,
      pinionZ: 25,
      pinionM: 2,
      nCyl: 4,
      minCylSF: 1.6,
      nCart: 1,
      nGantry: 1,
      nLoader: 4,
      gantryTravel: 4500,
    };
  }

  function analyze(input) {
    const p = Object.assign(defaults(), input || {});
    p.walls = Object.assign({}, DEFAULT_WALL, p.walls || {});

    const pipes = p.ods.map(function (od) {
      const t = p.walls[od];
      return {
        od: od,
        t: t,
        kgPerM: round(pipeKgPerM(od, t), 2),
        kgMax: round(pipeMass(od, t, p.pipeLenMax), 2),
        kgMin: round(pipeMass(od, t, p.pipeLenMin), 2),
      };
    });
    const heaviest = pipes.reduce(function (a, b) { return a.kgMax >= b.kgMax ? a : b; });
    const shaftKg = round(shaftMass(p.shaftDia, p.shaftLenMax), 2);
    const payloadKg = round(heaviest.kgMax * p.pipesPerTrip, 1);
    const liftKg = round(payloadKg + p.armKg, 1);
    const liftN = liftKg * G;
    const cyl = pickCylBore(liftN, p.airCheckMPa, p.nCyl, p.minCylSF);
    cyl.workSF = round((p.nCyl * cylPushN(cyl.bore, p.airWorkMPa)) / liftN, 2);
    cyl.stroke = p.liftStroke;
    cyl.model = "SI" + cyl.bore + "×" + p.liftStroke + "-S-CM";
    cyl.airVolL = round(p.nCyl * PI / 4 * Math.pow(cyl.bore / 10, 2) * (p.liftStroke / 10) / 1000, 2);

    const movingKg = round(p.cartTareKg + p.armKg + payloadKg, 1);
    const v = p.speedMPerMin / 60;
    const fFric = movingKg * G * p.mu;
    const fAcc = movingKg * p.accelMs2;
    const fTravel = fFric + fAcc;
    const pMechW = fTravel * v;
    const pNeedW = pMechW / p.eta;
    const servo = pickServo(pNeedW, p.specPowerKw);
    const pinionD = p.pinionM * p.pinionZ;
    const tOut = servo.tRated * p.reducerI * 0.94;
    const fRated = tOut / (pinionD / 2000);
    const nOutMax = servo.rpm / p.reducerI;
    const vMaxMPerMin = nOutMax / 60 * PI * (pinionD / 1000) * 60;
    const motorRpmAtSpec = p.speedMPerMin / vMaxMPerMin * servo.rpm;

    const rail = pickRail(movingKg, p.railLength, "floor");
    const rod = pickGuideRod(liftKg);
    rod.length = p.liftStroke + rod.Lextra;
    rod.nRod = 4;
    rod.nBush = 8;

    const span = p.pipeLenMax + 250;
    const steel = pickArmSection(span, liftN * 1.8, 160);
    steel.span = span;
    steel.base = movingKg > 900 ? "槽钢 22# + 底板 20mm" : "槽钢 20# + 底板 16–20mm";
    steel.frame = "方管 80×80×6 Q235B";
    steel.trackBeam = p.railLength > 10000 ? "矩形管 150×100×8 / 槽钢 20# 通长" : "矩形管 150×100×6 / 槽钢 18#";

    const gantryMoving = round(heaviest.kgMax + p.gripperKg, 1);
    const gantryRail = pickRail(gantryMoving + 80, p.gantryTravel, "overhead");
    const zBore = pickCylBore((gantryMoving + 15) * G, p.airCheckMPa, 1, 1.5);

    const warnings = [];
    if (cyl.sf < 1.6) warnings.push("四缸在 0.5 MPa 校核安全系数不足 1.6，加大缸径或降低一次搬运根数。");
    if (pNeedW > p.specPowerKw * 1000) {
      warnings.push("水平牵引计算功率 " + round(pNeedW / 1000, 2) + " kW 已超过系统约 " + p.specPowerKw + " kW，检查摩擦系数、加速度或一次载荷。");
    }
    if (fRated < fTravel * 1.3) {
      warnings.push("齿条额定牵引力裕量不足，增大减速比或齿条模数。");
    }
    if (steel.tight) warnings.push("横梁挠度接近限值，建议改箱型焊接梁。");
    if (p.pipesPerTrip >= 4 && heaviest.od >= 194) {
      warnings.push("4 根 Φ" + heaviest.od + " 同时举升偏满载，建议工艺按 2 根重管或 4 根轻管分流。");
    }

    const powerOk = pNeedW <= p.specPowerKw * 1000 * 1.05;

    return {
      p: p,
      pipes: pipes,
      heaviest: heaviest,
      shaftKg: shaftKg,
      payloadKg: payloadKg,
      liftKg: liftKg,
      liftN: round(liftN, 0),
      cyl: cyl,
      movingKg: movingKg,
      travel: {
        v: round(v, 3),
        fFric: round(fFric, 0),
        fAcc: round(fAcc, 0),
        fTravel: round(fTravel, 0),
        pMechW: round(pMechW, 0),
        pNeedW: round(pNeedW, 0),
        fRated: round(fRated, 0),
        vMaxMPerMin: round(vMaxMPerMin, 1),
        motorRpmAtSpec: round(motorRpmAtSpec, 0),
        pinionD: pinionD,
        tOut: round(tOut, 1),
        powerOk: powerOk,
      },
      servo: servo,
      rail: rail,
      rod: rod,
      steel: steel,
      gantry: {
        movingKg: gantryMoving,
        rail: gantryRail,
        zBore: zBore,
        zModel: "MGPM" + zBore.bore + "-" + 200,
      },
      warnings: warnings,
    };
  }

  return {
    ODS: ODS,
    DEFAULT_WALL: DEFAULT_WALL,
    RAIL_CATALOG: RAIL_CATALOG,
    G: G,
    pipeKgPerM: pipeKgPerM,
    pipeMass: pipeMass,
    shaftKgPerM: shaftKgPerM,
    shaftMass: shaftMass,
    cylPushN: cylPushN,
    cylPullN: cylPullN,
    pickCylBore: pickCylBore,
    pickRail: pickRail,
    pickGuideRod: pickGuideRod,
    pickServo: pickServo,
    pickArmSection: pickArmSection,
    rectTubeI: rectTubeI,
    defaults: defaults,
    analyze: analyze,
    round: round,
  };
});
