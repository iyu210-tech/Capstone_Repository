"""Orbital types, shapes, fill order, and metal exceptions
(IB HL Chemistry - Structure 1.3 atomic structure / orbitals).

Four ideas, in order:
  1. What s and the three p orbitals look like
  2. Two electrons per orbital (Pauli)
  3. Periodic-table blocks and the diagonal Aufbau fill order
  4. Transition metals — and why Cr / Cu break the naive pattern

The website page is a longer interactive walkthrough of the same material.

Run:  python electron_orbitals.py
"""

import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import numpy as np
from matplotlib.patches import Circle, FancyArrowPatch

ACCENT = "#b4341f"
INK = "#1a1a1a"
SOFT = "#6b6b6b"
P_POS = "#2f6f8f"
P_NEG = "#c47a1a"
D_COLOR = "#c47a1a"

AUFBAU = [
    (1, "s", 2),
    (2, "s", 2), (2, "p", 6),
    (3, "s", 2), (3, "p", 6),
    (4, "s", 2), (3, "d", 10), (4, "p", 6),
    (5, "s", 2), (4, "d", 10), (5, "p", 6),
    (6, "s", 2), (4, "f", 14), (5, "d", 10), (6, "p", 6),
]

EXCEPTIONS = {
    24: {"4s": 1, "3d": 5},   # Cr
    29: {"4s": 1, "3d": 10},  # Cu
}


def fill_aufbau(z, apply_exception=True):
    remaining, config = z, {}
    for n, letter, cap in AUFBAU:
        if remaining <= 0:
            break
        key = f"{n}{letter}"
        take = min(cap, remaining)
        config[key] = take
        remaining -= take
    if apply_exception and z in EXCEPTIONS:
        config.update(EXCEPTIONS[z])
    return config


def config_string(config):
    order = [f"{n}{L}" for n, L, _ in AUFBAU]
    cores = [(2, "[He]"), (10, "[Ne]"), (18, "[Ar]"), (36, "[Kr]")]
    z = sum(config.values())
    core_z, core_label = 0, ""
    for cz, label in cores:
        if z > cz:
            core_z, core_label = cz, label
    if not core_label:
        return " ".join(f"{k}{config[k]}" for k in order if config.get(k))
    core_cfg = fill_aufbau(core_z, apply_exception=False)
    valence = [
        f"{k}{config[k]}"
        for k in order
        if k in config and config[k] != core_cfg.get(k, 0)
    ]
    return f"{core_label} " + " ".join(valence)


def valence_keys(config):
    z = sum(config.values())
    cores = [2, 10, 18, 36]
    core_z = max((c for c in cores if z > c), default=0)
    core_cfg = fill_aufbau(core_z, apply_exception=False) if core_z else {}
    order = [f"{n}{L}" for n, L, _ in AUFBAU]
    return [k for k in order if k in config and config[k] != core_cfg.get(k, 0)]


def occupancy(n_orb, electrons):
    occ = [0] * n_orb
    for e in range(min(electrons, n_orb)):
        occ[e] = 1
    for e in range(n_orb, electrons):
        occ[e - n_orb] = 2
    return occ


# --- drawing helpers -------------------------------------------------------
def _lobe_path(cx, cy, axis, sign, scale):
    """Elongated teardrop lobe: r = R·cos³(φ), pointed at the nucleus."""
    phis = np.linspace(-np.pi / 2, np.pi / 2, 120)
    base = axis + (np.pi if sign < 0 else 0)
    xs, ys = [cx], [cy]
    for phi in phis:
        c = np.cos(phi)
        if c <= 0:
            continue
        r = scale * c**3 * (0.35 + 0.65 * c)
        ang = base + phi
        xs.append(cx + r * np.cos(ang))
        ys.append(cy + r * np.sin(ang))
    xs.append(cx)
    ys.append(cy)
    return np.array(xs), np.array(ys)


def draw_axes(ax, cx, cy, scale=1.15, emphasize=None):
    """Draw x, y, z axes; z runs to the corner of the x–y square."""
    inv = 1 / np.sqrt(2)
    axes = {
        "x": (1.0, 0.0, 1.0),
        "y": (0.0, 1.0, 1.0),
        "z": (inv, inv, np.sqrt(2)),
    }
    for name, (dx, dy, scl) in axes.items():
        hot = name == emphasize
        L = scale * scl * (1.05 if hot else 0.92)
        color = INK if hot else SOFT
        lw = 1.5 if hot else 1.0
        ax.annotate(
            "",
            xy=(cx + dx * L, cy + dy * L),
            xytext=(cx - dx * L * 0.9, cy - dy * L * 0.9),
            arrowprops=dict(arrowstyle="->", color=color, lw=lw),
        )
        ax.text(
            cx + dx * (L + 0.16),
            cy + dy * (L + 0.16),
            name,
            ha="left" if name != "y" else "center",
            va="center" if name == "x" else "bottom",
            fontsize=10,
            fontweight="bold" if hot else "normal",
            color=color,
        )


