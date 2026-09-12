/**
 * 凸/凹弧与最小半径辅助（对标 Belt Analyst 竖曲线 / DTⅡ 正式 Rmin）
 * 在折线转角处插入圆弧折线点（XZ 铅垂面近似）
 */

const G_DEFAULT = 9.81;
const QB_DEFAULT = 47.6;
const QG_DEFAULT = 236.1;
const T_DEFAULT = 50000;
const HA_ADM_DEFAULT = 0.01; // (h/a)_adm 下垂度许用

/**
 * 三点折线在 i 处的转角（弧度，符号：上凸为正约定见 convex）
 * @returns {{angle_rad:number, angle_deg:number, bisector:{x:number,z:number}, ok:boolean}}
 */
export function cornerAngleXZ(nodes, i) {
  if (i <= 0 || i >= nodes.length - 1) {
    return { ok: false, angle_rad: 0, angle_deg: 0, bisector: { x: 0, z: 0 } };
  }
  const a = nodes[i - 1];
  const b = nodes[i];
  const c = nodes[i + 1];
  const v1x = b.x - a.x;
  const v1z = b.z - a.z;
  const v2x = c.x - b.x;
  const v2z = c.z - b.z;
  const L1 = Math.hypot(v1x, v1z) || 1e-9;
  const L2 = Math.hypot(v2x, v2z) || 1e-9;
  const u1x = v1x / L1;
  const u1z = v1z / L1;
  const u2x = v2x / L2;
  const u2z = v2z / L2;
  const cross = u1x * u2z - u1z * u2x;
  const dot = Math.max(-1, Math.min(1, u1x * u2x + u1z * u2z));
  const angle = Math.acos(dot);
  let bx = u1x - u2x;
  let bz = u1z - u2z;
  const bl = Math.hypot(bx, bz);
  if (bl < 1e-9) {
    bx = -u1z;
    bz = u1x;
  } else {
    bx /= bl;
    bz /= bl;
  }
  return {
    ok: angle > 1e-4,
    angle_rad: angle,
    angle_deg: +((angle * 180) / Math.PI).toFixed(4),
    bisector: { x: bx, z: bz },
    len_in: L1,
    len_out: L2,
    turn_sign: Math.sign(cross) || 1,
  };
}

/**
 * DTⅡ 风格最小竖曲线半径
 * - 张力项：凸 R_t = T/(qB·g)；凹 R_t = T/((qB+qG)·g)
 * - 下垂度地板：R_sag = a / (8·(h/a)_adm)（有 a_idler 时）
 * - 速度地板：max(20, k·v²)
 * 调用兼容：suggestMinRadius_m({ kind, v_mps }) 或仅传 kind/v 仍可用默认 T/q
 */
export function suggestMinRadius_m(opts = {}) {
  // 兼容旧式位置参数：suggestMinRadius_m(kind, v_mps)
  if (typeof opts === "string") {
    opts = { kind: opts, v_mps: arguments[1] };
  }
  const v = Number.isFinite(opts.v_mps) ? opts.v_mps : 2;
  const kind = opts.kind === "concave" ? "concave" : "convex";
  const g = Number.isFinite(opts.g) ? opts.g : G_DEFAULT;
  const qB = Number.isFinite(opts.qB) ? opts.qB : QB_DEFAULT;
  const qG = Number.isFinite(opts.qG) ? opts.qG : QG_DEFAULT;
  const T = Number.isFinite(opts.T_N) ? opts.T_N : Number.isFinite(opts.T) ? opts.T : T_DEFAULT;
  const ha_adm = Number.isFinite(opts.ha_adm) ? opts.ha_adm : HA_ADM_DEFAULT;
  const a_idler = Number.isFinite(opts.a_idler_m)
    ? opts.a_idler_m
    : Number.isFinite(opts.a_idler)
      ? opts.a_idler
      : null;

  const k = kind === "concave" ? 45 : 60;
  const R_v = Math.max(20, k * v * v);

  const denom =
    kind === "concave" ? (qB + qG) * g : qB * g;
  const R_t = denom > 0 ? T / denom : 0;

  let R_sag = null;
  if (a_idler != null && a_idler > 0 && ha_adm > 0) {
    R_sag = a_idler / (8 * ha_adm);
  }

  const terms = [R_t, R_v];
  if (R_sag != null) terms.push(R_sag);
  const R_min = Math.max(...terms);

  const usedDefaults = !(
    Number.isFinite(opts.T_N) ||
    Number.isFinite(opts.T) ||
    Number.isFinite(opts.qB) ||
    Number.isFinite(opts.qG)
  );

  return {
    R_min_m: +R_min.toFixed(2),
    kind,
    v_mps: v,
    breakdown: {
      R_tension_m: +R_t.toFixed(2),
      R_velocity_m: +R_v.toFixed(2),
      R_sag_m: R_sag != null ? +R_sag.toFixed(2) : null,
      T_N: T,
      qB,
      qG,
      g,
      a_idler_m: a_idler,
      ha_adm,
      k_velocity: k,
      used_defaults: usedDefaults,
    },
    note: usedDefaults
      ? "DTⅡ 正式 Rmin（张力+速度+下垂度）；T/q 未给时用默认值，正式设计请代入实际张力"
      : "DTⅡ 正式 Rmin（张力+速度+下垂度）",
  };
}

