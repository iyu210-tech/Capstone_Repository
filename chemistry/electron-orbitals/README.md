# Electron orbitals — shapes, fill order, metals

**Subject:** Chemistry HL (Structure 1.3 — atomic structure / orbitals)

**The hard bit:** linking orbital *pictures* to a written configuration —
especially once the d-block starts, and Cr / Cu refuse the naive Aufbau answer.

**What this shows (longer walkthrough):**
1. Shapes of **s**, **pₓ**, **pᵧ**, **p_z**
2. Why each orbital holds at most **two** electrons (Pauli / opposite spins)
3. Periodic-table **s / p / d blocks** and the **diagonal Aufbau** fill order
   (including 4s before 3d)
4. Transition-metal configurations, with **Cr** and **Cu** as the exceptions

The website page is interactive (click shapes, step the fill order, pick metals).
This script prints the matching static figures.

## Run it

```
pip install numpy matplotlib jupyter
jupyter notebook electron_orbitals.ipynb
```

Or:
```
python electron_orbitals.py
```

## Try changing
- In section 4 of the script, swap Cr for Cu (`fill_aufbau(29)`).
- Add Mn (Z = 25) — Aufbau works: `[Ar] 4s² 3d⁵`.
