"""Does the browser port compute the same numbers as the Python scripts?

The web demos are re-implementations in JavaScript (docs/demos.js), and a
student may trust either one. These tests run the JS maths under node, via
tests/science_harness.mjs, and compare it with the real .py functions at a
grid of inputs. They are skipped cleanly if node is not installed.

Run:  python -m pytest tests
"""

import importlib.util
import json
import shutil
import subprocess
from pathlib import Path

import matplotlib

matplotlib.use("Agg")  # the scripts import pyplot; never open a window

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parent.parent
HARNESS = ROOT / "tests" / "science_harness.mjs"

pytestmark = pytest.mark.skipif(shutil.which("node") is None,
                                reason="node is not installed")


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


def js(calls):
    """Run [(fn, args), ...] in demos.js and return the results, in order."""
    payload = json.dumps([{"fn": fn, "args": list(args)} for fn, args in calls])
    out = subprocess.run(["node", str(HARNESS)], input=payload, capture_output=True,
                         text=True, check=True, cwd=ROOT)
    return json.loads(out.stdout)


def close(a, b, rel):
    return abs(a - b) <= rel * max(1.0, abs(b))


# --- projectile ---------------------------------------------------------------
RANGE_GRID = [(s, a, k) for s in (10, 40, 90) for a in (10, 30, 45, 60, 80)
              for k in (0.0, 0.0013, 0.004)]

# A spread across the sliders, plus settings where the old coarse-step JS
# sweep disagreed with Python by a degree.
BEST_GRID = [(s, k) for s in (10, 40, 90) for k in (0.0, 0.0013, 0.004)] + [
    (10, 0.0013), (25, 0.0027), (22, 0.0035)]


def test_projectile_range_matches():
    got = js([("rangeOnly", g) for g in RANGE_GRID] + [("simulate", g) for g in RANGE_GRID])
    n = len(RANGE_GRID)
    for (s, a, k), r_only, sim in zip(RANGE_GRID, got[:n], got[n:]):
        want = pd.simulate(s, a, k)[0][-1]
        assert close(r_only, want, 1e-12), (s, a, k, r_only, want)
        assert close(sim["range"], want, 1e-12), (s, a, k, sim["range"], want)


def test_projectile_best_angle_matches():
    # the JS search starts from a guess; the answer must not depend on it
    calls = [("bestAngle", (s, k)) for s, k in BEST_GRID]
    calls += [("bestAngle", (s, k, start)) for s, k in BEST_GRID for start in (10, 80)]
    got = js(calls)
    n = len(BEST_GRID)
    for i, (s, k) in enumerate(BEST_GRID):
        want = int(pd.best_angle(s, k)[0])
        assert got[i] == want, (s, k, got[i], want)
        assert got[n + 2 * i] == want and got[n + 2 * i + 1] == want, (s, k)


# --- Taylor -------------------------------------------------------------------
def test_taylor_values_match():
    xs = (-3.0, -0.9, -0.5, 0.0, 0.3, 0.5, 1.0, 2.0, 5.0)
    grid = [(x, n, name) for name in ts.SERIES for n in range(1, ts.MAX_TERMS + 1)
            for x in xs]
    got = js([("taylor", g) for g in grid])
    for (x, n, name), value in zip(grid, got):
        want = float(ts.taylor(np.array(x), n, name))
        assert close(value, want, 1e-12), (name, n, x, value, want)


# --- Maxwell-Boltzmann -------------------------------------------------------
def test_fraction_above_ea_matches():
    grid = [(ea, T) for ea in (10, 25, 50, 80) for T in (250, 300, 310, 400, 600)]
    got = js([("fractionAboveEa", g) for g in grid])
    for (ea, T), value in zip(grid, got):
        want = mb.fraction_above_ea(T, ea)
        # the JS erfc is a fit good to 1.2e-7; the erfc term is the small one
        assert abs(value - want) <= 2e-7 * want, (ea, T, value, want)


def test_distributions_match():
    energies = (0.5, 1.2, 5.0, 20.0, 50.0, 80.0)
    speeds = (100.0, 400.0, 1000.0, 1890.0, 2500.0)
    temps = (250, 300, 600)
    calls = [("mbEnergy", (E, T)) for E in energies for T in temps]
    calls += [("mbDistribution", (v, T, mb.MASS)) for v in speeds for T in temps]
    got = iter(js(calls))
    for E in energies:
        for T in temps:
            assert close(next(got), float(mb.energy_distribution(E, T)), 1e-12)
    for v in speeds:
        for T in temps:
            want = float(mb.speed_distribution(v, T))
            assert abs(next(got) - want) <= 1e-12 * want


# --- orbitals -----------------------------------------------------------------
def test_configurations_match_for_z_1_to_36():
    zs = range(1, 37)
    got = js([("configString", (cfg,)) for cfg in (eo.fill_aufbau(z) for z in zs)]
             + [("fillAufbau", (z, True)) for z in zs]
             + [("fillAufbau", (z, False)) for z in zs])
    strings, configs, naive = got[:36], got[36:72], got[72:]
    for z, s, c, c0 in zip(zs, strings, configs, naive):
        assert s == eo.config_string(eo.fill_aufbau(z)), z
        assert c == eo.fill_aufbau(z), z
        assert c0 == eo.fill_aufbau(z, apply_exception=False), z
    # the two exceptions IB asks for, spelled out
    assert strings[23] == "[Ar] 4s1 3d5"    # Cr
    assert strings[28] == "[Ar] 4s1 3d10"   # Cu


def test_ion_configurations_match():
    ions = [(11, 1), (12, 2), (13, 3), (17, -1), (8, -2), (21, 3), (24, 3),
            (25, 2), (26, 2), (26, 3), (27, 2), (29, 1), (29, 2), (30, 2), (31, 1)]
    got = js([("configString", (eo.ion_config(z, q),)) for z, q in ions]
             + [("ionConfig", (z, q)) for z, q in ions])
    for (z, q), s, cfg in zip(ions, got[:len(ions)], got[len(ions):]):
        assert cfg == eo.ion_config(z, q), (z, q)
        assert s == eo.config_string(eo.ion_config(z, q)), (z, q)
