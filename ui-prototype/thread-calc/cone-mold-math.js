/**
 * 锥管模具分段设计
 * - 大直径节优先标准长（默认 210，含上口余量）
 * - 最小直径节用非标长度凑满模具总高（含下口余量）
 * - 段间螺纹 P=2，大径就近圆整到 0/5
 */

import { computePipeEndThread, PIPE_END_CONST, computeThreadEndCards } from "./pipe-end-math.js";

/** 常用无缝管外径（mm） */
export const STD_PIPE_ODS = [
  89, 102, 108, 114, 121, 127, 133, 140, 152, 159, 168, 180, 194, 203, 219, 245, 273, 299, 325,
];

export const CONE_MOLD_DEFAULTS = {
  bigOd: 219,
  smallOd: 108,
  moldHeight: 930,
  topAllowance: 45, // 计入最大节
  bottomAllowance: 5, // 计入最小节
  standardLen: 210,
  pitch: 2,
  defaultWall: {
    219: 8,
    180: 8,
    168: 8,
    159: 6,
    140: 6,
    133: 6,
    121: 6,
    114: 6,
    108: 6,
  },
};

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

/** 就近圆整到尾数 0 或 5 */
export function roundMajor05(n) {
  return Math.round(Number(n) / 5) * 5;
}

function nearestOd(target, catalog) {
  let best = catalog[0];
  let bestD = Math.abs(catalog[0] - target);
  for (const od of catalog) {
    const d = Math.abs(od - target);
    if (d < bestD) {
      best = od;
      bestD = d;
    }
  }
  return best;
}

/**
 * 在 [small, big] 内选 count 个外径（含两端）
 * 按「两端 + 中间标准管目录」下标均匀取样
 */
export function pickSegmentOds(bigOd, smallOd, count, catalog = STD_PIPE_ODS) {
  const big = Number(bigOd);
  const small = Number(smallOd);
  if (!(big > small) || count < 2) {
    return { ok: false, error: "大头须大于小头，且至少 2 节" };
  }

  const mid = [...new Set(catalog.filter((d) => d < big && d > small))].sort((a, b) => b - a);
  const chain = [big, ...mid, small];
  const ods = new Array(count);
  ods[0] = big;
  ods[count - 1] = small;

  if (count === 2) return { ok: true, ods };

  if (chain.length >= count) {
    for (let i = 1; i <= count - 2; i++) {
      const idx = Math.round((i * (chain.length - 1)) / (count - 1));
      let cand = chain[Math.min(idx, chain.length - 2)];
      // 保持严格介于相邻已定点之间（末端稍后写入）
      const prev = ods[i - 1];
      const minLeft = small + (count - 1 - i);
      if (cand >= prev) cand = prev - 1;
      if (cand <= minLeft) cand = minLeft;
      // 贴回目录
      const pool = mid.filter((d) => d < prev && d > small);
      if (pool.length) cand = nearestOd(cand, pool);
      if (cand >= prev || cand <= small) {
        const t = i / (count - 1);
        cand = nearestOd(big + (small - big) * t, pool.length ? pool : [Math.round(big + (small - big) * t)]);
      }
      ods[i] = cand;
    }
  } else {
    for (let i = 1; i <= count - 2; i++) {
      const t = i / (count - 1);
      ods[i] = Math.round(big + (small - big) * t);
    }
  }

  for (let i = 1; i < count - 1; i++) {
    if (!(ods[i] < ods[i - 1])) ods[i] = ods[i - 1] - 1;
    if (!(ods[i] > (ods[i + 1] ?? small))) {
      const hi = ods[i - 1];
      const lo = i + 1 < count - 1 ? ods[i + 1] : small;
      ods[i] = Math.round((hi + lo) / 2);
      if (!(ods[i] < hi)) ods[i] = hi - 1;
      if (!(ods[i] > lo)) ods[i] = lo + 1;
    }
  }
  ods[0] = big;
  ods[count - 1] = small;
  return { ok: true, ods };
}

/**
 * 计算节数与长度：大节=standardLen，小节=剩余非标
 */