/**
 * 在节点 i 处插入圆弧折线（替换尖角）
 * @param {Array} nodes
 * @param {number} i 转角节点下标
 * @param {{R_m:number, kind?:'convex'|'concave', segments?:number}} opts
 */
export function insertVerticalCurveAt(nodes, i, opts = {}) {
  const R = Number(opts.R_m);
  if (!(R > 0)) throw new Error("竖曲线半径 R 必须 > 0");
  const kind = opts.kind === "concave" ? "concave" : "convex";
  const segs = Math.max(2, Math.min(24, Math.floor(opts.segments ?? 6)));
  const info = cornerAngleXZ(nodes, i);
  if (!info.ok) throw new Error("该点不是有效转角，无法插弧");

  const a = nodes[i - 1];
  const b = nodes[i];
  const c = nodes[i + 1];
  const theta = info.angle_rad;
  const T = R * Math.tan(theta / 2);
  if (T > info.len_in * 0.95 || T > info.len_out * 0.95) {
    throw new Error(
      `半径过大：切线长 T=${T.toFixed(2)} m 超过邻段（${info.len_in.toFixed(2)} / ${info.len_out.toFixed(2)}）`
    );
  }

  const v1x = b.x - a.x;
  const v1z = b.z - a.z;
  const v2x = c.x - b.x;
  const v2z = c.z - b.z;
  const L1 = info.len_in;
  const L2 = info.len_out;
  const u1x = v1x / L1;
  const u1z = v1z / L1;
  const u2x = v2x / L2;
  const u2z = v2z / L2;

  const p1 = { x: b.x - u1x * T, y: b.y, z: b.z - u1z * T };
  const p2 = { x: b.x + u2x * T, y: b.y, z: b.z + u2z * T };

  const inward = kind === "convex" ? -1 : 1;
  let n1x = -u1z * info.turn_sign * inward;
  let n1z = u1x * info.turn_sign * inward;
  let n2x = -u2z * info.turn_sign * inward;
  let n2z = u2x * info.turn_sign * inward;
  const mid = { x: (p1.x + p2.x) / 2, y: b.y, z: (p1.z + p2.z) / 2 };
  const toB = { x: b.x - mid.x, z: b.z - mid.z };
  if (n1x * toB.x + n1z * toB.z < 0) {
    n1x = -n1x;
    n1z = -n1z;
  }
  if (n2x * toB.x + n2z * toB.z < 0) {
    n2x = -n2x;
    n2z = -n2z;
  }

  const c1 = { x: p1.x + n1x * R, z: p1.z + n1z * R };
  const c2 = { x: p2.x + n2x * R, z: p2.z + n2z * R };
  const cx = (c1.x + c2.x) / 2;
  const cz = (c1.z + c2.z) / 2;

  const a0 = Math.atan2(p1.z - cz, p1.x - cx);
  const a1 = Math.atan2(p2.z - cz, p2.x - cx);
  let dAng = a1 - a0;
  while (dAng > Math.PI) dAng -= 2 * Math.PI;
  while (dAng < -Math.PI) dAng += 2 * Math.PI;

  const arcPts = [];
  for (let s = 0; s <= segs; s++) {
    const t = s / segs;
    const ang = a0 + dAng * t;
    arcPts.push({
      id: `arc_${i}_${s}`,
      x: +(cx + R * Math.cos(ang)).toFixed(4),
      y: b.y ?? 0,
      z: +(cz + R * Math.sin(ang)).toFixed(4),
      type: s === 0 || s === segs ? "bend" : "node",
      branch: b.branch || "carry",
      strand: b.strand || b.branch || "carry",
      curve: kind,
      R_m: R,
      label: s === Math.floor(segs / 2) ? `${kind === "convex" ? "凸" : "凹"}弧 R${R}` : undefined,
      auto_return: false,
    });
  }

  const out = [...nodes.slice(0, i), ...arcPts, ...nodes.slice(i + 1)];

  const suggest = suggestMinRadius_m({
    kind,
    v_mps: opts.v_mps,
    T_N: opts.T_N,
    qB: opts.qB,
    qG: opts.qG,
    a_idler_m: opts.a_idler_m,
  });
  return {
    nodes: out,
    meta: {
      R_m: R,
      kind,
      theta_deg: info.angle_deg,
      T_m: +T.toFixed(4),
      segments: segs,
      R_min_suggest_m: suggest.R_min_m,
      R_min_breakdown: suggest.breakdown,
      ok_vs_suggest: R >= suggest.R_min_m,
      note: suggest.note,
    },
  };
}
