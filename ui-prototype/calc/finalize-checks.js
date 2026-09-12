/**
 * Finalize 剖面检查 + DTⅡ 校核（对标 Belt Analyst Finalize）
 */
import { suggestMinRadius_m } from "./vertical-curve.js";
import { computeWrapAtNode, checkDriveNoSlip, annotateDriveSlipChecks } from "./drum-geometry.js";
import { buildFlightRows, summarizeFlights } from "./flight-model.js";

function drumD(n) {
  return Number(n?.drum_D_mm ?? n?.drum_D_mm ?? 0);
}

function isClosedMeta(meta = {}, input = {}) {
  return !!(meta.closed_loop || meta.closed_loop || input.closed_loop);
}

function curveOptsFromInput(input = {}, flight = {}) {
  return {
    kind: flight.curve_kind,
    v_mps: Number.isFinite(input.v_mps) ? input.v_mps : 2,
    T_N: Number.isFinite(input.T_N) ? input.T_N : undefined,
    qB: Number.isFinite(input.qB) ? input.qB : undefined,
    qG: Number.isFinite(input.qG) ? input.qG : undefined,
    a_idler_m: Number.isFinite(flight.a_idler_m) ? flight.a_idler_m : undefined,
    g: Number.isFinite(input.g) ? input.g : undefined,
  };
}

/**
 * @param {{nodes:Array, returnMeta?:object, flightOverrides?:object, v_mps?:number, closed_loop?:boolean, T_N?:number, qB?:number, qG?:number, mu?:number, S_tight_N?:number, S_slack_N?:number}} input
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
    const sug = suggestMinRadius_m(curveOptsFromInput({ ...input, v_mps: v }, f));
    if (f.R_m < sug.R_min_m) {
      push(
        "FZ_CURVE_RMIN",
        "warn",
        `Flight ${f.id} R=${f.R_m} < 正式 Rmin ${sug.R_min_m}（张力 ${sug.breakdown.R_tension_m} / 速度 ${sug.breakdown.R_velocity_m}` +
          (sug.breakdown.R_sag_m != null ? ` / 下垂 ${sug.breakdown.R_sag_m}` : "") +
          "）"
      );
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

  const slip = annotateDriveSlipChecks(nodes, {
    mu: input.mu,
    S_tight_N: input.S_tight_N,
    S_slack_N: input.S_slack_N,
  });
  for (const it of slip.items) {
    if (!it.ok) {
      push("FZ_NOSLIP", "warn", `驱动 ${it.node_id}：${it.message}`);
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
    slip,
    meta: {
      source: "finalize_profile",
      note: ok ? "Finalize 通过，剖面可锁定" : "Finalize 未通过：请先消除 error",
    },
  };
}

export function checkVerticalCurveDtii(flights, opts = {}) {
  const items = [];
  for (const f of flights || []) {
    if (f.curve_kind !== "convex" && f.curve_kind !== "concave") continue;
    const sug = suggestMinRadius_m(curveOptsFromInput(opts, f));
    items.push({
      flight_id: f.id,
      kind: f.curve_kind,
      R_m: f.R_m,
      R_min_m: sug.R_min_m,
      breakdown: sug.breakdown,
      ok: f.R_m > 0 && f.R_m >= sug.R_min_m,
      note: sug.note,
    });
  }
  return { items, ok: items.length ? items.every((x) => x.ok) : true };
}

export function checkWrapDtii(nodes, opts = {}) {
  const minDrive = Number.isFinite(opts.min_drive_wrap_deg) ? opts.min_drive_wrap_deg : 180;
  const mu = Number.isFinite(opts.mu) ? opts.mu : 0.3;
  const S_tight = Number.isFinite(opts.S_tight_N) ? opts.S_tight_N : undefined;
  const S_slack = Number.isFinite(opts.S_slack_N) ? opts.S_slack_N : undefined;
  const items = [];
  for (let i = 0; i < (nodes || []).length; i++) {
    const n = nodes[i];
    if (n.type !== "drive") continue;
    const w = n.wrap_angle_deg ?? computeWrapAtNode(nodes, i).wrap_angle_deg;
    const wrapOk = w != null && w >= minDrive;
    let slip = null;
    if (Number.isFinite(S_tight) && Number.isFinite(S_slack) && w != null) {
      slip = checkDriveNoSlip({
        wrap_deg: w,
        mu: Number.isFinite(n.mu) ? n.mu : mu,
        S_tight_N: S_tight,
        S_slack_N: S_slack,
      });
    }
    items.push({
      node_id: n.id,
      wrap_angle_deg: w,
      min_deg: minDrive,
      ok: wrapOk && (slip ? slip.ok : true),
      wrap_ok: wrapOk,
      no_slip: slip,
      note: slip
        ? `包角下限 ${minDrive}° + 欧拉不打滑：${slip.message}`
        : "包角几何下限；完整校核请提供 μ、S_tight、S_slack",
    });
  }
  return { items, ok: items.length ? items.every((x) => x.ok) : true };
}
