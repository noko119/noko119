/**
 * Flight 段属性模型（对标 Belt Analyst Flight 表）
 */
import { buildSegments } from "../path-schema.js";

function isReturn(n) {
  return !!(n && (n.branch === "return" || n.strand === "return"));
}

/**
 * @param {Array} nodes
 * @param {{closed_loop?:boolean, default_a0?:number, default_aU?:number, flightOverrides?:Record<string,object>}} [opts]
 */
export function buildFlightRows(nodes, opts = {}) {
  const closed = !!(opts.closed_loop || opts.closed_loop);
  const a0 = Number.isFinite(opts.default_a0) ? opts.default_a0 : 1.2;
  const aU = Number.isFinite(opts.default_aU) ? opts.default_aU : 3.0;
  const overrides = opts.flightOverrides || opts.flightOverrides || {};
  const segs = buildSegments(nodes, { closed_loop: closed });
  const byId = new Map(nodes.map((n) => [n.id, n]));

  return segs.map((s, i) => {
    const from = byId.get(s.from_node_id);
    const to = byId.get(s.to_node_id);
    const ov = overrides[s.id] || {};
    const branch =
      ov.branch || s.branch || (isReturn(from) || isReturn(to) ? "return" : "carry");
    const Ln = Math.hypot((to?.x ?? 0) - (from?.x ?? 0), (to?.y ?? 0) - (from?.y ?? 0));
    return {
      id: s.id,
      seq: i + 1,
      from_node_id: s.from_node_id,
      to_node_id: s.to_node_id,
      branch,
      major_id: ov.major_id || s.major_id,
      sub_id: ov.sub_id || s.sub_id,
      L_m: +Number(s.L ?? 0).toFixed(4),
      Ln_m: +Ln.toFixed(4),
      H_m: +Number(s.H ?? 0).toFixed(4),
      delta_deg: +Number(s.delta_deg ?? 0).toFixed(4),
      a_idler_m: ov.a_idler_m ?? s.a_idler ?? (branch === "return" ? aU : a0),
      R_m: ov.R_m ?? s.R ?? null,
      theta_deg: ov.theta_deg ?? s.theta_deg ?? null,
      curve_kind: ov.curve_kind ?? s.curve_kind ?? null,
      paired_flight_id: ov.paired_flight_id ?? null,
      loading: ov.loading ?? branch === "carry",
      classify_status: ov.classify_status || s.classify_status || "draft",
      name: ov.name || s.name_tree || s.id,
    };
  });
}

/** 承载↔回程邻近配对（对标 BA Pair Flights） */
export function pairCarryReturnFlights(flights, maxScore = 20) {
  const next = flights.map((f) => ({ ...f, paired_flight_id: null }));
  const byId = new Map(next.map((f) => [f.id, f]));
  const carry = next.filter((f) => f.branch === "carry");
  const ret = next.filter((f) => f.branch === "return");
  const used = new Set();

  for (const c of carry) {
    let best = null;
    let bestScore = Infinity;
    for (const r of ret) {
      if (used.has(r.id)) continue;
      const lenDiff = Math.abs((c.L_m || 0) - (r.L_m || 0));
      const mirror = Math.abs(c.seq - (flights.length + 1 - r.seq));
      const score = lenDiff + mirror * 0.8;
      if (score < bestScore) {
        bestScore = score;
        best = r;
      }
    }
    if (best && bestScore <= maxScore) {
      used.add(best.id);
      byId.get(c.id).paired_flight_id = best.id;
      byId.get(best.id).paired_flight_id = c.id;
    }
  }

  return {
    flights: next,
    meta: {
      paired_pairs: used.size,
      source: "pair_carry_return",
      note: "承载↔回程按长度/序号邻近配对，可手改",
    },
  };
}

export function flightRowsToOverrides(flights) {
  const o = {};
  for (const f of flights) {
    o[f.id] = {
      branch: f.branch,
      major_id: f.major_id,
      sub_id: f.sub_id,
      a_idler_m: f.a_idler_m,
      R_m: f.R_m,
      theta_deg: f.theta_deg,
      curve_kind: f.curve_kind,
      paired_flight_id: f.paired_flight_id,
      loading: f.loading,
      classify_status: f.classify_status,
      name: f.name,
    };
  }
  return o;
}

export function summarizeFlights(flights) {
  const carry = flights.filter((f) => f.branch === "carry");
  const ret = flights.filter((f) => f.branch === "return");
  const sum = (arr, k) => arr.reduce((s, x) => s + (Number(x[k]) || 0), 0);
  return {
    carry_count: carry.length,
    return_count: ret.length,
    L_carry_m: +sum(carry, "L_m").toFixed(3),
    L_return_m: +sum(ret, "L_m").toFixed(3),
    H_carry_m: +sum(carry, "H_m").toFixed(3),
    paired_pairs: flights.filter((f) => f.paired_flight_id).length / 2,
  };
}
