/**
 * pidm.path.v0 — build export payload + closure checks
 * Spec: docs/PATH_INPUT_FIELD_SCHEMA.md
 */
import { extractGeometryFromPath, segmentGeometry } from "./calc/path-extract.js";
import { checkGeometricLoop } from "./calc/auto-return.js";

const DRUM_TYPES = new Set(["tail", "head", "drive", "bend", "takeup"]);

function isReturnNode(n) {
  return n?.branch === "return" || n?.strand === "return";
}

/** Guess major/sub from geometry between two nodes (draft classify). */
export function classifySegmentDraft(from, to) {
  const g = segmentGeometry(from, to);
  const absD = Math.abs(g.delta_deg);
  const ret = isReturnNode(from) || isReturnNode(to);

  let major_id = ret ? "returnH" : "carryH";
  let sub_id = ret ? "returnH.1" : "carryH.1";
  let branch = ret ? "return" : "carry";

  if (absD < 2) {
    major_id = ret ? "returnH" : "carryH";
    sub_id = ret ? "returnH.1" : "carryH.1";
  } else if (g.delta_deg >= 2) {
    major_id = ret ? "returnI" : "carryI";
    sub_id = ret ? "returnI.1" : "carryI.1";
  } else {
    major_id = ret ? "returnI" : "carryI";
    sub_id = ret ? "returnI.2" : "carryI.2";
  }

  return {
    major_id,
    sub_id,
    branch,
    L: g.L_m,
    delta_deg: g.delta_deg,
    H: g.H_m,
  };
}

/**
 * @param {Array} nodes
 * @param {{closed_loop?: boolean}} [opts]
 */
export function buildSegments(nodes, opts = {}) {
  const segs = [];
  const closed = !!opts.closed_loop;

  const pushSeg = (a, b, idx) => {
    const g = classifySegmentDraft(a, b);
    segs.push({
      id: `seg_${idx}`,
      from_node_id: a.id,
      to_node_id: b.id,
      major_id: g.major_id,
      sub_id: g.sub_id,
      branch: g.branch,
      L: g.L,
      delta_deg: g.delta_deg,
      H: g.H,
      a_idler: null,
      classify_status: "draft",
      extract_status: "empty",
      name_tree: `${String(idx).padStart(2, "0")}_${g.major_id}_${g.sub_id}`,
    });
  };

  for (let i = 0; i < nodes.length - 1; i++) {
    pushSeg(nodes[i], nodes[i + 1], i + 1);
  }
  if (closed && nodes.length >= 3) {
    pushSeg(nodes[nodes.length - 1], nodes[0], segs.length + 1);
  }
  return segs;
}

function isMainDriveNode(n) {
  return !!(n && (n.is_main_drive || n.mainDrive || n.drive_role === "main"));
}

export function buildPointOrder(nodes) {
  const drive =
    nodes.find((n) => n.type === "drive" && isMainDriveNode(n)) ||
    nodes.find((n) => n.type === "drive");
  const leave = drive?.id ?? nodes[0]?.id ?? null;
  const p2 = nodes.find((n) => n.id !== leave)?.id ?? leave;
  return {
    leave_point_node_id: leave,
    manual_p1_node_id: leave,
    manual_p2_node_id: p2,
    direction: "running_dir",
    auto_points: [],
  };
}

