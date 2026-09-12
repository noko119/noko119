/**
 * 凸/凹弧与最小半径辅助（对标 Belt Analyst 竖曲线）
 * 在折线转角处插入圆弧折线点（XZ 铅垂面近似）
 */

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
  // 角平分线（指向转角内侧的近似：-归一化(u1)+归一化(u2) 的垂直方向用 cross 定侧）
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
 * 简化最小竖曲线半径建议（工程示意，非替代正式手册公式）
 * R_min ≈ k * v^2 ；凸/凹用不同系数
 */
export function suggestMinRadius_m(opts = {}) {
  const v = Number.isFinite(opts.v_mps) ? opts.v_mps : 2;
  const kind = opts.kind === "concave" ? "concave" : "convex";
  const k = kind === "concave" ? 45 : 60; // 示意系数
  const R = Math.max(20, k * v * v);
  return {
    R_min_m: +R.toFixed(2),
    kind,
    v_mps: v,
    note: "示意最小半径，正式设计请按 DTⅡ/手册张力与下垂度校核",
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
  // 切线长 T = R * tan(θ/2)
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

  // 切点
  const p1 = { x: b.x - u1x * T, y: b.y, z: b.z - u1z * T };
  const p2 = { x: b.x + u2x * T, y: b.y, z: b.z + u2z * T };

  // 圆心：从角平分线方向偏移 R / cos(θ/2) … 用两切线法向交点
  // 入切法向（指向转角内侧）
  const inward = kind === "convex" ? -1 : 1;
  // 入边左侧法向
  let n1x = -u1z * info.turn_sign * inward;
  let n1z = u1x * info.turn_sign * inward;
  let n2x = -u2z * info.turn_sign * inward;
  let n2z = u2x * info.turn_sign * inward;
  // 统一朝向：使圆心在角内侧
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

  // 圆心 = p1 + n1*R（与 p2 + n2*R 取平均提高稳健性）
  const c1 = { x: p1.x + n1x * R, z: p1.z + n1z * R };
  const c2 = { x: p2.x + n2x * R, z: p2.z + n2z * R };
  const cx = (c1.x + c2.x) / 2;
  const cz = (c1.z + c2.z) / 2;

  const a0 = Math.atan2(p1.z - cz, p1.x - cx);
  const a1 = Math.atan2(p2.z - cz, p2.x - cx);
  let dAng = a1 - a0;
  // 走短弧，方向与转角一致
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

  const out = [
    ...nodes.slice(0, i),
    ...arcPts,
    ...nodes.slice(i + 1),
  ];

  const suggest = suggestMinRadius_m({ kind, v_mps: opts.v_mps });
  return {
    nodes: out,
    meta: {
      R_m: R,
      kind,
      theta_deg: info.angle_deg,
      T_m: +T.toFixed(4),
      segments: segs,
      R_min_suggest_m: suggest.R_min_m,
      ok_vs_suggest: R >= suggest.R_min_m,
      note: suggest.note,
    },
  };
}
