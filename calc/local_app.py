"""本机计算入口：检查环境、登记手册、抽页、跑 M1。"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from calc.extract_handbook import CONFIG, extract_pymupdf, parse_pages, read_handbook_path
from calc.m01_capacity import CATALOG, run

PY = Path(r"C:\Users\HP\miniconda3\python.exe")


def ask(prompt: str, default: str | None = None) -> str:
    suffix = f" [{default}]" if default not in (None, "") else ""
    raw = input(f"{prompt}{suffix}: ").strip()
    if not raw and default is not None:
        return default
    return raw


def ask_float(prompt: str, default: float) -> float:
    return float(ask(prompt, str(default)))


def ask_optional_float(prompt: str) -> float | None:
    raw = ask(prompt, "")
    return float(raw) if raw else None


def pause() -> None:
    input("按回车返回菜单...")


def python_exe() -> Path:
    if PY.is_file():
        return PY
    return Path(sys.executable)


def csv_rows(name: str) -> int:
    path = CATALOG / name
    if not path.exists():
        return 0
    lines = [ln for ln in path.read_text(encoding="utf-8-sig").splitlines() if ln.strip()]
    return max(len(lines) - 1, 0)


def check_env() -> None:
    print("---- 本机环境 ----")
    exe = python_exe()
    print(f"Python: {exe}")
    print(f"  存在: {'是' if exe.is_file() or exe.exists() else '否'}")
    pdf = read_handbook_path()
    print(f"手册路径文件: {CONFIG}")
    if pdf is None:
        print("  手册: 未登记")
    else:
        print(f"  手册: {pdf}")
        print(f"  文件存在: {'是' if pdf.is_file() else '否'}")
    print(f"倾斜系数表行数: {csv_rows('incline_factor.csv')}")
    print(f"截面表行数: {csv_rows('trough_section.csv')}")
    print(f"粒度表行数: {csv_rows('lump_limit.csv')}")
    try:
        import pymupdf4llm  # noqa: F401

        print("pymupdf4llm: 已安装")
    except ImportError:
        print("pymupdf4llm: 未安装（菜单里可选安装）")


def install_extract_dep() -> None:
    exe = str(python_exe())
    cmd = [exe, "-m", "pip", "install", "pymupdf4llm", "-i", "https://pypi.org/simple"]
    print("正在安装 pymupdf4llm ...")
    subprocess.check_call(cmd)
    print("安装完成。")


def set_handbook() -> None:
    current = read_handbook_path()
    hint = str(current) if current else r"C:\Users\HP\Desktop\DTII手册.pdf"
    raw = ask("手册 PDF 完整路径", hint).strip().strip('"')
    pdf = Path(raw)
    if not pdf.is_file():
        print(f"找不到文件: {pdf}")
        return
    CONFIG.parent.mkdir(parents=True, exist_ok=True)
    CONFIG.write_text(str(pdf) + "\n", encoding="utf-8")
    print(f"已保存到 {CONFIG}")


def extract_pages() -> None:
    pdf = read_handbook_path()
    if pdf is None or not pdf.is_file():
        print("请先登记手册路径。")
        return
    pages = ask("要转的页码，例如 80-95", "80-95")
    out_dir = CATALOG / "raw"
    out_dir.mkdir(parents=True, exist_ok=True)
    parsed = parse_pages(pages)
    out = out_dir / f"{pdf.stem}_p{parsed[0]}-{parsed[-1]}.md"
    print("正在转换，请稍等...")
    text = extract_pymupdf(pdf, parsed)
    out.write_text(text, encoding="utf-8")
    print(f"已写出: {out}")
    print("请对照原书，把表抄进 catalogs\\dtII 下的 csv。")


def run_m01() -> None:
    print("数字按你的项目填。直接回车则用括号里的默认值。")
    try:
        result = run(
            Q_tph=ask_float("运量 Q (t/h)", 800),
            rho=ask_float("堆积密度 (t/m3)", 1.6),
            v=ask_float("带速 v (m/s)", 2.5),
            incline_deg=ask_float("倾角 (度，上运为正)", 0),
            trough_deg=ask_float("槽角 (度)", 35),
            surcharge_deg=ask_float("运行堆积角 (度)", 20),
            lump_mm=ask_optional_float("最大粒度 mm（可空）"),
        )
    except Exception as exc:
        print(f"计算失败: {exc}")
        return
    print()
    print(result.text())


def main() -> None:
    CONFIG.parent.mkdir(parents=True, exist_ok=True)
    while True:
        print()
        print("======== 皮带机本机计算（第1步：运量-带宽-带速）========")
        print("1. 检查本机环境和手册")
        print("2. 登记本机手册 PDF 路径")
        print("3. 安装抽手册依赖（pymupdf4llm）")
        print("4. 抽取手册指定页为 Markdown")
        print("5. 计算运量 / 所需截面 / 推荐带宽")
        print("0. 退出")
        choice = ask("请选择", "1")
        try:
            if choice == "1":
                check_env()
            elif choice == "2":
                set_handbook()
            elif choice == "3":
                install_extract_dep()
            elif choice == "4":
                extract_pages()
            elif choice == "5":
                run_m01()
            elif choice == "0":
                return
            else:
                print("无效选项。")
        except Exception as exc:
            print(f"出错: {exc}")
        pause()


if __name__ == "__main__":
    main()