export function planSegmentLengths(moldHeight, standardLen = 210, minSmall = 120, maxSmall = 400) {
  const H = Number(moldHeight);
  const S = Number(standardLen);
  if (!(H > 0) || !(S > 0)) return { ok: false, error: "模具总高与标准节长须大于 0" };

  const candidates = [];
  // 大节数量 k = n-1，n 从 2 到合理上限
  for (let k = 1; k <= 12; k++) {
    const smallLen = round3(H - k * S);
    if (smallLen <= 0) break;
    const n = k + 1;
    const inPrefer = smallLen >= 150 && smallLen <= 210;
    const inAllow = smallLen >= minSmall && smallLen <= maxSmall;
    if (!inAllow) continue;
    candidates.push({
      segmentCount: n,
      largeCount: k,
      standardLen: S,
      smallLen,
      inPrefer,
      score: inPrefer ? 0 : Math.min(Math.abs(smallLen - 150), Math.abs(smallLen - 210)) + (n > 5 ? n : 0),
    });
  }
  if (!candidates.length) {
    return {
      ok: false,
      error: `总高 ${H} 无法用「大节 ${S} + 小节非标」凑齐（小节需在 ${minSmall}～${maxSmall}）`,
    };
  }
  candidates.sort((a, b) => a.score - b.score || a.segmentCount - b.segmentCount);
  return { ok: true, plan: candidates[0], alternatives: candidates.slice(0, 5) };
}

function defaultWallFor(od, map) {
  if (map && map[od] != null) return Number(map[od]);
  if (od >= 180) return 8;
  if (od >= 140) return 6;
  return 6;
}

/** 求使校验通过的最小母端壁厚 */
export function minFemaleWall(D1, t1, D2, majorDia) {
  for (let t2 = 4; t2 <= 60; t2 += 0.5) {
    const r = computePipeEndThread(
      { D1, t1, D2, t2 },
      majorDia != null ? { majorDia } : {}
    );
    if (r.ok && r.checkPass) return t2;
  }
  return null;
}

/**
 * @param {{
 *   bigOd: number, smallOd: number, moldHeight: number,
 *   topAllowance?: number, bottomAllowance?: number,
 *   standardLen?: number, segmentCount?: number,
 *   walls?: Record<number, number>, roundThread?: boolean
 * }} input
 */
