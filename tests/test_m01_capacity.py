import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from calc.extract_handbook import parse_pages  # noqa: E402
from calc.m01_capacity import (  # noqa: E402
    capacity_from_area,
    nearest_speed,
    required_area,
    run,
)


def test_parse_pages():
    assert parse_pages("80-82") == [80, 81, 82]
    assert parse_pages("80,90") == [80, 90]
    assert parse_pages(None) is None



def test_area_and_capacity_roundtrip():
    Q = 800.0
    v = 2.5
    rho = 1.6
    k = 1.0
    A = required_area(Q, v, rho, k)
    assert abs(capacity_from_area(A, v, rho, k) - Q) < 1e-9


def test_nearest_standard_speed():
    assert nearest_speed(2.4, [0.8, 1.0, 1.25, 1.6, 2.0, 2.5, 3.15]) == 2.5


def test_empty_section_table_gives_area_only():
    r = run(Q_tph=800, rho=1.6, v=2.5, incline_deg=0)
    assert r.A_req > 0
    assert r.k == 1.0
    assert r.candidates == []
    assert any("trough_section.csv" in n for n in r.notes)
