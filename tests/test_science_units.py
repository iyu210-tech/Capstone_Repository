"""Pure-Python checks that the science in each script is right.

Each test compares a script's function with something known independently:
math.sin, the vacuum range formula, the fact that a probability density
integrates to 1, and so on. No node needed, and main() is never called.

Run:  python -m pytest tests
"""

import importlib.util
import math
from pathlib import Path

import matplotlib

matplotlib.use("Agg")  # the scripts import pyplot; never open a window

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parent.parent


def load(rel):
    """Import a topic script by path, without running main()."""
    path = ROOT / rel
    spec = importlib.util.spec_from_file_location(path.stem, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


pd = load("physics/projectile-drag/projectile_drag.py")
ts = load("math/taylor-series/taylor_series.py")
mb = load("chemistry/maxwell-boltzmann/maxwell_boltzmann.py")
eo = load("chemistry/electron-orbitals/electron_orbitals.py")


def area(x, f):
    """Trapezium rule, so the tests need nothing beyond numpy."""
    return float(np.sum((f[1:] + f[:-1]) / 2 * np.diff(x)))


# --- Taylor -------------------------------------------------------------------
def test_taylor_sin_at_half():
    # 10 terms reach x^19; the next term is 0.5^21 / 21! ~ 1e-26
    assert ts.taylor(np.array(0.5), 10, "sin(x)") == pytest.approx(math.sin(0.5), abs=1e-15)


@pytest.mark.parametrize("name, exact", [("cos(x)", math.cos), ("e^x", math.exp)])
def test_taylor_other_functions_at_half(name, exact):
    assert ts.taylor(np.array(0.5), 10, name) == pytest.approx(exact(0.5), abs=1e-9)


def test_ln_converges_inside_radius_and_diverges_outside():
    # inside |x| < 1: more terms, smaller error
    err = [abs(ts.taylor(np.array(0.5), n, "ln(1+x)") - math.log1p(0.5)) for n in (2, 5, 10)]
    assert err[0] > err[1] > err[2] and err[2] < 1e-4
    # outside: more terms, bigger error - the whole point of the radius
    err = [abs(ts.taylor(np.array(2.0), n, "ln(1+x)") - math.log1p(2.0)) for n in (2, 5, 10)]
    assert err[0] < err[1] < err[2]
    assert ts.SERIES["ln(1+x)"]["radius"] == 1


def test_every_series_is_centred_on_zero():
    for name, s in ts.SERIES.items():
        assert ts.taylor(np.array(0.0), 5, name) == pytest.approx(float(s["exact"](np.array(0.0))))


# --- projectile ---------------------------------------------------------------
@pytest.mark.parametrize("speed, angle", [(10, 45), (40, 30), (40, 45), (90, 60)])
def test_vacuum_range_matches_formula(speed, angle):
    got = pd.simulate(speed, angle, 0.0)[0][-1]
    exact = speed**2 * math.sin(math.radians(2 * angle)) / pd.G
    # semi-implicit Euler lands about one step's horizontal travel short
    assert got == pytest.approx(exact, rel=1e-3)
    assert abs(got - exact) < 1.5 * speed * math.cos(math.radians(angle)) * pd.DT


def test_landing_point_is_on_the_ground():
    xs, ys = pd.simulate(40, 45, pd.DRAG_K)
    assert ys[-1] == 0.0 and ys[-2] > 0.0
    assert xs[-2] < xs[-1]


def test_error_halves_when_the_step_halves(monkeypatch):
    # first-order method: the error is proportional to DT
    exact = 40**2 / pd.G
    e1 = abs(pd.simulate(40, 45, 0.0)[0][-1] - exact)
    monkeypatch.setattr(pd, "DT", pd.DT / 2)
    e2 = abs(pd.simulate(40, 45, 0.0)[0][-1] - exact)
    assert e1 / e2 == pytest.approx(2, rel=0.1)


def test_best_angles():
    assert pd.best_angle(40, 0.0)[0] == 45
    assert pd.best_angle(40, pd.DRAG_K)[0] == 40


# --- Maxwell-Boltzmann -------------------------------------------------------
@pytest.mark.parametrize("T", [250, 300, 600])
def test_energy_distribution_integrates_to_one(T):
    E = np.linspace(0, 400, 400_001)
    assert area(E, mb.energy_distribution(E, T)) == pytest.approx(1, abs=1e-4)


@pytest.mark.parametrize("T", [250, 300, 600])
def test_speed_distribution_integrates_to_one(T):
    v = np.linspace(0, 6000, 600_001)
    assert area(v, mb.speed_distribution(v, T)) == pytest.approx(1, abs=1e-6)


def test_energy_curve_is_the_speed_curve_transformed():
    # f(E) dE = f(v) dv, with E per mole in kJ: dE/dv = m v N_A / 1000
    for v in (300.0, 800.0, 1500.0):
        E = 0.5 * mb.MASS * v**2 * mb.N_A / 1000
        dE_dv = mb.MASS * v * mb.N_A / 1000
        assert mb.energy_distribution(E, 300) * dE_dv == pytest.approx(
            mb.speed_distribution(v, 300), rel=1e-12)


@pytest.mark.parametrize("ea, T", [(10, 300), (50, 300), (50, 310), (80, 250), (80, 600)])
def test_fraction_above_ea_matches_numerical_area(ea, T):
    RT = mb.R * T / 1000
    E = np.linspace(ea, ea + 60 * RT, 600_001)
    assert mb.fraction_above_ea(T, ea) == pytest.approx(area(E, mb.energy_distribution(E, T)), rel=1e-6)


def test_fraction_above_ea_matches_gamma_function():
    special = pytest.importorskip("scipy.special")
    for ea, T in [(10, 300), (50, 300), (80, 250)]:
        x = ea * 1000 / (mb.R * T)
        assert mb.fraction_above_ea(T, ea) == pytest.approx(special.gammaincc(1.5, x), rel=1e-10)


def test_ten_kelvin_ratio():
    # the README's number
    ratio = mb.fraction_above_ea(310) / mb.fraction_above_ea(300)
    assert round(ratio, 2) == 1.88


# --- orbitals -----------------------------------------------------------------
def test_aufbau_order_is_madelung():
    l_of = {"s": 0, "p": 1, "d": 2, "f": 3}
    keys = [(n + l_of[L], n) for n, L, _ in eo.AUFBAU]
    assert keys == sorted(keys)
    assert all(l_of[L] < n for n, L, _ in eo.AUFBAU)          # no 2d, no 3f
    assert all(cap == 2 * (2 * l_of[L] + 1) for _, L, cap in eo.AUFBAU)


@pytest.mark.parametrize("z, want", [
    (1, "1s1"), (2, "1s2"), (7, "[He] 2s2 2p3"), (19, "[Ar] 4s1"),
    (21, "[Ar] 4s2 3d1"), (24, "[Ar] 4s1 3d5"), (25, "[Ar] 4s2 3d5"),
    (26, "[Ar] 4s2 3d6"), (29, "[Ar] 4s1 3d10"), (30, "[Ar] 4s2 3d10"),
    (31, "[Ar] 4s2 3d10 4p1"), (36, "[Ar] 4s2 3d10 4p6"),
])
def test_configurations(z, want):
    cfg = eo.fill_aufbau(z)
    assert sum(cfg.values()) == z
    assert eo.config_string(cfg) == want


@pytest.mark.parametrize("z, q, want", [
    (26, 2, "[Ar] 3d6"), (26, 3, "[Ar] 3d5"), (24, 3, "[Ar] 3d3"),
    (29, 1, "[Ar] 3d10"), (29, 2, "[Ar] 3d9"), (30, 2, "[Ar] 3d10"),
    (25, 2, "[Ar] 3d5"), (31, 1, "[Ar] 4s2 3d10"), (17, -1, "[Ne] 3s2 3p6"),
])
def test_ions_lose_4s_first(z, q, want):
    assert eo.config_string(eo.ion_config(z, q)) == want


def test_hund_fills_singly_before_pairing():
    assert eo.occupancy(3, 3) == [1, 1, 1]
    assert eo.occupancy(5, 6) == [2, 1, 1, 1, 1]
    assert eo.occupancy(5, 10) == [2] * 5
