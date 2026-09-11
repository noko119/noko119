/**
 * 网页端路径几何提取（强制正确）
 * Schema: pidm.extract.v0 · source = web_path
 * 公式：L=‖ΔP‖，H=Δz，Ln=√(dx²+dy²)，δ=atan2(H,Ln)
 */

const EXTRACT_SCHEMA = "pidm.extract.v0";
const ROUND = 6; // 几何中间量保留位数（m / °）

function round(n, p = ROUND) {
  if (!Number.isFinite(n)) return n;
  const f = 10 ** p;
  return Math.round(n * f) / f;
}

/**
 * 单段几何（纯函数，可供回归）
 * @param {{x:number,y:number,z:number}} from
 * @param {{x:number,y:number,z:number}} to
 */
export function segmentGeometry(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const Ln = Math.hypot(dx, dy);
  const L = Math.hypot(dx, dy, dz);
  const H = dz;
  const delta_deg = (Math.atan2(H, Ln) * 180) / Math.PI;
  return {
    dx: round(dx),
    dy: round(dy),
    dz: round(dz),
    L_m: round(L, 6),
    Ln_m: round(Ln, 6),
    H_m: round(H, 6),
    delta_deg: round(delta_deg, 6),
  };
}

function nodeMap(path) {
  const m = new Map();
  for (const n of path.nodes || []) m.set(n.id, n);
  return m;
}

/**
 * 从 path 正确提取几何 → pidm.extract.v0
 * 同时回写 path.segments 的 L/H/delta_deg 与 extract_status=complete
 */
export function extractGeometryFromPath(path, opts = {}) {
  if (!path || !Array.isArray(path.nodes) || path.nodes.length < 2) {
    throw new Error("extractGeometryFromPath: 路径节点不足");
  }

  const nodes = path.nodes;
  const byId = nodeMap(path);
  const a0 = path.line?.a0_default ?? 1.2;
  const aU = path.line?.aU_default ?? 3.0;

  // 若尚无 segments，按节点序生成骨架段
  let segments = Array.isArray(path.segments) ? path.segments : [];
  if (segments.length === 0) {
    segments = [];
    for (let i = 0; i < nodes.length - 1; i++) {
      segments.push({
        id: `seg_${i + 1}`,
        from_node_id: nodes[i].id,
        to_node_id: nodes[i + 1].id,
        major_id: null,
        sub_id: null,
        branch: "carry",
      });
    }
  }

  const extractSegs = [];
  let sumL = 0;
  let sumLn = 0;
  let sumH = 0;

  for (const seg of segments) {
    const from = byId.get(seg.from_node_id);
    const to = byId.get(seg.to_node_id);
    if (!from || !to) {
      throw new Error(`extractGeometryFromPath: 区段 ${seg.id} 节点缺失`);
    }
    const g = segmentGeometry(from, to);
    sumL += g.L_m;
    sumLn += g.Ln_m;
    sumH += g.H_m;

    const a_idler =
      seg.a_idler != null
        ? seg.a_idler
        : seg.branch === "return"
          ? aU
          : a0;

    // 回写 path 段（权威几何）
    seg.L = g.L_m;
    seg.H = g.H_m;
    seg.delta_deg = g.delta_deg;
    seg.Ln = g.Ln_m;
    seg.extract_status = "complete";
    if (seg.a_idler == null) seg.a_idler = a_idler;

    extractSegs.push({
      path_segment_id: seg.id,
      from_node_id: seg.from_node_id,
      to_node_id: seg.to_node_id,
      L_m: g.L_m,
      Ln_m: g.Ln_m,
      H_m: g.H_m,
      delta_deg: g.delta_deg,
      a_idler_m: a_idler,
      R_m: seg.R ?? null,
      theta_deg: seg.theta_deg ?? null,
      major_id: seg.major_id ?? null,
      sub_id: seg.sub_id ?? null,
      branch: seg.branch || "carry",
      completeness: "complete",
      formula: {
        L: "‖P_to − P_from‖",
        H: "z_to − z_from",
        Ln: "√(dx² + dy²)",
        delta: "atan2(H, Ln)",
      },
      intermediates: { dx: g.dx, dy: g.dy, dz: g.dz },
    });
  }

  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  const H_net = round(last.z - first.z, 6);
  const L_total = round(sumL, 6);
  const Ln_total = round(sumLn, 6);
  const delta_eq_deg = round((Math.atan2(H_net, Ln_total) * 180) / Math.PI, 6);

  const drums = nodes
    .filter((n) => ["tail", "head", "drive", "bend", "takeup"].includes(n.type))
    .map((n) => ({
      path_node_id: n.id,
      D_mm: n.drum_D_mm ?? null,
      type: n.type,
      drive_role: n.drive_role || (n.is_main_drive || n.mainDrive ? "main" : n.type === "drive" ? "aux" : "none"),
      wrap_angle_deg: n.wrap_angle_deg ?? null,
      friction_mu: n.friction_mu ?? null,
      center_xyz_m: { x: n.x, y: n.y, z: n.z },
      is_main_drive: !!(n.is_main_drive || n.mainDrive || n.drive_role === "main"),
    }));

  const geometry_version =
    opts.geometry_version || path.versions?.geometry || "G-web-1";

  const extract = {
    schema: EXTRACT_SCHEMA,
    source: "web_path",
    geometry_version,
    extracted_at: new Date().toISOString(),
    line_id: path.line?.line_id || null,
    line_geometry: {
      L_m: L_total,
      Ln_m: Ln_total,
      H_m: H_net,
      delta_deg: delta_eq_deg,
      node_count: nodes.length,
      segment_count: extractSegs.length,
      formula: {
        L: "Σ L_i",
        Ln: "Σ Ln_i",
        H: "z_last − z_first",
        delta: "atan2(H_net, Ln)",
      },
    },
    segments: extractSegs,
    drums,
    point_order: path.point_order || null,
    audit: {
      ok: extractSegs.every((s) => Number.isFinite(s.L_m) && s.L_m >= 0),
      notes: ["网页路径 XYZ 精确提取；可直接驱动计算"],
    },
  };

  path.segments = segments;
  path.totalLength_m = L_total;
  if (path.line) {
    path.line.Ln = Ln_total;
    path.line.H = H_net;
  }
  path.extract_ref = {
    schema: EXTRACT_SCHEMA,
    source: "web_path",
    geometry_version,
  };

  return extract;
}