def draw_s(ax, cx, cy, scale=0.9):
    draw_axes(ax, cx, cy, scale=scale + 0.25)
    ax.add_patch(Circle((cx, cy), scale, facecolor=ACCENT, edgecolor=INK,
                        alpha=0.3, lw=1.4))
    ax.plot(cx, cy, "o", color=INK, ms=4)
    ax.text(cx, cy - scale - 0.35, "s", ha="center", va="top",
            fontsize=12, fontweight="bold", color=INK)


def draw_p(ax, cx, cy, axis_name, label, scale=1.0):
    dirs = {"x": (1.0, 0.0), "y": (0.0, 1.0), "z": (1 / np.sqrt(2), 1 / np.sqrt(2))}
    dx, dy = dirs[axis_name]
    axis_ang = np.arctan2(dy, dx)
    draw_axes(ax, cx, cy, scale=scale + 0.2, emphasize=axis_name)
    lobe_scale = scale * (0.9 if axis_name == "x" else 1.0)
    for sign in (1, -1):
        x, y = _lobe_path(cx, cy, axis_ang, sign, lobe_scale)
        ax.fill(x, y, color=P_POS, alpha=0.4, lw=0)
        ax.plot(x, y, color=INK, lw=1.15)
    ax.plot(cx, cy, "o", color=INK, ms=3)
    ax.text(cx, cy - scale - 0.35, label, ha="center", va="top",
            fontsize=12, fontweight="bold", color=INK)


def draw_orbital_box(ax, x, y, occ, hot=False):
    color = ACCENT if hot else INK
    ax.add_patch(mpatches.Rectangle((x, y), 0.5, 1.1, fill=False,
                                    edgecolor=color, lw=1.5))
    if occ >= 1:
        ax.annotate("", xy=(x + 0.25, y + 0.85), xytext=(x + 0.25, y + 0.2),
                    arrowprops=dict(arrowstyle="->", color=INK, lw=1.3))
    if occ == 2:
        ax.annotate("", xy=(x + 0.25, y + 0.25), xytext=(x + 0.25, y + 0.9),
                    arrowprops=dict(arrowstyle="->", color=SOFT, lw=1.1))


def draw_config_boxes(ax, config, title, highlight=None):
    ax.axis("off")
    ax.set_xlim(0, 11)
    ax.set_ylim(0, 4.2)
    ax.set_title(title, loc="left", fontsize=11)
    present = valence_keys(config)
    x = 0.3
    for key in present:
        n_orb = {"s": 1, "p": 3, "d": 5, "f": 7}[key[1]]
        occ = occupancy(n_orb, config.get(key, 0))
        hot = bool(highlight and key in highlight)
        ax.text(x + n_orb * 0.55 / 2, 3.35, key, ha="center", fontsize=10,
                color=ACCENT if hot else INK,
                fontweight="bold" if hot else "normal")
        for i, n in enumerate(occ):
            draw_orbital_box(ax, x + i * 0.6, 2.0, n, hot=hot)
        x += n_orb * 0.6 + 0.5
    ax.text(0.3, 1.1, config_string(config), fontsize=11, color=INK,
            fontfamily="monospace")


