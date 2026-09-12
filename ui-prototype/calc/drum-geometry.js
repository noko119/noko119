/**
 * 滚筒 D/2 偏移与包角辅助（对标 Belt Analyst / Helix）
 * - wrap：相邻段夹角 → 包角 φ
 * - offset：中心线折点按滚筒半径沿角平分线外推/内收，逼近带面绕经
 */

/**
 * 计算节点 i 处包角（度）与转向
 * φ ≈ 180° - 折线内角，或等价于转角补角
 */
export function computeWrapAtNode(nodes, i) {
  if (i <= 0 || i >= nodes.length - 1) {
    return {
      ok: false,
      wrap_angle_deg: null,
      turn_deg: null,
      message: "端点无双侧邻段，包角需结合滚筒进出边另定",
    };
  }
  const a = nodes[i - 1];
  const b = nodes[i];
  const c = nodes[i + 1];
  const v1x = a.x - b.x;
  const v1y = a.y - b.y;
  const v1z = a.z - b.z;
  const v2x = c.x - b.x;
  const v2y = c.y - b.y;
  const v2z = c.z - b.z;
  const L1 = Math.hypot(v1x, v1y, v1z) || 1e-9;
  const L2 = Math.hypot(v2x, v2y, v2z) || 1e-9;
  const dot = Math.max(
    -1,
    Math.min(1, (v1x * v2x + v1y * v2y + v1z * v2z) / (L1 * L2))
  );
  const interior = Math.acos(dot); // 入边与出边夹角
  const wrap = Math.PI - interior; // 胶带绕经外侧包角近似
  const wrap_deg = (wrap * 180) / Math.PI;
  const turn_deg = (interior * 180) / Math.PI;
  return {
    ok: true,
    wrap_angle_deg: +wrap_deg.toFixed(3),
    turn_deg: +turn_deg.toFixed(3),
    interior_deg: +turn_deg.toFixed(3),
    message: `包角 φ≈${wrap_deg.toFixed(1)}°（由邻段几何）`,
  };
}

/**
 * 为路径上全部滚筒类节点写入 wrap_angle_deg
 */
export function annotateWrapAngles(nodes) {
  const DRUM = new Set(["tail", "head", "drive", "bend", "takeup"]);
  return nodes.map((n, i) => {
    if (!DRUM.has(n.type)) return { ...n };
    const w = computeWrapAtNode(nodes, i);
    if (!w.ok) return { ...n, wrap_angle_deg: n.wrap_angle_deg ?? null };
    return {
      ...n,
      wrap_angle_deg: w.wrap_angle_deg,
      wrap_source: "geometry",
    };
  });
}

/**
 * 单点按 D/2 沿角平分线偏移（使折线更接近带绕滚筒外缘）
 * @param {object} node
 * @param {object} prev
 * @param {object} next
 * @param {{ outward?:boolean }} [opts] outward=true 沿转角外侧推（常用）
 */
export function offsetNodeByDrumRadius(node, prev, next, opts = {}) {
  const D = Number(node.drum_D_mm);
  if (!(D > 0)) {
    return { node: { ...node }, applied: false, reason: "无 drum_D_mm" };
  }
  const R = D / 2000; // mm → m
  const v1x = node.x - prev.x;
  const v1y = node.y - prev.y;
  const v1z = node.z - prev.z;
  const v2x = next.x - node.x;
  const v2y = next.y - node.y;
  const v2z = next.z - node.z;
  const L1 = Math.hypot(v1x, v1y, v1z) || 1e-9;
  const L2 = Math.hypot(v2x, v2y, v2z) || 1e-9;
  const u1 = { x: v1x / L1, y: v1y / L1, z: v1z / L1 };
  const u2 = { x: v2x / L2, y: v2y / L2, z: v2z / L2 };
  // 角平分线方向（单位化 u2-u1 或 u1+u2 的垂直——用 -(u1)+u2 ）
  let bx = u2.x - u1.x;
  let by = u2.y - u1.y;
  let bz = u2.z - u1.z;
  let bl = Math.hypot(bx, by, bz);
  if (bl < 1e-9) {
    // 近似共线：取水平法向
    bx = -u1.z;
    by = 0;
    bz = u1.x;
    bl = Math.hypot(bx, bz) || 1;
  }
  bx /= bl;
  by /= bl;
  bz /= bl;
  const sign = opts.outward === false ? -1 : 1;
  const out = {
    ...node,
    x: +(node.x + sign * bx * R).toFixed(4),
    y: +(node.y + sign * by * R).toFixed(4),
    z: +(node.z + sign * bz * R).toFixed(4),
    centerline_offset_m: R,
    offset_applied: true,
  };
  return { node: out, applied: true, R_m: R };
}

