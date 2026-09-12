/**
 * GC-01 复杂路径几何（图3-8 高炉带式上料机）
 * 单位：m；坐标系：Z_up_right（X 沿机长水平投影，Z 向上）
 *
 * 说明：
 * - 按手册图尺寸还原：Ln=304.88 m，H=57.051 m，δ≈10.4278°
 * - 回程为多滚筒布置（双驱蛇形绕法 + 垂直重锤拉紧），非简单平行 Auto Return
 * - 节点按胶带运行闭环顺序：尾→承载→头→回程设备…→尾
 * - 坐标为工程布置级示意（与简图比例一致），可供编辑器载入后精修
 */

export const GC01_PATH_META = {
  case_id: "GC-01",
  name: "某钢铁厂高炉带式上料机（图3-8）",
  source_figure: "docs/golden-cases/assets/GC-01_fig3-8.jpg",
  Ln_m: 304.88,
  H_m: 57.051,
  delta_deg: 10.4278,
  Q_tph: 1700,
  B_mm: 1400,
  v_mps: 2,
  drive: "dual_drum_four_motor",
  return_style: "complex_multi_pulley",
};

/** 承载线上一点：s = 水平投影 0…Ln */
export function carryPointAt(sHoriz) {
  const Ln = GC01_PATH_META.Ln_m;
  const H = GC01_PATH_META.H_m;
  const s = Math.max(0, Math.min(Ln, sHoriz));
  return {
    x: +s.toFixed(4),
    y: 0,
    z: +((s / Ln) * H).toFixed(4),
  };
}

/**
 * 生成 GC-01 完整闭环节点（含复杂回程）
 * @returns {{nodes: Array, meta: object}}
 */
