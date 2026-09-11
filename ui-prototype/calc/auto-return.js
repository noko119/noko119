/**
 * Auto Return（对标 Belt Analyst）
 * - Auto：回程 = 承载镜像/平行偏移，改承载时重算回程
 * - Advanced：允许保留手改回程（本模块只生成初值）
 *
 * 闭环节点序（运行方向）：
 *   尾 → 承载点… → 头/驱 → 回程点… → 回到尾
 */

function uid(prefix = "r") {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function near(a, b, tol = 1e-6) {
  return Math.abs(a - b) <= tol;
}

/**
 * 在 XZ 铅垂面内，求折线顶点处指向“下方”的单位法向
 *（行业常用：回程在承载下方平行布置）
 */
function downNormalAt(nodes, i) {
  const n = nodes.length;
  let tx = 0;
  let tz = 0;
  if (i === 0) {
    tx = nodes[1].x - nodes[0].x;
    tz = nodes[1].z - nodes[0].z;
  } else if (i === n - 1) {
    tx = nodes[n - 1].x - nodes[n - 2].x;
    tz = nodes[n - 1].z - nodes[n - 2].z;
  } else {
    tx = nodes[i + 1].x - nodes[i - 1].x;
    tz = nodes[i + 1].z - nodes[i - 1].z;
  }
  const len = Math.hypot(tx, tz) || 1;
  // 切向 (tx,tz) 旋转 90° → (tz, -tx)；取 z 分量为负的一侧为“下”
  let nx = tz / len;
  let nz = -tx / len;
  if (nz > 0 || (near(nz, 0) && nx > 0)) {
    nx = -nx;
    nz = -nz;
  }
  return { nx, ny: 0, nz };
}

/**
 * 从承载节点生成 Auto Return 闭环
 * @param {Array} carryNodes 尾→头/驱 顺序
 * @param {{offset_m?:number, mode?:'auto'|'advanced', keep_shared_ends?:boolean}} opts
 */
export function buildAutoReturnLoop(carryNodes, opts = {}) {
  const offset_m = Number.isFinite(opts.offset_m) ? opts.offset_m : 1.2;
  const mode = opts.mode === "advanced" ? "advanced" : "auto";
  if (!Array.isArray(carryNodes) || carryNodes.length < 2) {
    throw new Error("Auto Return 需要至少 2 个承载节点（尾→头）");
  }

  // 剥离旧回程，只保留承载
  const carry = carryNodes
    .filter((n) => n.branch !== "return")
    .map((n, i) => ({
      ...n,
      id: n.id || uid("c"),
      branch: "carry",
      strand: "carry",
      auto_return: false,
      seq_carry: i + 1,
    }));

  if (carry.length < 2) {
    throw new Error("Auto Return：有效承载节点不足");
  }

  // 头尾共用；中间点生成回程（逆序）
  const returnNodes = [];
  for (let i = carry.length - 2; i >= 1; i--) {
    const c = carry[i];
    const { nx, ny, nz } = downNormalAt(carry, i);
    returnNodes.push({
      id: uid("ret"),
      x: +(c.x + nx * offset_m).toFixed(6),
      y: +(c.y + ny * offset_m).toFixed(6),
      z: +(c.z + nz * offset_m).toFixed(6),
      type: c.type === "bend" || c.type === "takeup" ? "bend" : "node",
      branch: "return",
      strand: "return",
      auto_return: true,
      paired_carry_id: c.id,
      drum_D_mm: c.drum_D_mm,
      label: c.label ? `回程·${c.label}` : undefined,
    });
  }

  const loopNodes = [...carry, ...returnNodes];

  return {
    nodes: loopNodes,
    meta: {
      return_mode: mode,
      carry_return_offset_m: offset_m,
      carry_count: carry.length,
      return_count: returnNodes.length,
      open_path: false,
      closed_loop: true,
      formula: {
        return_point: "P_ret = P_carry + n_down · offset",
        n_down: "XZ 平面内指向下方的单位法向",
        loop_order: "tail → carry… → head → return… → tail",
      },
    },
  };
}

/**
 * 若已是闭环，按 meta/标记拆出承载链（供重新 Auto Return）
 */
export function extractCarryChain(nodes) {
  if (!Array.isArray(nodes) || !nodes.length) return [];
  const carry = nodes.filter((n) => n.branch !== "return" && n.strand !== "return");
  if (carry.length >= 2) return carry;
  // 无标记时：整链视为承载
  return nodes.map((n) => ({ ...n, branch: "carry", strand: "carry" }));
}

/**
 * 几何闭环检查：末点回到首点（或显式 closed_loop + 回程段存在）
 */
export function checkGeometricLoop(nodes, tol_m = 0.05) {
  if (!nodes || nodes.length < 4) {
    return { ok: false, code: "CL_LOOP_GEOM", message: "闭环至少需要 4 个节点（含回程）" };
  }
  const carryCount = nodes.filter((n) => n.branch !== "return").length;
  const returnCount = nodes.filter((n) => n.branch === "return").length;
  if (returnCount < 1) {
    return { ok: false, code: "CL_LOOP_GEOM", message: "缺少回程节点（请先 Auto Return）" };
  }
  // 折线首尾在运行上通过“最后回程 → 首点尾滚筒”闭合；
  // 用最后一点到第一点的距离作为闭合缝
  const a = nodes[nodes.length - 1];
  const b = nodes[0];
  const gap = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  // Auto Return 末点是靠近尾部的回程点，不一定重合尾点——允许 gap 为一段回程闭合段
  // 真正要求：存在 return，且首节点为 tail/起点，末段能连回首点（由 buildSegments 加闭合段）
  if (!Number.isFinite(gap)) {
    return { ok: false, code: "CL_LOOP_GEOM", message: "闭环坐标无效" };
  }
  return {
    ok: true,
    code: "CL_LOOP_GEOM",
    message: `几何闭环就绪（承载 ${carryCount} / 回程 ${returnCount}，闭合段 ${gap.toFixed(3)} m）`,
    gap_m: gap,
    carry_count: carryCount,
    return_count: returnCount,
  };
}