/**
 * 对所有带 drum_D_mm 的非端点滚筒应用 D/2 偏移
 */
export function applyDrumRadiusOffsets(nodes, opts = {}) {
  const DRUM = new Set(["tail", "head", "drive", "bend", "takeup"]);
  const out = nodes.map((n) => ({ ...n }));
  let count = 0;
  for (let i = 1; i < out.length - 1; i++) {
    if (!DRUM.has(out[i].type)) continue;
    if (!(out[i].drum_D_mm > 0)) continue;
    const { node, applied } = offsetNodeByDrumRadius(out[i], out[i - 1], out[i + 1], opts);
    if (applied) {
      out[i] = node;
      count += 1;
    }
  }
  return {
    nodes: annotateWrapAngles(out),
    meta: {
      offset_count: count,
      source: "drum_D2_offset",
      note: "中心线按 D/2 角平分线偏移；包角已按邻段几何重算",
    },
  };
}

/**
 * 欧拉不打滑校核：e^{μφ} ≥ S_tight / S_slack
 * @param {{wrap_deg:number, mu:number, S_tight_N:number, S_slack_N:number}} opts
 */
export function checkDriveNoSlip(opts = {}) {
  const wrap_deg = Number(opts.wrap_deg);
  const mu = Number.isFinite(opts.mu) ? opts.mu : 0.3;
  const S_tight = Number(opts.S_tight_N);
  const S_slack = Number(opts.S_slack_N);
  if (!(wrap_deg > 0) || !(S_tight > 0) || !(S_slack > 0)) {
    return {
      ok: false,
      ratio: null,
      e_mu_phi: null,
      wrap_deg: wrap_deg || null,
      mu,
      message: "包角或张力不足，无法校核不打滑",
    };
  }
  const phi = (wrap_deg * Math.PI) / 180;
  const e_mu_phi = Math.exp(mu * phi);
  const ratio = S_tight / S_slack;
  const ok = e_mu_phi + 1e-9 >= ratio;
  return {
    ok,
    ratio: +ratio.toFixed(4),
    e_mu_phi: +e_mu_phi.toFixed(4),
    wrap_deg: +wrap_deg.toFixed(3),
    mu,
    S_tight_N: S_tight,
    S_slack_N: S_slack,
    margin: +(e_mu_phi - ratio).toFixed(4),
    formula: "e^{μφ} ≥ S_tight/S_slack",
    message: ok
      ? `不打滑：e^{μφ}=${e_mu_phi.toFixed(3)} ≥ S₁/S₂=${ratio.toFixed(3)}`
      : `打滑风险：e^{μφ}=${e_mu_phi.toFixed(3)} < S₁/S₂=${ratio.toFixed(3)}`,
  };
}

/**
 * 为驱动节点写入不打滑校核结果
 * @param {Array} nodes
 * @param {{mu?:number, S_tight_N?:number, S_slack_N?:number, min_drive_wrap_deg?:number}} [opts]
 */
export function annotateDriveSlipChecks(nodes, opts = {}) {
  const mu = Number.isFinite(opts.mu) ? opts.mu : 0.3;
  const S_tight = Number.isFinite(opts.S_tight_N) ? opts.S_tight_N : 175621 + 24946;
  const S_slack = Number.isFinite(opts.S_slack_N) ? opts.S_slack_N : 24946;
  const items = [];
  const out = (nodes || []).map((n, i) => {
    if (n.type !== "drive") return { ...n };
    const wrap = n.wrap_angle_deg ?? computeWrapAtNode(nodes, i).wrap_angle_deg;
    const chk = checkDriveNoSlip({
      wrap_deg: wrap,
      mu: Number.isFinite(n.mu) ? n.mu : mu,
      S_tight_N: Number.isFinite(n.S_tight_N) ? n.S_tight_N : S_tight,
      S_slack_N: Number.isFinite(n.S_slack_N) ? n.S_slack_N : S_slack,
    });
    items.push({ node_id: n.id, ...chk });
    return {
      ...n,
      wrap_angle_deg: wrap,
      no_slip_ok: chk.ok,
      no_slip_e_mu_phi: chk.e_mu_phi,
      no_slip_ratio: chk.ratio,
      no_slip_message: chk.message,
    };
  });
  return {
    nodes: out,
    items,
    ok: items.length ? items.every((x) => x.ok) : true,
    meta: {
      source: "euler_no_slip",
      formula: "e^{μφ} ≥ S_tight/S_slack",
      note: "欧拉摩擦不打滑校核（驱动节点）",
    },
  };
}
