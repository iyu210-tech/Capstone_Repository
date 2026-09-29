# Electron orbitals — shapes, fill order, metals

**Subject:** Chemistry HL, first assessment 2025 (Structure 1.3.4 — sublevels,
and the shapes of s and p orbitals; Structure 1.3.5 — Aufbau, Hund and Pauli
for atoms and ions up to Z = 36, with Cr and Cu as exceptions)

**The hard bit:** linking orbital *pictures* to a written configuration —
especially once the d-block starts, Cr / Cu refuse the naive Aufbau answer,
and ions lose their electrons in a different order from the one they went in.

**What this shows (longer walkthrough):**
1. Shapes of **s**, **pₓ**, **pᵧ**, **p_z**. The axes are right-handed: x to
   the right, y up, z out of the page (drawn down-left).
2. **Pauli**: an orbital holds at most two electrons, and they must have
   opposite spins. **Hund**: orbitals of the same sublevel fill singly, with
   parallel spins, before any electrons pair up.
3. Periodic-table **s / p / d blocks** and the **diagonal Aufbau** fill order
   (lower n + l first; for a tie, lower n first — so 4s before 3d). Only real
   subshells appear: there is no 2d or 3f.
4. Transition-metal configurations, with **Cr** (`[Ar] 4s¹ 3d⁵`) and **Cu**
   (`[Ar] 4s¹ 3d¹⁰`) as the exceptions.
5. **Ions lose 4s before 3d.** 4s fills first, but once 3d holds electrons the
   4s electrons are the outermost, so a positive ion loses them first:
   Fe²⁺ is `[Ar] 3d⁶`, not `[Ar] 4s² 3d⁴`. This is a classic exam trap.

**Why Cr and Cu, at IB level:** a half-filled (d⁵) or completely filled (d¹⁰)
d sublevel is especially stable, and 4s and 3d are very close in energy, so
moving one electron from 4s into 3d lowers the energy overall. That sentence
is what an exam answer needs. (Beyond the syllabus: parallel spins in
different orbitals repel each other less — the *exchange energy* behind
Hund's rule — and Cr's 4s¹ 3d⁵ has six parallel spins instead of four. Why a
full d¹⁰ wins for Cu is subtler still.) Heavier atoms have more exceptions
(Mo, Ag, Au, ...), which IB does not ask for and this does not model.

Configurations are written in fill order (`[Ar] 4s² 3d⁶`); IB also accepts
`[Ar] 3d⁶ 4s²`.

The website page is interactive (click shapes, step the fill order, pick
metals). This script prints the matching static figures.

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
- Add Mn (Z = 25) — Aufbau works: `[Ar] 4s² 3d⁵`, already half-filled.
- Try other ions with `ion_config`: `ion_config(25, 2)` gives Mn²⁺ as
  `[Ar] 3d⁵`, and `ion_config(17, -1)` gives Cl⁻ as `[Ne] 3s² 3p⁶`.
