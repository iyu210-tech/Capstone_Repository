"""Maxwell-Boltzmann distribution and activation energy
(IB Chemistry HL, first assessment 2025 - Reactivity 2.2.4 activation energy).

Idea: temperature does not shift the whole curve past Ea - it stretches the
tail. A small rise in T multiplies the fraction of molecules above Ea: for
Ea = 50 kJ/mol, going from 300 K to 310 K multiplies it by 1.88, which is
where "rates roughly double per 10 K" comes from.

Run:  python maxwell_boltzmann.py
"""

import math

import matplotlib.pyplot as plt
import numpy as np

K_B = 1.380649e-23   # J K^-1
N_A = 6.02214076e23  # mol^-1
R = K_B * N_A        # J K^-1 mol^-1 (8.314)
MASS = 0.028 / N_A   # kg per molecule (nitrogen, 28 g/mol) - speed view only

EA_KJ = 50.0                       # activation energy in kJ/mol
EA_J = EA_KJ * 1000 / N_A          # per molecule
V_EA = np.sqrt(2 * EA_J / MASS)    # speed with kinetic energy Ea


def speed_distribution(v, T):
    """Maxwell-Boltzmann speed distribution f(v), per (m s^-1).

    f(v) dv is the fraction of molecules with speeds between v and v + dv,
    so f(v) itself is a density: a fraction *per unit speed*.
    """
    a = MASS / (2 * K_B * T)
    return 4 * np.pi * v**2 * (a / np.pi) ** 1.5 * np.exp(-a * v**2)


def energy_distribution(E, T):
    """Maxwell-Boltzmann kinetic-energy distribution f(E), per (kJ mol^-1).

    This is the curve IB draws. It is not the speed curve with the axis
    relabelled: the same molecules have to land in matching strips, so
    f(E) dE = f(v) dv with E = m v^2 / 2 and dE = m v dv, which gives

        f(E) = 2 sqrt(E / pi) (kT)^(-3/2) exp(-E / kT)

    Measuring E per mole just swaps kT for RT. The mass has cancelled: every
    gas has the same energy distribution at the same temperature.
    """
    RT = R * T / 1000   # kJ/mol
    return 2 * np.sqrt(E / np.pi) * RT**-1.5 * np.exp(-E / RT)


def fraction_above_ea(T, ea_kj=EA_KJ):
    """Fraction of molecules with kinetic energy of at least Ea.

    This is the shaded area under f(E) from Ea to infinity. Put x = Ea / RT
    and the integral has an exact answer, so no numerical integration is
    needed (the tests check it against one):

        fraction = erfc(sqrt(x)) + 2 sqrt(x / pi) exp(-x)
    """
    x = ea_kj * 1000 / (R * T)
    return math.erfc(math.sqrt(x)) + 2 * math.sqrt(x / math.pi) * math.exp(-x)


def main():
    temperatures = [300, 310, 400, 500]
    fig, ((ax1, ax2), (ax3, ax4)) = plt.subplots(2, 2, figsize=(13, 9))

    # top left: the IB picture - number of molecules against kinetic energy
    E = np.linspace(0, 15, 1500)
    for T in temperatures:
        ax1.plot(E, energy_distribution(E, T), lw=2, label=f"{T} K")
    ax1.set_xlabel("kinetic energy / kJ mol^-1")
    ax1.set_ylabel("fraction of molecules per kJ mol^-1")
    ax1.set_title("Energy distribution (the IB curve)")
    ax1.text(14.5, ax1.get_ylim()[1] * 0.55,
             f"Ea = {EA_KJ:.0f} kJ/mol is far off\nto the right: about "
             f"{EA_KJ * 1000 / (R * 300):.0f} RT at 300 K",
             ha="right", fontsize=9)
    ax1.legend()
    ax1.grid(alpha=0.3)

    # top right: the same curves on a log axis, where the tail past Ea shows
    E = np.linspace(0.01, EA_KJ * 1.3, 1500)
    for T in temperatures:
        f = energy_distribution(E, T)
        ax2.semilogy(E, f, lw=2, label=f"{T} K")
        ax2.fill_between(E, f, 1e-30, where=(E >= EA_KJ), alpha=0.25)
    ax2.axvline(EA_KJ, color="black", ls="--", lw=1.5)
    ax2.text(EA_KJ * 1.01, 1e-3, f"Ea = {EA_KJ:.0f} kJ/mol", fontsize=9)
    ax2.set_ylim(1e-14, 1)
    ax2.set_xlabel("kinetic energy / kJ mol^-1")
    ax2.set_ylabel("fraction per kJ mol^-1 (log scale)")
    ax2.set_title("Same curves, log axis: the shaded tail past Ea")
    ax2.legend(loc="lower left")
    ax2.grid(alpha=0.3, which="both")

    # bottom left: the speed distribution for N2, which does depend on mass
    v = np.linspace(0, 2500, 1500)
    for T in temperatures:
        f = speed_distribution(v, T)
        ax3.plot(v, f, lw=2, label=f"{T} K")
        ax3.fill_between(v, f, where=(v >= V_EA), alpha=0.25)
    ax3.axvline(V_EA, color="black", ls="--", lw=1.5)
    ax3.text(V_EA - 30, ax3.get_ylim()[1] * 0.85,
             f"speed with KE = Ea\n({V_EA:.0f} m/s)", ha="right", fontsize=9)
    ax3.set_xlabel("molecular speed / m s^-1")
    ax3.set_ylabel("fraction of molecules per m s^-1")
    ax3.set_title("Speed distribution for N2")
    ax3.legend(loc="center", bbox_to_anchor=(0.72, 0.5))
    ax3.grid(alpha=0.3)

    # bottom right: how the shaded fraction grows with temperature
    temps = np.arange(250, 601, 5)
    fractions = np.array([fraction_above_ea(T) for T in temps])
    ax4.semilogy(temps, fractions, lw=2, color="crimson")
    ax4.set_xlabel("temperature / K")
    ax4.set_ylabel("fraction with E >= Ea (log scale)")
    ax4.set_title("Why 10 K matters")
    ax4.grid(alpha=0.3, which="both")

    f300, f310 = fraction_above_ea(300), fraction_above_ea(310)
    print(f"Fraction above Ea at 300 K: {f300:.3e}")
    print(f"Fraction above Ea at 310 K: {f310:.3e}")
    print(f"Ratio for a 10 K rise:      {f310 / f300:.2f}x")

    plt.tight_layout()
    plt.show()


if __name__ == "__main__":
    main()