/**
 * 用路径提取结果组装计算引擎输入（系数可覆盖）
 * 几何量一律来自 extract，禁止手填覆盖 L/H/δ（除非 opts.allowGeomOverride）
 */
export function buildCalcInputFromExtract(path, extract, coeff = {}) {
  if (!extract?.line_geometry) {
    throw new Error("buildCalcInputFromExtract: 缺少 extract.line_geometry");
  }
  const lg = extract.line_geometry;
  const line = path.line || {};
  const Q = coeff.Q_tph ?? line.Q ?? 1700;
  const v = coeff.v_mps ?? line.v ?? 2;
  const qG =
    coeff.qG ??
    (Number.isFinite(Q) && Number.isFinite(v) && v > 0 ? +(Q / (3.6 * v)).toFixed(4) : 0);

  const L_m = coeff.allowGeomOverride && coeff.L_m != null ? coeff.L_m : lg.L_m;
  const H_m = coeff.allowGeomOverride && coeff.H_m != null ? coeff.H_m : lg.H_m;
  const delta_deg =
    coeff.allowGeomOverride && coeff.delta_deg != null ? coeff.delta_deg : lg.delta_deg;

  return {
    case_id: line.line_id || "path-case",
    name: line.name || "路径提取方案",
    geometry_source: "web_path",
    geometry_version: extract.geometry_version,
    Q_tph: Q,
    rho: coeff.rho ?? line.rho ?? 1800,
    Ln_m: lg.Ln_m,
    H_m,
    delta_deg,
    B_mm: coeff.B_mm ?? line.B ?? 1400,
    v_mps: v,
    a0_m: coeff.a0_m ?? line.a0_default ?? 1.2,
    aU_m: coeff.aU_m ?? line.aU_default ?? 3.0,
    trough_deg: coeff.trough_deg ?? line.trough_angle ?? 35,
    f: coeff.f ?? 0.023,
    C: coeff.C ?? 1.3,
    L_m,
    qRO: coeff.qRO ?? 29.1,
    qRU: coeff.qRU ?? 10,
    qB: coeff.qB ?? 47.6,
    qG,
    FS1_N: coeff.FS1_N ?? line.FS1_N ?? 0,
    FS2_N: coeff.FS2_N ?? line.FS2_N ?? 0,
    eta: coeff.eta ?? 0.88,
    g: coeff.g ?? 9.81,
    e_mu_phi: coeff.e_mu_phi ?? 3.4,
    S1min_anchor_N: coeff.S1min_anchor_N,
    S_carry_sag_N: coeff.S_carry_sag_N,
    S_return_sag_N: coeff.S_return_sag_N,
    S22_N: coeff.S22_N ?? 0,
    power_split: coeff.power_split || line.power_split || "1:1",
  };
}

/** 一站式：path → extract → calcInput */
export function pathToCalcBundle(path, coeff = {}) {
  const extract = extractGeometryFromPath(path);
  const calc_input = buildCalcInputFromExtract(path, extract, coeff);
  return {
    schema: "pidm.bundle.v0",
    direction: "web_calc",
    path,
    extract,
    calc_input,
  };
}
