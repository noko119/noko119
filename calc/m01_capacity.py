"""M1: 运量 → 所需截面 → 带宽/带速校核。

公式（DTII / GB/T 17119 通用口径）：
    Q = 3600 * A * v * rho * k
    A_req = Q / (3600 * v * rho * k)

Q: t/h    A: m2    v: m/s    rho: t/m3    k: 倾斜系数（水平为 1）

截面 A、倾斜系数 k、粒度上限必须来自已校对的 catalogs/dtII 表。
表空时只给出 A_req，不推荐带宽。
"""

from __future__ import annotations

import argparse
import csv
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "catalogs" / "dtII"


def _read_csv(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open(encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    return [row for row in rows if any((v or "").strip() for v in row.values())]


def load_speeds() -> list[float]:
    rows = _read_csv(CATALOG / "belt_speed.csv")
    return [float(r["speed_mps"]) for r in rows]


def load_widths() -> list[int]:
    rows = _read_csv(CATALOG / "belt_width.csv")
    return [int(float(r["width_mm"])) for r in rows]


def load_incline_factors() -> list[tuple[float, float]]:
    rows = _read_csv(CATALOG / "incline_factor.csv")
    out = []
    for r in rows:
        if not (r.get("angle_deg") or "").strip() or not (r.get("k") or "").strip():
            continue
        out.append((float(r["angle_deg"]), float(r["k"])))
    return sorted(out, key=lambda x: x[0])


def load_sections() -> list[dict]:
    rows = _read_csv(CATALOG / "trough_section.csv")
    out = []
    for r in rows:
        if not (r.get("width_mm") or "").strip() or not (r.get("A_m2") or "").strip():
            continue
        out.append(
            {
                "width_mm": int(float(r["width_mm"])),
                "trough_deg": float(r["trough_deg"]),
                "surcharge_deg": float(r["surcharge_deg"]),
                "A_m2": float(r["A_m2"]),
                "page": (r.get("page") or "").strip(),
                "source": (r.get("source") or "").strip(),
            }
        )
    return out


def load_lump_limits() -> dict[int, float]:
    rows = _read_csv(CATALOG / "lump_limit.csv")
    out = {}
    for r in rows:
        if not (r.get("width_mm") or "").strip() or not (r.get("max_lump_mm") or "").strip():
            continue
        out[int(float(r["width_mm"]))] = float(r["max_lump_mm"])
    return out


def nearest_speed(v: float, series: list[float] | None = None) -> float:
    series = series or load_speeds()
    if not series:
        raise ValueError("belt_speed.csv 为空")
    return min(series, key=lambda s: (abs(s - v), s))


def incline_k(angle_deg: float, table: list[tuple[float, float]] | None = None) -> float:
    if abs(angle_deg) < 1e-9:
        return 1.0
    table = table if table is not None else load_incline_factors()
    if not table:
        raise ValueError(
            "倾角不为 0，但 catalogs/dtII/incline_factor.csv 还没有校对数据。"
            "请从手册倾斜系数表抄入 angle_deg,k,page。"
        )
    if angle_deg < table[0][0] or angle_deg > table[-1][0]:
        raise ValueError(
            f"倾角 {angle_deg}° 超出已录入倾斜系数表范围 "
            f"{table[0][0]}°～{table[-1][0]}°，拒算。"
        )
    for i, (a, k) in enumerate(table):
        if abs(a - angle_deg) < 1e-9:
            return k
        if a > angle_deg:
            a0, k0 = table[i - 1]
            a1, k1 = a, k
            return k0 + (k1 - k0) * (angle_deg - a0) / (a1 - a0)
    return table[-1][1]


def required_area(Q_tph: float, v_mps: float, rho_tpm3: float, k: float) -> float:
    if Q_tph <= 0 or v_mps <= 0 or rho_tpm3 <= 0 or k <= 0:
        raise ValueError("Q、v、密度、k 必须为正。")
    return Q_tph / (3600.0 * v_mps * rho_tpm3 * k)


def capacity_from_area(A_m2: float, v_mps: float, rho_tpm3: float, k: float) -> float:
    return 3600.0 * A_m2 * v_mps * rho_tpm3 * k


@dataclass
class M01Result:
    Q_tph: float
    v_used: float
    v_nearest_std: float
    rho: float
    incline_deg: float
    k: float
    A_req: float
    trough_deg: float
    surcharge_deg: float
    lump_mm: float | None
    candidates: list[dict]
    notes: list[str]

    def text(self) -> str:
        lines = [
            "M1 运量–带宽–带速",
            f"  Q = {self.Q_tph:g} t/h",
            f"  v = {self.v_used:g} m/s（最近标准带速 {self.v_nearest_std:g} m/s）",
            f"  密度 = {self.rho:g} t/m3",
            f"  倾角 = {self.incline_deg:g}°，k = {self.k:g}",
            f"  所需截面 A_req = {self.A_req:.6f} m2",
            f"  槽角/堆积角 = {self.trough_deg:g}° / {self.surcharge_deg:g}°",
        ]
        if self.lump_mm is not None:
            lines.append(f"  最大粒度 = {self.lump_mm:g} mm")
        if not self.candidates:
            lines.append("  推荐带宽：无（请先按手册填 trough_section.csv）")
        else:
            lines.append("  推荐带宽（A >= A_req，且粒度不超表）：")
            for c in self.candidates:
                page = f"  p.{c['page']}" if c["page"] else ""
                lump = ""
                if c.get("max_lump_mm") is not None:
                    lump = f"，粒度上限 {c['max_lump_mm']:g} mm"
                lines.append(
                    f"    B={c['width_mm']} mm，A={c['A_m2']:.6f} m2，"
                    f"Q_cap={c['Q_cap']:.1f} t/h{lump}{page}"
                )
        for n in self.notes:
            lines.append(f"  说明：{n}")
        return "\n".join(lines)


def run(
    Q_tph: float,
    rho: float,
    v: float,
    incline_deg: float = 0.0,
    trough_deg: float = 35.0,
    surcharge_deg: float = 20.0,
    lump_mm: float | None = None,
    snap_speed: bool = False,
) -> M01Result:
    notes: list[str] = []
    speeds = load_speeds()
    v_std = nearest_speed(v, speeds)
    v_used = v_std if snap_speed else v
    if abs(v_used - v_std) > 1e-9:
        notes.append(f"输入带速不在标准系列，最近为 {v_std:g} m/s。加 --snap-speed 可改用标准带速重算。")

    k = incline_k(incline_deg)
    A_req = required_area(Q_tph, v_used, rho, k)

    sections = [
        s
        for s in load_sections()
        if abs(s["trough_deg"] - trough_deg) < 1e-6
        and abs(s["surcharge_deg"] - surcharge_deg) < 1e-6
    ]
    lump_limits = load_lump_limits()
    if not sections:
        notes.append(
            f"trough_section.csv 中没有槽角 {trough_deg:g}°、堆积角 {surcharge_deg:g}° 的校对行。"
        )

    candidates = []
    for s in sections:
        if s["A_m2"] + 1e-12 < A_req:
            continue
        max_lump = lump_limits.get(s["width_mm"])
        if lump_mm is not None and max_lump is not None and lump_mm > max_lump + 1e-9:
            continue
        if lump_mm is not None and max_lump is None:
            notes.append(f"B={s['width_mm']} 尚未录入粒度上限，未做粒度拒选。")
        candidates.append(
            {
                **s,
                "Q_cap": capacity_from_area(s["A_m2"], v_used, rho, k),
                "max_lump_mm": max_lump,
            }
        )
    candidates.sort(key=lambda c: (c["width_mm"], c["A_m2"]))

    if lump_mm is not None and not lump_limits:
        notes.append("lump_limit.csv 为空，粒度只记录、未参与筛选。")

    return M01Result(
        Q_tph=Q_tph,
        v_used=v_used,
        v_nearest_std=v_std,
        rho=rho,
        incline_deg=incline_deg,
        k=k,
        A_req=A_req,
        trough_deg=trough_deg,
        surcharge_deg=surcharge_deg,
        lump_mm=lump_mm,
        candidates=candidates,
        notes=notes,
    )


def main() -> None:
    p = argparse.ArgumentParser(description="M1 运量–带宽–带速")
    p.add_argument("--Q", dest="Q", type=float, required=True, help="运量 t/h")
    p.add_argument("--rho", type=float, required=True, help="堆积密度 t/m3")
    p.add_argument("--v", type=float, required=True, help="带速 m/s")
    p.add_argument("--incline", type=float, default=0.0, help="倾角 度，上运为正")
    p.add_argument("--trough", type=float, default=35.0, help="托辊槽角 度")
    p.add_argument("--surcharge", type=float, default=20.0, help="物料运行堆积角 度")
    p.add_argument("--lump", type=float, default=None, help="最大粒度 mm")
    p.add_argument("--snap-speed", action="store_true", help="改用最近标准带速再算")
    args = p.parse_args()
    result = run(
        Q_tph=args.Q,
        rho=args.rho,
        v=args.v,
        incline_deg=args.incline,
        trough_deg=args.trough,
        surcharge_deg=args.surcharge,
        lump_mm=args.lump,
        snap_speed=args.snap_speed,
    )
    print(result.text())


if __name__ == "__main__":
    main()