export function buildGc01ComplexPath() {
  const Ln = GC01_PATH_META.Ln_m;
  const H = GC01_PATH_META.H_m;
  const head = carryPointAt(Ln);
  const tail = carryPointAt(0);

  // 回程基准：承载下方净空（托辊+结构），局部再下绕拉紧
  const retBelow = 1.8;

  const nodes = [];
  const add = (partial) => {
    nodes.push({
      id: partial.id,
      x: partial.x,
      y: partial.y ?? 0,
      z: partial.z,
      type: partial.type || "node",
      label: partial.label,
      branch: partial.branch || "carry",
      strand: partial.branch || "carry",
      mainDrive: !!partial.mainDrive,
      drum_D_mm: partial.drum_D_mm ?? 800,
      pulley_no: partial.pulley_no,
      auto_return: false,
    });
  };

  // ——— 承载：尾(13) → 头(14) ———
  add({
    id: "p13_tail",
    ...tail,
    type: "tail",
    label: "尾滚筒",
    branch: "carry",
    pulley_no: 13,
    drum_D_mm: 1000,
  });
  // 承载中间控制点（便于侧视编辑/插大R）
  add({ id: "c_1", ...carryPointAt(80), type: "node", branch: "carry", label: "承载1" });
  add({ id: "c_2", ...carryPointAt(160), type: "node", branch: "carry", label: "承载2" });
  add({ id: "c_3", ...carryPointAt(240), type: "node", branch: "carry", label: "承载3" });
  add({
    id: "p14_head",
    ...head,
    type: "head",
    label: "头滚筒",
    branch: "carry",
    pulley_no: 14,
    drum_D_mm: 1000,
  });

  // ——— 回程：头附近改向 15–17 ———
  const zHeadRet = head.z - retBelow;
  add({
    id: "p15",
    x: Ln - 2.5,
    z: zHeadRet,
    type: "bend",
    branch: "return",
    label: "改向15",
    pulley_no: 15,
    drum_D_mm: 630,
  });
  add({
    id: "p16",
    x: Ln - 8,
    z: zHeadRet - 1.2,
    type: "bend",
    branch: "return",
    label: "改向16",
    pulley_no: 16,
    drum_D_mm: 630,
  });
  add({
    id: "p17",
    x: Ln - 14,
    z: zHeadRet - 0.4,
    type: "bend",
    branch: "return",
    label: "改向17",
    pulley_no: 17,
    drum_D_mm: 630,
  });

  // 回程斜向至驱动区（约 x=60~75，对应图上 60000/64000 一带）
  add({
    id: "p18",
    x: 200,
    z: carryPointAt(200).z - retBelow,
    type: "bend",
    branch: "return",
    label: "改向18",
    pulley_no: 18,
    drum_D_mm: 630,
  });
  add({
    id: "p19",
    x: 120,
    z: carryPointAt(120).z - retBelow,
    type: "bend",
    branch: "return",
    label: "改向19",
    pulley_no: 19,
    drum_D_mm: 630,
  });
  add({
    id: "p20",
    x: 85,
    z: carryPointAt(85).z - retBelow,
    type: "bend",
    branch: "return",
    label: "改向20",
    pulley_no: 20,
    drum_D_mm: 630,
  });

  // ——— 双滚筒驱动蛇形绕法（图：1/2/3/21/22）———
  // 驱动站约在水平 64 m 附近、低于承载
  const xd = 64;
  const zd = carryPointAt(xd).z - 3.5;
  add({
    id: "p2_drive",
    x: xd + 3.2,
    z: zd + 1.6,
    type: "drive",
    branch: "return",
    label: "传动滚筒2",
    pulley_no: 2,
    mainDrive: true,
    drum_D_mm: 1250,
  });
  add({
    id: "p21",
    x: xd + 1.0,
    z: zd + 0.2,
    type: "bend",
    branch: "return",
    label: "改向21",
    pulley_no: 21,
    drum_D_mm: 800,
  });
  add({
    id: "p22",
    x: xd - 0.8,
    z: zd + 1.4,
    type: "bend",
    branch: "return",
    label: "改向22",
    pulley_no: 22,
    drum_D_mm: 800,
  });
  add({
    id: "p1_drive",
    x: xd - 2.8,
    z: zd + 0.3,
    type: "drive",
    branch: "return",
    label: "传动滚筒1",
    pulley_no: 1,
    mainDrive: false,
    drum_D_mm: 1250,
  });
  add({
    id: "p3",
    x: xd - 4.5,
    z: zd + 1.5,
    type: "bend",
    branch: "return",
    label: "改向3",
    pulley_no: 3,
    drum_D_mm: 800,
  });

  // ——— 垂直重锤拉紧（4–9，Z 形上下绕）———
  // 图示拉紧区约在 60 m 水平附近
  const xt = 58;
  const ztTop = carryPointAt(xt).z - 1.2;
  const ztBot = ztTop - 10.5; // 重锤行程示意
  add({
    id: "p4",
    x: xt + 2.0,
    z: ztTop,
    type: "bend",
    branch: "return",
    label: "拉紧改向4",
    pulley_no: 4,
    drum_D_mm: 630,
  });
  add({
    id: "p5",
    x: xt + 0.6,
    z: ztTop - 0.3,
    type: "bend",
    branch: "return",
    label: "拉紧改向5",
    pulley_no: 5,
    drum_D_mm: 630,
  });
  add({
    id: "p6_takeup",
    x: xt - 0.2,
    z: ztBot,
    type: "takeup",
    branch: "return",
    label: "重锤拉紧6",
    pulley_no: 6,
    drum_D_mm: 800,
    takeup_kind: "gravity",
  });
  add({
    id: "p7",
    x: xt - 1.2,
    z: ztTop - 0.2,
    type: "bend",
    branch: "return",
    label: "拉紧改向7",
    pulley_no: 7,
    drum_D_mm: 630,
  });
  add({
    id: "p8",
    x: xt - 2.4,
    z: ztTop,
    type: "bend",
    branch: "return",
    label: "拉紧改向8",
    pulley_no: 8,
    drum_D_mm: 630,
  });
  add({
    id: "p9",
    x: xt - 3.6,
    z: ztTop - 0.5,
    type: "bend",
    branch: "return",
    label: "拉紧改向9",
    pulley_no: 9,
    drum_D_mm: 630,
  });

  // ——— 尾部回程改向 10–12 → 尾 ———
  add({
    id: "p10",
    x: 28,
    z: carryPointAt(28).z - retBelow,
    type: "bend",
    branch: "return",
    label: "改向10",
    pulley_no: 10,
    drum_D_mm: 630,
  });
  add({
    id: "p11",
    x: 12,
    z: 1.2,
    type: "bend",
    branch: "return",
    label: "改向11",
    pulley_no: 11,
    drum_D_mm: 630,
  });
  add({
    id: "p12",
    x: 3.5,
    z: 0.8,
    type: "bend",
    branch: "return",
    label: "改向12",
    pulley_no: 12,
    drum_D_mm: 800,
  });
  // 闭环回到尾：由 path-schema closed_loop 补闭合段；此处不重复尾点

  const meta = {
    ...GC01_PATH_META,
    closed_loop: true,
    open_path: false,
    return_mode: "advanced",
    carry_count: nodes.filter((n) => n.branch === "carry").length,
    return_count: nodes.filter((n) => n.branch === "return").length,
    pulley_count: nodes.filter((n) => n.pulley_no != null).length,
    note: "复杂回程：双驱蛇形 + 垂直重锤拉紧；请在 Advanced 模式精修",
  };

  return { nodes, meta };
}

// 局部模板已迁至 path-templates.js（P1 主能力）；此处再导出便于样例复用
export {
  buildDualDriveWrapTemplate,
  buildGravityTakeupTemplate,
} from "./path-templates.js";
