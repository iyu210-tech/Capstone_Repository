# Taylor / Maclaurin series

**Subject:** Maths AA HL (AHL 5.19 - Maclaurin series)

**The hard bit:** students can compute the coefficients but do not see *why*
adding terms helps, or why the approximation eventually breaks down far from
the centre.

**What this shows:** the polynomial is animated term by term against `sin(x)`.
Each new term "grips" the curve over a wider interval around x = 0, and outside
that interval the polynomial shoots off to infinity - which is exactly what the
radius-of-convergence idea means visually.

## Run it

Notebook (recommended - explanation and code side by side):
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
- `MAX_TERMS` - how many non-zero terms to build up to.
- Swap `taylor_sin` for cos(x), e^x, or ln(1+x) (that last one has a finite
  radius of convergence - the animation makes it obvious).