export function designConeMold(input) {
  const bigOd = Number(input.bigOd);
  const smallOd = Number(input.smallOd);
  const moldHeight = Number(input.moldHeight);
  const topAllowance = Number(input.topAllowance ?? CONE_MOLD_DEFAULTS.topAllowance);
  const bottomAllowance = Number(input.bottomAllowance ?? CONE_MOLD_DEFAULTS.bottomAllowance);
  const standardLen = Number(input.standardLen ?? CONE_MOLD_DEFAULTS.standardLen);
  const roundThread = input.roundThread !== false;
  const walls = input.walls || CONE_MOLD_DEFAULTS.defaultWall;

  if (!(bigOd > smallOd)) return { ok: false, error: "大头外径须大于小头外径" };
  if (!(moldHeight > 0)) return { ok: false, error: "模具总高须大于 0" };
  if (topAllowance < 0 || bottomAllowance < 0) return { ok: false, error: "上/下余量不能为负" };
  if (topAllowance >= standardLen) {
    return { ok: false, error: `上口余量 ${topAllowance} 须小于标准节长 ${standardLen}` };
  }
  if (bottomAllowance >= moldHeight) {
    return { ok: false, error: "下口余量过大" };
  }

  const lengthPlan = planSegmentLengths(moldHeight, standardLen);
  if (!lengthPlan.ok) return lengthPlan;

  let segmentCount = lengthPlan.plan.segmentCount;
  if (input.segmentCount != null && Number(input.segmentCount) >= 2) {
    const forced = Number(input.segmentCount);
    const smallLen = round3(moldHeight - (forced - 1) * standardLen);
    if (smallLen <= 0) {
      return { ok: false, error: `节数 ${forced} 过大，剩余小节长度不足` };
    }
    segmentCount = forced;
    lengthPlan.plan = {
      segmentCount: forced,
      largeCount: forced - 1,
      standardLen,
      smallLen,
      inPrefer: smallLen >= 150 && smallLen <= 210,
      score: 0,
    };
  }

  const odPick = input.preferredOds && Array.isArray(input.preferredOds) && input.preferredOds.length === segmentCount
    ? { ok: true, ods: input.preferredOds.map(Number) }
    : pickSegmentOds(bigOd, smallOd, segmentCount);
  if (!odPick.ok) return odPick;
  if (odPick.ods[0] !== bigOd || odPick.ods[odPick.ods.length - 1] !== smallOd) {
    odPick.ods[0] = bigOd;
    odPick.ods[odPick.ods.length - 1] = smallOd;
  }

  const smallLen = lengthPlan.plan.smallLen;
  const segments = odPick.ods.map((od, i) => {
    const isFirst = i === 0;
    const isLast = i === odPick.ods.length - 1;
    const length = isLast ? smallLen : standardLen;
    const kind = isLast ? "非标" : "标准";
    const wall = defaultWallFor(od, walls);
    return {
      index: i + 1,
      od,
      length,
      kind,
      wall,
      topFaceOffset: isFirst ? topAllowance : null,
      belowTopFace: isFirst ? round3(length - topAllowance) : null,
      bottomFaceOffset: isLast ? bottomAllowance : null,
      aboveBottomFace: isLast ? round3(length - bottomAllowance) : null,
      femaleEnd: !isLast,
      maleEnd: !isFirst,
    };
  });

  const faceToFace = round3(
    segments[0].belowTopFace +
      segments.slice(1, -1).reduce((s, seg) => s + seg.length, 0) +
      segments[segments.length - 1].aboveBottomFace
  );

  const joints = [];
  for (let i = 0; i < segments.length - 1; i++) {
    const female = segments[i];
    const male = segments[i + 1];
    const D1 = male.od;
    const t1 = male.wall;
    const D2 = female.od;
    const auto = computePipeEndThread({ D1, t1, D2, t2: 40 });
    if (!auto.ok) {
      joints.push({ ok: false, error: auto.error, fromOd: D2, toOd: D1 });
      continue;
    }
    const majorDia = roundThread ? roundMajor05(auto.recommendedMajor) : auto.recommendedMajor;
    // 圆整后若为 0，回退自动值
    const major = majorDia > 0 ? majorDia : auto.recommendedMajor;
    const minT2 = minFemaleWall(D1, t1, D2, major);
    const check = computePipeEndThread(
      { D1, t1, D2, t2: minT2 || 40 },
      { majorDia: major }
    );
    const cards = computeThreadEndCards(`M${major}×${PIPE_END_CONST.pitch}`);
    joints.push({
      ok: true,
      index: i + 1,
      fromOd: D2,
      toOd: D1,
      maleWall: t1,
      autoDesignation: auto.recommendedDesignation,
      designation: `M${major}×${PIPE_END_CONST.pitch}`,
      majorDia: major,
      crest: check.crest,
      root: check.root,
      undercutDf: major - 3,
      undercutDg: major + 3,
      endStructure: 26,
      minFemaleWall: minT2,
      checkPass: !!minT2,
      checkMessage: minT2
        ? `母端局部壁厚建议 ≥ ${minT2} mm`
        : "无法满足母端壁厚校验，请加厚或改规格",
      maleCard: cards.ok ? cards.male : null,
      femaleCard: cards.ok ? cards.female : null,
      theoryMajor: auto.theoryMajor,
      smallCenterDia: auto.smallCenterDia,
    });
  }

  const sumLen = round3(segments.reduce((s, seg) => s + seg.length, 0));

  return {
    ok: true,
    input: { bigOd, smallOd, moldHeight, topAllowance, bottomAllowance, standardLen, roundThread },
    segmentCount,
    segments,
    joints,
    summary: {
      moldHeight: sumLen,
      heightOk: Math.abs(sumLen - moldHeight) < 1e-6,
      faceToFace,
      expectedFaceToFace: round3(moldHeight - topAllowance - bottomAllowance),
      jointCount: joints.length,
      pitch: PIPE_END_CONST.pitch,
      locator: PIPE_END_CONST.locatorLen,
      engage: PIPE_END_CONST.engageLen,
      undercut: 4,
    },
    alternatives: lengthPlan.alternatives,
  };
}
