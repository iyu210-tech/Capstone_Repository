# Taylor / Maclaurin series

**Subject:** Maths AA HL, first assessment 2021 (AHL 5.19 - Maclaurin series)

**The hard bit:** students can compute the coefficients but do not see *why*
adding terms helps, or why the approximation eventually breaks down far from
x = 0.

**What this shows:** the polynomial is animated term by term against the real
function. Each new term "grips" the curve over a wider interval around x = 0,
and outside that interval the polynomial shoots off to infinity. For sin, cos
and e^x the interval keeps growing with more terms. For ln(1+x) it never gets
past x = 1, however many terms you add - which is exactly what a radius of
convergence means, visually.

AA HL treats Maclaurin series informally: the interval of convergence is not
examined, and the formula booklet does not list one. It is still the reason a
series like ln(1+x) = x - x²/2 + x³/3 - ... is only useful for small x, and it
takes one line to see it here.

**Why everything is centred on 0:** a Maclaurin series *is* a Taylor series
about x = 0, and that is the only kind AHL 5.19 asks for. An earlier version
had a `CENTRE` constant that only moved a dotted line, not the expansion, so
it has gone rather than pretend to do something.

## Run it

Notebook (recommended - explanation and code side by side, and the saved copy
shows the 1, 2, 4 and 8-term pictures even on GitHub):
```
pip install numpy matplotlib jupyter
jupyter notebook taylor_series.ipynb
```

Or just the figures:
```
python taylor_series.py
```

The notebook also opens in VS Code, or in Google Colab with nothing installed.

## Try changing
- `FUNCTION` - one line: `"sin(x)"`, `"cos(x)"`, `"e^x"` or `"ln(1+x)"`.
  The last one has radius of convergence 1 (it converges for -1 < x <= 1); the
  shaded band shows where, and past x = 1 more terms make things worse.
- `MAX_TERMS` - how many non-zero terms to build up to.
- Add your own entry to `SERIES`, e.g. the geometric series
  1/(1-x) = 1 + x + x² + ... (`term=lambda k: (1, k)`, `radius=1`).
