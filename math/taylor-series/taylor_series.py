"""Taylor series visualisation
(IB Maths AA HL, first assessment 2021 - AHL 5.19: Maclaurin series).

Idea: a Maclaurin polynomial is the "best possible" polynomial copy of a
function near x = 0. Adding terms widens the region where the copy is good -
unless the series has a finite radius of convergence, in which case no number
of terms gets past it.

Run:  python taylor_series.py
"""

import math

import matplotlib.pyplot as plt
import numpy as np
from matplotlib.animation import FuncAnimation

# --- the functions, and their Maclaurin series --------------------------------
# Every series here is centred on x = 0 (that is what "Maclaurin" means), so
# there is no centre to choose. Each entry gives the exact function, and
# term(k) -> (coefficient, power) of the k-th NON-ZERO term. sin(x) skips the
# even powers, so its 3rd non-zero term is -x^5/5!, not a zero x^2 term.
#
# radius: how far from 0 the series converges. Infinite for sin, cos and e^x,
# which is why piling on terms keeps widening the good region. For ln(1+x)
# it is 1: the series converges for -1 < x <= 1 and nowhere else, and past
# x = 1 every extra term makes the polynomial *worse*.
SERIES = {
    "sin(x)": dict(
        exact=np.sin,
        term=lambda k: ((-1) ** k / math.factorial(2 * k + 1), 2 * k + 1),
        xlim=(-4 * np.pi, 4 * np.pi), ylim=(-3, 3), radius=math.inf,
    ),
    "cos(x)": dict(
        exact=np.cos,
        term=lambda k: ((-1) ** k / math.factorial(2 * k), 2 * k),
        xlim=(-4 * np.pi, 4 * np.pi), ylim=(-3, 3), radius=math.inf,
    ),
    "e^x": dict(
        exact=np.exp,
        term=lambda k: (1 / math.factorial(k), k),
        xlim=(-6, 6), ylim=(-5, 30), radius=math.inf,
    ),
    "ln(1+x)": dict(
        # ln(1+x) only exists for x > -1; NaN tells matplotlib to leave a gap
        exact=lambda x: np.log1p(np.where(x > -1, x, np.nan)),
        term=lambda k: ((-1) ** k / (k + 1), k + 1),
        xlim=(-2, 3), ylim=(-4, 3), radius=1.0,
    ),
}

FUNCTION = "sin(x)"   # try "cos(x)", "e^x" or "ln(1+x)"
MAX_TERMS = 10


def taylor(x, n_terms, name=FUNCTION):
    """Maclaurin polynomial of SERIES[name] using its first n_terms non-zero terms."""
    total = np.zeros_like(x, dtype=float)
    for k in range(n_terms):
        coefficient, power = SERIES[name]["term"](k)
        total = total + coefficient * x**power
    return total


def main():
    s = SERIES[FUNCTION]
    x = np.linspace(*s["xlim"], 800)
    exact = s["exact"](x)

    fig, ax = plt.subplots(figsize=(9, 5))
    if s["radius"] < math.inf:
        # shade where the series converges, so the boundary is not a guess
        r = s["radius"]
        ax.axvspan(-r, r, color="tab:green", alpha=0.12,
                   label=f"radius of convergence = {r:g}")
        ax.axvline(-r, color="tab:green", ls="--", lw=1)
        ax.axvline(r, color="tab:green", ls="--", lw=1)
    ax.plot(x, exact, color="black", lw=2, label=FUNCTION)
    approx_line, = ax.plot([], [], color="crimson", lw=2, label="Maclaurin polynomial")
    ax.axvline(0, color="grey", ls=":", lw=1)   # every Maclaurin series is centred here

    ax.set_ylim(*s["ylim"])
    ax.set_xlim(x[0], x[-1])
    ax.set_xlabel("x")
    ax.set_ylabel("y")
    ax.legend(loc="upper right")
    ax.grid(alpha=0.3)
    title = ax.set_title("")

    def frame(i):
        n = i + 1
        approx_line.set_data(x, taylor(x, n))
        highest = s["term"](n - 1)[1]
        title.set_text(f"{FUNCTION}: {n} term(s) - polynomial up to x^{highest}")
        return approx_line, title

    anim = FuncAnimation(fig, frame, frames=MAX_TERMS, interval=900, blit=False)
    plt.tight_layout()
    plt.show()
    return anim


if __name__ == "__main__":
    main()
