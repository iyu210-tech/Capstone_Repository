"""Maxwell-Boltzmann distribution and activation energy
(IB HL Chemistry - Reactivity 2.2 rates of reaction).

Idea: temperature does not shift the whole curve past Ea - it stretches the
tail. A small rise in T multiplies the fraction of molecules above Ea, which is
why rates roughly double per 10 K.

Run:  python maxwell_boltzmann.py
"""

import matplotlib.pyplot as plt
import numpy as np
from scipy import integrate

K_B = 1.380649e-23   # J K^-1
N_A = 6.02214076e23  # mol^-1
MASS = 0.028 / N_A   # kg per molecule (nitrogen, 28 g/mol)

EA_KJ = 50.0                       # activation energy in kJ/mol
EA_J = EA_KJ * 1000 / N_A          # per molecule
V_EA = np.sqrt(2 * EA_J / MASS)    # speed with kinetic energy Ea


def distribution(v, T):
    """Maxwell-Boltzmann speed distribution f(v) for a given temperature."""
    a = MASS / (2 * K_B * T)
    return 4 * np.pi * v**2 * (a / np.pi) ** 1.5 * np.exp(-a * v**2)


def fraction_above_ea(T):
    """Fraction of molecules with kinetic energy of at least Ea."""
    frac, _ = integrate.quad(distribution, V_EA, np.inf, args=(T,))
    return frac


def main():
    v = np.linspace(0, 2500, 1500)
    temperatures = [300, 310, 400, 500]

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 5))

    for T in temperatures:
        f = distribution(v, T)
        ax1.plot(v, f, lw=2, label=f"{T} K")
        ax1.fill_between(v, f, where=(v >= V_EA), alpha=0.25)

    ax1.axvline(V_EA, color="black", ls="--", lw=1.5)
    ax1.annotate(
        f"Ea = {EA_KJ:.0f} kJ/mol",
        xy=(V_EA, ax1.get_ylim()[1] * 0.85),
        xytext=(V_EA + 150, ax1.get_ylim()[1] * 0.85),
        fontsize=9,
    )
    ax1.set_xlabel("molecular speed / m s^-1")
    ax1.set_ylabel("fraction of molecules (per unit speed)")
    ax1.set_title("Maxwell-Boltzmann distribution for N2")
    ax1.legend()
    ax1.grid(alpha=0.3)

    # right panel: how the shaded fraction grows with temperature
    temps = np.arange(250, 601, 5)
    fractions = np.array([fraction_above_ea(T) for T in temps])
    ax2.semilogy(temps, fractions, lw=2, color="crimson")
    ax2.set_xlabel("temperature / K")
    ax2.set_ylabel("fraction with E >= Ea (log scale)")
    ax2.set_title("Why 10 K matters")
    ax2.grid(alpha=0.3, which="both")

    f300, f310 = fraction_above_ea(300), fraction_above_ea(310)
    print(f"Fraction above Ea at 300 K: {f300:.3e}")
    print(f"Fraction above Ea at 310 K: {f310:.3e}")
    print(f"Ratio for a 10 K rise:      {f310 / f300:.2f}x")

    plt.tight_layout()
    plt.show()


if __name__ == "__main__":
    main()
