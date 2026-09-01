"""Taylor series visualisation (IB HL Maths AA - Option/AHL: Maclaurin series).

Idea: a Taylor polynomial is the "best possible" polynomial copy of a function
near one point. Adding terms widens the region where the copy is good.

Run:  python taylor_series.py
"""

import math

import matplotlib.pyplot as plt
import numpy as np
from matplotlib.animation import FuncAnimation

# --- the function we approximate, and its Maclaurin coefficients -------------
# sin(x) = x - x^3/3! + x^5/5! - ...
CENTRE = 0.0
MAX_TERMS = 10


def taylor_sin(x, n_terms):
    """Maclaurin polynomial of sin(x) using n_terms non-zero terms."""
    total = np.zeros_like(x)
    for k in range(n_terms):
        power = 2 * k + 1
        total = total + ((-1) ** k) * x**power / math.factorial(power)
    return total


def main():
    x = np.linspace(-4 * np.pi, 4 * np.pi, 800)
    exact = np.sin(x)

    fig, ax = plt.subplots(figsize=(9, 5))
    ax.plot(x, exact, color="black", lw=2, label="sin(x)")
    approx_line, = ax.plot([], [], color="crimson", lw=2, label="Taylor polynomial")
    ax.axvline(CENTRE, color="grey", ls=":", lw=1)

    ax.set_ylim(-3, 3)
    ax.set_xlim(x[0], x[-1])
    ax.set_xlabel("x")
    ax.set_ylabel("y")
    ax.legend(loc="upper right")
    ax.grid(alpha=0.3)
    title = ax.set_title("")

    def frame(i):
        n = i + 1
        approx_line.set_data(x, taylor_sin(x, n))
        highest = 2 * n - 1
        title.set_text(f"{n} term(s) - polynomial up to x^{highest}")
        return approx_line, title

    anim = FuncAnimation(fig, frame, frames=MAX_TERMS, interval=900, blit=False)
    plt.tight_layout()
    plt.show()
    return anim


if __name__ == "__main__":
    main()
