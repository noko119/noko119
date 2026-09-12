/**
 * Finalize 剖面检查 + DTⅡ 示意校核（对标 Belt Analyst Finalize）
 */
import { suggestMinRadius_m } from "./vertical-curve.js";
import { computeWrapAtNode } from "./drum-geometry.js";
import { buildFlightRows, summarizeFlights } from "./flight-model.js";

function drumD(n) {
  return Number(n?.drum_D_mm ?? n?.drum_D_mm ?? 0);
}

function isClosedMeta(meta = {}, input = {}) {
  return !!(meta.closed_loop || meta.closed_loop || input.closed_loop);
}

/**
 * @param {{nodes:Array, returnMeta?:object, flightOverrides?:object, v_mps?:number, closed_loop?:boolean}} input
 */
export function finalizeProfile(input = {}) {
  const nodes = input.nodes || [];
  const meta = input.returnMeta || {};
  const closed = isClosedMeta(meta, input);
  const flights = buildFlightRows(nodes, {
    closed_loop: closed,
    flightOverrides: input.flightOverrides || {},
  });
  const items = [];
  const push = (code, level, message) => items.push({ code, level, message });

  if (nodes.length < 4) push("FZ_NODES", "error", "Finalize 建议节点数 ≥ 4（含回程）");

  const mains = nodes.filter((n) => n.type === "drive" && (n.mainDrive || n.is_main_drive));
  if (mains.length !== 1) push("FZ_MAIN_DRIVE", "error", `主驱动应为 1，实际 ${mains.length}`);

  for (const d of nodes) {
    if (!["tail", "head", "drive", "bend", "takeup"].includes(d.type)) continue;
    if (!(drumD(d) > 0)) push("FZ_DRUM_D", "error", `滚筒 ${d.id || d.type} 缺少直径 D`);
  }

  const hasReturn = nodes.some((n) => n.branch === "return" || n.strand === "return");
  if (closed && !hasReturn) push("FZ_RETURN", "error", "闭环缺少回程节点（请 Auto Return）");
  else if (!closed) push("FZ_OPEN", "warn", "开式路径：Finalize 仅做局部检查");

  const v = Number.isFinite(input.v_mps) ? input.v_mps : 2;
  for (const f of flights) {
    if (f.curve_kind !== "convex" && f.curve_kind !== "concave") continue;
    if (!(f.R_m > 0)) {
      push("FZ_CURVE_R", "error", `Flight ${f.id} 为曲线但缺少 R`);
      continue;
    }
    const sug = suggestMinRadius_m({ kind: f.curve_kind, v_mps: v });
    if (f.R_m < sug.R_min_m) {
      push("FZ_CURVE_RMIN", "warn", `Flight ${f.id} R=${f.R_m} < 示意 Rmin ${sug.R_min_m}`);
    }
  }

  for (let i = 0; i < flights.length - 1; i++) {
    const a = flights[i];
    const b = flights[i + 1];
    if (!(a.R_m > 0 && b.R_m > 0 && a.curve_kind && b.curve_kind)) continue;
    const ta = a.R_m * Math.tan(((Math.abs(a.delta_deg) || 1) * Math.PI) / 360);
    const tb = b.R_m * Math.tan(((Math.abs(b.delta_deg) || 1) * Math.PI) / 360);
    if (ta + tb > Math.min(a.L_m, b.L_m) * 0.95) {
      push("FZ_CURVE_OVERLAP", "warn", `Flight ${a.id}/${b.id} 曲线切线可能重叠`);
    }
  }

  const unpaired = flights.filter((f) => f.branch === "carry" && !f.paired_flight_id);
  if (closed && unpaired.length) {
    push("FZ_PAIR", "warn", `${unpaired.length} 条承载 Flight 未配对（点「配对航段」）`);
  }

  for (let i = 1; i < nodes.length - 1; i++) {
    const n = nodes[i];
    if (!["drive", "bend", "takeup", "head", "tail"].includes(n.type)) continue;
    const wrap = n.wrap_angle_deg ?? computeWrapAtNode(nodes, i).wrap_angle_deg;
    if (!(wrap > 0)) push("FZ_WRAP", "warn", `节点 ${n.id}（${n.type}）包角未计算`);
    else if (n.type === "drive" && wrap < 180) {
      push("FZ_WRAP_DRIVE", "warn", `驱动 ${n.id} φ≈${Number(wrap).toFixed(1)}°，确认是否需增面`);
    }
  }

  const drafts = flights.filter((f) => f.classify_status !== "confirmed");
  if (drafts.length) push("FZ_CLASSIFY", "warn", `${drafts.length} 条 Flight 仍为 draft`);

  const ok = items.every((i) => i.level !== "error");
  return {
    ok,
    locked: ok,
    items,
    flights: ok ? flights.map((f) => ({ ...f, classify_status: "confirmed" })) : flights,
    summary: summarizeFlights(flights),
    meta: {
      source: "finalize_profile",
      note: ok ? "Finalize 通过，剖面可锁定" : "Finalize 未通过：请先消除 error",
    },
  };
}

export function checkVerticalCurveDtii(flights, opts = {}) {
  const v = Number.isFinite(opts.v_mps) ? opts.v_mps : 2;
  const items = [];
  for (const f of flights || []) {
    if (f.curve_kind !== "convex" && f.curve_kind !== "concave") continue;
    const sug = suggestMinRadius_m({ kind: f.curve_kind, v_mps: v });
    items.push({
      flight_id: f.id,
      kind: f.curve_kind,
      R_m: f.R_m,
      R_min_m: sug.R_min_m,
      ok: f.R_m > 0 && f.R_m >= sug.R_min_m,
      note: sug.note,
    });
  }
  return { items, ok: items.length ? items.every((x) => x.ok) : true };
}

export function checkWrapDtii(nodes, opts = {}) {
  const minDrive = Number.isFinite(opts.min_drive_wrap_deg) ? opts.min_drive_wrap_deg : 180;
  const items = [];
  for (let i = 0; i < (nodes || []).length; i++) {
    const n = nodes[i];
    if (n.type !== "drive") continue;
    const w = n.wrap_angle_deg ?? computeWrapAtNode(nodes, i).wrap_angle_deg;
    items.push({
      node_id: n.id,
      wrap_angle_deg: w,
      min_deg: minDrive,
      ok: w != null && w >= minDrive,
      note: "示意下限，正式设计按 μ、S、e^{μφ} 复核",
    });
  }
  return { items, ok: items.length ? items.every((x) => x.ok) : true };
}