export function runClosureChecks(path) {
  const items = [];
  const nodes = path.nodes || [];
  const segs = path.segments || [];
  const po = path.point_order || {};
  const line = path.line || {};
  const push = (code, level, message) => items.push({ code, level, message });

  if (nodes.length < 3) push("CL_NODES_MIN", "error", `节点数 ${nodes.length} < 3`);

  for (const n of nodes) {
    if (![n.x, n.y, n.z].every(Number.isFinite)) {
      push("CL_XYZ_FINITE", "error", `节点 ${n.id} 坐标非有限数`);
    }
  }

  const mains = nodes.filter(
    (n) => n.type === "drive" && (n.is_main_drive || n.mainDrive || n.drive_role === "main")
  );
  if (mains.length !== 1) {
    push("CL_MAIN_DRIVE", "error", `主驱动数量应为 1，实际 ${mains.length}`);
  }

  for (const n of nodes) {
    if (DRUM_TYPES.has(n.type) && !(n.drum_D_mm > 0)) {
      push("CL_DRUM_D", "error", `滚筒节点 ${n.id}（${n.type}）缺少 drum_D_mm`);
    }
  }

  for (const s of segs) {
    if (!s.major_id || !s.sub_id) {
      push("CL_SEG_CLASS", "error", `区段 ${s.id} 未分类`);
    } else if (s.classify_status !== "confirmed") {
      push("CL_SEG_CLASS", "warn", `区段 ${s.id} 分类仍为 draft（演示可继续）`);
    }
    if ((s.major_id === "convex" || s.major_id === "concave") && !(s.R > 0 && s.theta_deg != null)) {
      push("CL_ARC_R", "error", `弧段 ${s.id} 缺少 R/θ`);
    }
    if (s.extract_status === "stale") {
      push("CL_STALE", "warn", `区段 ${s.id} 提取过期`);
    }
  }

  if (!po.leave_point_node_id) {
    push("CL_LEAVE_IS_S1", "error", "未设置奔离点");
  } else if (po.manual_p1_node_id && po.leave_point_node_id !== po.manual_p1_node_id) {
    push("CL_LEAVE_IS_S1", "warn", "奔离点与手定点1不一致（请确认张力 S1 映射）");
  }

  if (!po.manual_p1_node_id || !po.manual_p2_node_id) {
    push("CL_P1_P2", "error", "手定特性点 1/2 未齐");
  }

  const wantClosed = line.open_path === false || line.closed_loop === true;
  if (wantClosed) {
    const geom = checkGeometricLoop(nodes);
    push(geom.code, geom.ok ? "ok" : "error", geom.message);
    if (!segs.some((s) => s.branch === "return")) {
      push("CL_RETURN", "error", "闭环路径缺少回程区段（请执行 Auto Return）");
    }
  } else {
    push("CL_LOOP", "warn", "开式路径（头尾不闭合）已声明/默认允许");
  }

  return { ok: items.filter((i) => i.level === "error").length === 0, items };
}

export function buildPathExport({ nodes, line = {}, modeHint = "3d", returnMeta = null }) {
  const mappedNodes = nodes.map((n, i) => {
    const isDrum = DRUM_TYPES.has(n.type);
    const ret = isReturnNode(n);
    return {
      id: n.id,
      seq: i + 1,
      x: n.x,
      y: n.y,
      z: n.z,
      type: n.type,
      label: n.label || undefined,
      drum_D_mm: n.drum_D_mm ?? (isDrum ? 630 : undefined),
      wrap_angle_deg: n.wrap_angle_deg,
      friction_mu: n.friction_mu,
      drive_role: n.type === "drive" ? (n.mainDrive || n.is_main_drive ? "main" : "aux") : "none",
      is_main_drive: !!(n.mainDrive || n.is_main_drive),
      takeup_kind: n.takeup_kind,
      takeup_travel_m: n.takeup_travel_m,
      sw_block_id: n.sw_block_id,
      branch: ret ? "return" : "carry",
      strand: ret ? "return" : "carry",
      auto_return: !!n.auto_return,
      paired_carry_id: n.paired_carry_id,
    };
  });

  const closed =
    line.open_path === false ||
    line.closed_loop === true ||
    !!(returnMeta && returnMeta.closed_loop);

  const segments = buildSegments(mappedNodes, { closed_loop: closed });
  const point_order = buildPointOrder(mappedNodes);

  const path = {
    schema: "pidm.path.v0",
    modeHint,
    line: {
      line_id: line.line_id || "demo-01",
      name: line.name || "示例坡道",
      Q: line.Q ?? 1700,
      rho: line.rho ?? 1800,
      B: line.B ?? 1400,
      v: line.v ?? 2,
      a0_default: line.a0_default ?? 1.2,
      aU_default: line.aU_default ?? 3.0,
      trough_angle: line.trough_angle ?? 35,
      coord_system: "Z_up_right",
      length_unit: "m",
      open_path: !closed,
      closed_loop: closed,
      return_mode: returnMeta?.return_mode || line.return_mode || (closed ? "auto" : "none"),
      carry_return_offset_m:
        returnMeta?.carry_return_offset_m ?? line.carry_return_offset_m ?? null,
      FS1_N: line.FS1_N,
      FS2_N: line.FS2_N,
      power_split: line.power_split,
    },
    nodes: mappedNodes,
    segments,
    point_order,
    return_meta: returnMeta || undefined,
  };

  const extract = extractGeometryFromPath(path, {
    geometry_version: line.geometry_version || "G-web-1",
  });
  path.extract = extract;
  path.closure = runClosureChecks(path);
  return path;
}
