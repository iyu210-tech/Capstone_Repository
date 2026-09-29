# Maxwell-Boltzmann distribution and activation energy

**Subject:** Chemistry HL, first assessment 2025 (Reactivity 2.2.4 -
activation energy and Maxwell-Boltzmann energy distribution curves; the
Arrhenius equation is AHL Reactivity 2.2.12)

**The hard bit:** the textbook curve is usually drawn once, so the "why does a
10 K rise roughly double the rate?" claim stays a memorised fact. The answer is
that only the *tail* past Ea matters, and the tail is exponentially sensitive
to T while the peak barely moves.

**What this shows:**
- Top left: the curve IB draws - fraction of molecules against **kinetic
  energy** - at several temperatures. Raising T lowers and broadens the peak
  and moves it right, only a little (it sits at RT/2, about 1.2 kJ/mol at
  300 K).
- Top right: the same curves on a log axis, with the region past Ea shaded.
  On a linear axis that region is far too thin to see: Ea = 50 kJ/mol is about
  20 RT at 300 K, well off the right of the top-left plot.
- Bottom left: the speed distribution for N2, for comparison. Its shaded region
  (speeds whose kinetic energy is at least Ea) is the same fraction.
- Bottom right: the shaded fraction plotted against temperature on a log axis.
- Printed output: the actual ratio for 300 K -> 310 K.

**The energy curve is derived, not relabelled.** Each molecule has to land in
matching strips of both plots, so f(E) dE = f(v) dv. With E = ½mv² and
dE = mv dv this gives

  f(E) = 2 √(E/π) (kT)^(-3/2) e^(-E/kT)

(with RT instead of kT when E is per mole). The mass cancels: every gas has
the same energy distribution at a given temperature, which is why IB can draw
one curve without saying which gas it is. The y-axis is a *density* - a
fraction of molecules per kJ mol⁻¹ (or per m s⁻¹ for the speed curve) - so it
is the **area** under the curve, not its height, that counts molecules.

**The fraction past Ea has an exact formula.** With x = Ea / RT, the shaded
area is erfc(√x) + 2√(x/π) e^(-x), so the script uses that rather than
integrating numerically. An earlier version integrated the speed curve with
`scipy.integrate.quad`, which was quietly off by 0.6% at 300 K and 2% at
250 K; the formula is exact, simpler, and needs no scipy.

**How close is "doubles per 10 K"?** For Ea = 50 kJ/mol, going from 300 K
to 310 K multiplies the fraction past Ea by **1.88** (the Arrhenius factor
e^(-Ea/RT) alone gives 1.91). "Roughly doubles" is a rule of thumb for
barriers around 50 kJ/mol near room temperature, not a law: at Ea = 25 kJ/mol
the ratio is 1.36, at 80 kJ/mol it is 2.77.

## Run it

Notebook (recommended - explanation and code side by side):
```
pip install numpy matplotlib jupyter
jupyter notebook maxwell_boltzmann.ipynb
```

Or just the figures:
```
python maxwell_boltzmann.py
```

The notebook also opens in VS Code, or in Google Colab with nothing installed.

## Try changing
- `EA_KJ` - a higher barrier makes the temperature sensitivity much stronger:
  at 80 kJ/mol a 10 K rise multiplies the fraction by 2.77, at 25 kJ/mol only
  by 1.36. This is the same reason catalysts (lower Ea) work.
- `MASS` - compare hydrogen (0.002 / N_A) against nitrogen at the same
  temperature. The speed curve changes completely; the energy curve and the
  fraction past Ea do not change at all.
