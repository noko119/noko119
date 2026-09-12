/**
 * 水平弯辅助（XY 平面圆弧；Z 线性插值）
 * 对标大厂水平转弯 / 平面弯道
 */

/**
 * 三点折线在 i 处的水平转角（XY）
 */
export function cornerAngleXY(nodes, i) {
  if (i <= 0 || i >= nodes.length - 1) {
    return { ok: false, angle_rad: 0, angle_deg: 0, bisector: { x: 0, y: 0 } };
  }
  const a = nodes[i - 1];
  const b = nodes[i];
  const c = nodes[i + 1];
  const v1x = b.x - a.x;
  const v1y = b.y - a.y;
  const v2x = c.x - b.x;
  const v2y = c.y - b.y;
  const L1 = Math.hypot(v1x, v1y) || 1e-9;
  const L2 = Math.hypot(v2x, v2y) || 1e-9;
  const u1x = v1x / L1;
  const u1y = v1y / L1;
  const u2x = v2x / L2;
  const u2y = v2y / L2;
  const cross = u1x * u2y - u1y * u2x;
  const dot = Math.max(-1, Math.min(1, u1x * u2x + u1y * u2y));
  const angle = Math.acos(dot);
  let bx = u1x - u2x;
  let by = u1y - u2y;
  const bl = Math.hypot(bx, by);
  if (bl < 1e-9) {
    bx = -u1y;
    by = u1x;
  } else {
    bx /= bl;
    by /= bl;
  }
  return {
    ok: angle > 1e-4,
    angle_rad: angle,
    angle_deg: +((angle * 180) / Math.PI).toFixed(4),
    bisector: { x: bx, y: by },
    len_in: L1,
    len_out: L2,
    turn_sign: Math.sign(cross) || 1,
  };
}

/**
 * 水平弯最小半径示意：R_min ≈ max(30, 40·v²)
 */
export function suggestHorizontalRmin_m(opts = {}) {
  const v = Number.isFinite(opts.v_mps) ? opts.v_mps : 2;
  const k = Number.isFinite(opts.k) ? opts.k : 40;
  const R = Math.max(30, k * v * v);
  return {
    R_min_m: +R.toFixed(2),
    v_mps: v,
    k,
    note: "水平弯 Rmin 示意（速度地板）；正式设计按横向力/托辊间距校核",
  };
}

/**
 * 在节点 i 处插入水平圆弧（XY）；Z 在切点间线性插值
 * @param {Array} nodes
 * @param {number} i
 * @param {{R_m:number, segments?:number, v_mps?:number}} opts
 */
export function insertHorizontalCurveAt(nodes, i, opts = {}) {
  const R = Number(opts.R_m);
  if (!(R > 0)) throw new Error("水平弯半径 R 必须 > 0");
  const segs = Math.max(2, Math.min(24, Math.floor(opts.segments ?? 6)));
  const info = cornerAngleXY(nodes, i);
  if (!info.ok) throw new Error("该点不是有效水平转角，无法插弧");

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

  const L1 = info.len_in;
  const L2 = info.len_out;
  const u1x = (b.x - a.x) / L1;
  const u1y = (b.y - a.y) / L1;
  const u2x = (c.x - b.x) / L2;
  const u2y = (c.y - b.y) / L2;

  // 切点（XY）；Z 按路径参数插值
  const tIn = T / L1;
  const tOut = T / L2;
  const p1 = {
    x: b.x - u1x * T,
    y: b.y - u1y * T,
    z: a.z + (b.z - a.z) * (1 - tIn),
  };
  const p2 = {
    x: b.x + u2x * T,
    y: b.y + u2y * T,
    z: b.z + (c.z - b.z) * tOut,
  };

  let n1x = -u1y * info.turn_sign;
  let n1y = u1x * info.turn_sign;
  let n2x = -u2y * info.turn_sign;
  let n2y = u2x * info.turn_sign;
  const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  const toB = { x: b.x - mid.x, y: b.y - mid.y };
  if (n1x * toB.x + n1y * toB.y < 0) {
    n1x = -n1x;
    n1y = -n1y;
  }
  if (n2x * toB.x + n2y * toB.y < 0) {
    n2x = -n2x;
    n2y = -n2y;
  }

  const c1 = { x: p1.x + n1x * R, y: p1.y + n1y * R };
  const c2 = { x: p2.x + n2x * R, y: p2.y + n2y * R };
  const cx = (c1.x + c2.x) / 2;
  const cy = (c1.y + c2.y) / 2;

  const a0 = Math.atan2(p1.y - cy, p1.x - cx);
  const a1 = Math.atan2(p2.y - cy, p2.x - cx);
  let dAng = a1 - a0;
  while (dAng > Math.PI) dAng -= 2 * Math.PI;
  while (dAng < -Math.PI) dAng += 2 * Math.PI;

  const arcPts = [];
  for (let s = 0; s <= segs; s++) {
    const t = s / segs;
    const ang = a0 + dAng * t;
    arcPts.push({
      id: `harc_${i}_${s}`,
      x: +(cx + R * Math.cos(ang)).toFixed(4),
      y: +(cy + R * Math.sin(ang)).toFixed(4),
      z: +(p1.z + (p2.z - p1.z) * t).toFixed(4),
      type: s === 0 || s === segs ? "bend" : "node",
      branch: b.branch || "carry",
      strand: b.strand || b.branch || "carry",
      curve: "horizontal",
      R_m: R,
      label: s === Math.floor(segs / 2) ? `水平弯 R${R}` : undefined,
      auto_return: false,
    });
  }

  const out = [...nodes.slice(0, i), ...arcPts, ...nodes.slice(i + 1)];
  const suggest = suggestHorizontalRmin_m({ v_mps: opts.v_mps });
  return {
    nodes: out,
    meta: {
      R_m: R,
      kind: "horizontal",
      theta_deg: info.angle_deg,
      T_m: +T.toFixed(4),
      segments: segs,
      R_min_suggest_m: suggest.R_min_m,
      ok_vs_suggest: R >= suggest.R_min_m,
      note: suggest.note,
    },
  };
}
