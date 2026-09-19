/**
 * DTⅡ 十二大项字典 + Flight 自动分类
 * 口径对齐 docs/DTII_SEGMENT_DICTIONARY.md
 */

export const DTII_MAJORS = [
  { code: "01", major_id: "carryH", major_name: "承载分支水平段", kind: "segment", branch: "carry" },
  { code: "02", major_id: "carryI", major_name: "承载分支倾斜段", kind: "segment", branch: "carry" },
  { code: "03", major_id: "retH", major_name: "回程分支水平段", kind: "segment", branch: "return" },
  { code: "04", major_id: "retI", major_name: "回程分支倾斜段", kind: "segment", branch: "return" },
  { code: "05", major_id: "convex", major_name: "凸弧段", kind: "segment", branch: "both" },
  { code: "06", major_id: "concave", major_name: "凹弧段", kind: "segment", branch: "both" },
  { code: "07", major_id: "load", major_name: "受料段", kind: "segment", branch: "carry" },
  { code: "08", major_id: "unload", major_name: "卸料段", kind: "segment", branch: "carry" },
  { code: "09", major_id: "trans", major_name: "过渡段", kind: "segment", branch: "both" },
  { code: "10", major_id: "drive", major_name: "传动滚筒", kind: "equipment", branch: "na" },
  { code: "11", major_id: "bend", major_name: "改向滚筒", kind: "equipment", branch: "na" },
  { code: "12", major_id: "takeup", major_name: "拉紧滚筒", kind: "equipment", branch: "na" },
];

const BY_ID = Object.fromEntries(DTII_MAJORS.map((m) => [m.major_id, m]));

/** 兼容旧拼写 returnH/returnI → retH/retI */
export function normalizeMajorId(id) {
  if (id === "returnH") return "retH";
  if (id === "returnI") return "retI";
  return id;
}

/**
 * 单段自动分类
 * @param {object} row Flight 行或 {branch,delta_deg,curve_kind,H_m,...}
 * @param {{from?:object, to?:object, seq?:number, carry_count?:number}} [ctx]
 */
export function autoClassifyFlight(row = {}, ctx = {}) {
  const branch = row.branch === "return" ? "return" : "carry";
  const curve =
    row.curve_kind ||
    ctx.from?.curve ||
    ctx.to?.curve ||
    null;
  const delta = Number(row.delta_deg ?? 0);
  const fromType = ctx.from?.type;
  const toType = ctx.to?.type;

  let major_id;
  let sub_id;

  if (curve === "convex") {
    major_id = "convex";
    sub_id = branch === "return" ? "convex.2" : "convex.1";
  } else if (curve === "concave") {
    major_id = "concave";
    sub_id = branch === "return" ? "concave.2" : "concave.1";
  } else if (curve === "horizontal") {
    // 水平弯暂挂过渡段，细分用 trans
    major_id = "trans";
    sub_id = "trans.1";
  } else if (branch === "carry" && (fromType === "tail" || toType === "tail") && Math.abs(delta) < 2) {
    major_id = "load";
    sub_id = "load.1";
  } else if (branch === "carry" && (fromType === "head" || toType === "head") && Math.abs(delta) < 2) {
    major_id = "unload";
    sub_id = "unload.1";
  } else if (Math.abs(delta) < 2) {
    major_id = branch === "return" ? "retH" : "carryH";
    sub_id = `${major_id}.1`;
  } else if (delta >= 2) {
    major_id = branch === "return" ? "retI" : "carryI";
    sub_id = `${major_id}.1`;
  } else {
    major_id = branch === "return" ? "retI" : "carryI";
    sub_id = `${major_id}.2`;
  }

  // 用户已确认则保留（仅补全缺失）
  if (row.classify_status === "confirmed" && row.major_id) {
    const mid = normalizeMajorId(row.major_id);
    return {
      major_id: mid,
      sub_id: row.sub_id || `${mid}.1`,
      major_name: BY_ID[mid]?.major_name || mid,
      classify_status: "confirmed",
      source: "user_confirmed",
    };
  }

  return {
    major_id,
    sub_id,
    major_name: BY_ID[major_id]?.major_name || major_id,
    classify_status: "draft",
    source: "auto_classify",
  };
}

/**
 * 批量分类 Flight 行
 * @param {Array} rows
 * @param {{nodes?:Array}} [opts]
 */
export function classifyFlightRows(rows, opts = {}) {
  const byId = new Map((opts.nodes || []).map((n) => [n.id, n]));
  return (rows || []).map((f) => {
    const cls = autoClassifyFlight(f, {
      from: byId.get(f.from_node_id),
      to: byId.get(f.to_node_id),
      seq: f.seq,
    });
    return {
      ...f,
      major_id: cls.major_id,
      sub_id: cls.sub_id,
      major_name: cls.major_name,
      classify_status: f.classify_status === "confirmed" ? "confirmed" : cls.classify_status,
    };
  });
}

export function getMajor(major_id) {
  return BY_ID[normalizeMajorId(major_id)] || null;
}
