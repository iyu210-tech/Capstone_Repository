# Maxwell-Boltzmann distribution and activation energy

**Subject:** Chemistry HL (Reactivity 2.2 - rate of reaction, Arrhenius)

**The hard bit:** the textbook curve is usually drawn once, so the "why does a
10 K rise roughly double the rate?" claim stays a memorised fact. The answer is
that only the *tail* past Ea matters, and the tail is exponentially sensitive
to T while the peak barely moves.

**What this shows:**
- Left: the distribution at several temperatures, with the region past Ea
  shaded. The peak shifts a little; the shaded area changes a lot.
- Right: the shaded fraction plotted against temperature on a log axis - close
  to a straight line, which is the Arrhenius exponential.
- Printed output: the actual ratio for 300 K -> 310 K.

## Run it

Notebook (recommended - explanation and code side by side):
```
pip install numpy scipy matplotlib jupyter
jupyter notebook maxwell_boltzmann.ipynb
```

Or just the figures:
```
python maxwell_boltzmann.py
```

The notebook also opens in VS Code, or in Google Colab with nothing installed.

## Try changing
- `EA_KJ` - a higher barrier makes the temperature sensitivity much stronger.
  This is the same reason catalysts (lower Ea) work.
- `MASS` - compare hydrogen against nitrogen at the same temperature.