def main():
    fig = plt.figure(figsize=(12, 14))
    gs = fig.add_gridspec(4, 1, height_ratios=[1.1, 0.7, 1.35, 1.2],
                          hspace=0.4)

    # 1. shapes -------------------------------------------------------------
    ax1 = fig.add_subplot(gs[0])
    ax1.set_xlim(-0.5, 12)
    ax1.set_ylim(-1.8, 1.6)
    ax1.set_aspect("equal")
    ax1.axis("off")
    ax1.set_title("1. s and the three p orbitals", loc="left", fontsize=12)
    draw_s(ax1, 1.2, 0.2, scale=0.95)
    draw_p(ax1, 4.0, 0.2, axis_name="x", label=r"$p_x$", scale=1.05)
    draw_p(ax1, 7.0, 0.2, axis_name="y", label=r"$p_y$", scale=1.05)
    draw_p(ax1, 10.0, 0.2, axis_name="z", label=r"$p_z$", scale=1.05)
    ax1.text(6, -1.55,
             "Each orbital holds up to two electrons of opposite spin (↑↓). "
             "A p sublevel = three orbitals → up to 6 electrons.",
             ha="center", fontsize=9, color=SOFT)

    # 2. two electrons ------------------------------------------------------
    ax2 = fig.add_subplot(gs[1])
    ax2.set_xlim(0, 12)
    ax2.set_ylim(0, 3)
    ax2.axis("off")
    ax2.set_title("2. Two electrons per orbital (Pauli)", loc="left", fontsize=12)
    labels = ["empty", "one e⁻ (↑)", "paired (↑↓)"]
    for i, (occ, lab) in enumerate(zip([0, 1, 2], labels)):
        x = 1.5 + i * 3.5
        draw_orbital_box(ax2, x, 1.0, occ)
        ax2.text(x + 0.25, 0.45, lab, ha="center", fontsize=10, color=SOFT)
    ax2.text(6.5, 2.5,
             "At most two electrons in one orbital, opposite spins. "
             "Hund: fill each box once before pairing.",
             ha="center", fontsize=9, color=SOFT)

    # 3. diagonal fill order ------------------------------------------------
    ax3 = fig.add_subplot(gs[2])
    ax3.set_xlim(0, 10)
    ax3.set_ylim(0, 9)
    ax3.axis("off")
    ax3.set_title(
        "3. Diagonal Aufbau order (4s before 3d)",
        loc="left", fontsize=12,
    )

    # rows = n, cols = s,p,d,f
    positions = {}
    for n in range(1, 8):
        for j, letter in enumerate("spdf"):
            key = f"{n}{letter}"
            # only show keys that appear in AUFBAU or common chart
            if n == 1 and letter != "s":
                continue
            if n >= 6 and letter == "f":
                continue
            if n == 7 and letter in "df":
                continue
            positions[key] = (1.2 + j * 1.8, 8.2 - (n - 1) * 1.05)

    for key, (x, y) in positions.items():
        in_order = any(f"{n}{L}" == key for n, L, _ in AUFBAU)
        face = ACCENT if key in ("4s", "3d") else "#fff"
        edge = ACCENT if key in ("4s", "3d") else INK
        ax3.add_patch(mpatches.FancyBboxPatch(
            (x - 0.55, y - 0.32), 1.1, 0.64,
            boxstyle="round,pad=0.02,rounding_size=0.08",
            facecolor=face, edgecolor=edge, lw=1.2,
            alpha=0.15 if key in ("4s", "3d") else 1.0,
        ))
        ax3.text(x, y, key, ha="center", va="center", fontsize=10,
                 fontweight="bold" if key in ("4s", "3d") else "normal",
                 color=ACCENT if key in ("4s", "3d") else INK)

    # diagonal arrows for the teaching rule (down-left)
    diagonals = [
        ["1s"],
        ["2s"],
        ["2p", "3s"],
        ["3p", "4s"],
        ["3d", "4p", "5s"],
        ["4d", "5p", "6s"],
        ["4f", "5d", "6p", "7s"],
    ]
    for group in diagonals:
        pts = [positions[k] for k in group if k in positions]
        for a, b in zip(pts, pts[1:]):
            ax3.add_patch(FancyArrowPatch(
                a, b, arrowstyle="->", mutation_scale=10,
                color=ACCENT, lw=1.0, alpha=0.55,
                connectionstyle="arc3,rad=0.0",
            ))

    order_txt = " → ".join(f"{n}{L}" for n, L, _ in AUFBAU[:8])
    ax3.text(5, 0.45, order_txt + " → …", ha="center", fontsize=9, color=SOFT)
    ax3.text(5, 0.05,
             "Highlighted: 4s fills before 3d — that is why the d-block starts after Ca.",
             ha="center", fontsize=9, color=ACCENT)

    # 4. metals -------------------------------------------------------------
    ax4 = fig.add_subplot(gs[3])
    # reuse as a container of two side panels via inset-like axes
    ax4.axis("off")
    ax4.set_title("4. Transition metals — Fe follows Aufbau; Cr does not",
                  loc="left", fontsize=12)

    ax_fe = fig.add_axes([0.08, 0.04, 0.40, 0.18])
    ax_cr = fig.add_axes([0.55, 0.04, 0.40, 0.18])
    draw_config_boxes(ax_fe, fill_aufbau(26), "Fe (Z=26) — Aufbau works")
    draw_config_boxes(
        ax_cr, fill_aufbau(24),
        "Cr (Z=24) — half-full 3d⁵ preferred",
        highlight={"4s", "3d"},
    )

    print("Fill order (first 8):", " → ".join(f"{n}{L}" for n, L, _ in AUFBAU[:8]))
    print()
    for z, sym, note in [
        (26, "Fe", "typical d-block metal"),
        (24, "Cr", "exception: 4s1 3d5, not 4s2 3d4"),
        (29, "Cu", "exception: 4s1 3d10, not 4s2 3d9"),
        (30, "Zn", "full 3d10 4s2 — no exception"),
    ]:
        print(f"{sym}: {config_string(fill_aufbau(z)):<22}  {note}")

    plt.show()


if __name__ == "__main__":
    main()
