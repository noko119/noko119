"""把本机 DTII 手册 PDF 转成 Markdown，供人工校对后填入 catalogs。"""

from __future__ import annotations

import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUT = ROOT / "catalogs" / "dtII" / "raw"
CONFIG = ROOT / "local" / "handbook.path"


def read_handbook_path() -> Path | None:
    if not CONFIG.exists():
        return None
    text = CONFIG.read_text(encoding="utf-8").strip()
    if not text or text.startswith("#"):
        return None
    return Path(text.splitlines()[0].strip().strip('"'))


def parse_pages(spec: str | None) -> list[int] | None:
    """手册页码从 1 开始，例如 80-95 或 80,81,90。"""
    if not spec:
        return None
    pages: list[int] = []
    for part in spec.split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            a, b = part.split("-", 1)
            start, end = int(a), int(b)
            if start < 1 or end < start:
                raise ValueError(f"页码范围无效: {part}")
            pages.extend(range(start, end + 1))
        else:
            n = int(part)
            if n < 1:
                raise ValueError(f"页码无效: {part}")
            pages.append(n)
    return sorted(set(pages))


def extract_pymupdf(pdf: Path, pages_1based: list[int] | None) -> str:
    import pymupdf4llm

    zero = [p - 1 for p in pages_1based] if pages_1based else None
    return pymupdf4llm.to_markdown(str(pdf), pages=zero)


def extract_markitdown(pdf: Path) -> str:
    from markitdown import MarkItDown

    return MarkItDown().convert(str(pdf)).text_content


def main() -> None:
    p = argparse.ArgumentParser(description="本机手册 PDF → Markdown")
    p.add_argument("--pdf", help="手册 PDF 路径。省略则读 local/handbook.path")
    p.add_argument("--pages", help="只转这些页，例如 80-95。不填则转全书（慢）")
    p.add_argument("--engine", choices=("pymupdf4llm", "markitdown"), default="pymupdf4llm")
    p.add_argument("--out", help="输出 .md 路径")
    args = p.parse_args()

    pdf = Path(args.pdf) if args.pdf else read_handbook_path()
    if pdf is None:
        raise SystemExit(
            "未指定手册。请任选其一：\n"
            "  1) 把 PDF 路径写入 local/handbook.path\n"
            "  2) 加参数 --pdf \"C:\\路径\\手册.pdf\""
        )
    if not pdf.is_file():
        raise SystemExit(f"找不到 PDF: {pdf}")

    pages = parse_pages(args.pages)
    DEFAULT_OUT.mkdir(parents=True, exist_ok=True)
    if args.out:
        out = Path(args.out)
    else:
        suffix = f"_p{pages[0]}-{pages[-1]}" if pages else "_all"
        out = DEFAULT_OUT / f"{pdf.stem}{suffix}.md"

    print(f"手册: {pdf}")
    print(f"引擎: {args.engine}")
    print(f"页码: {args.pages or '全书'}")
    if args.engine == "pymupdf4llm":
        text = extract_pymupdf(pdf, pages)
    else:
        if pages:
            print("说明: markitdown 不支持选页，将转全书。")
        text = extract_markitdown(pdf)

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(text, encoding="utf-8")
    print(f"已写出: {out}")
    print("下一步: 对照原书，把表抄进 catalogs/dtII 下的 csv。不要直接把 md 当计算依据。")


if __name__ == "__main__":
    main()
