# Projectile motion with air resistance

**Subject:** Physics HL (Theme A - kinematics and forces)

**The hard bit:** exam questions use the vacuum parabola, so it is easy to
believe 45 degrees is always the best launch angle and that the path is
symmetric. Neither is true once drag is included, and the reason is hard to see
from the algebra (there is no neat closed form).

**What this shows:**
- Left: real trajectories vs the vacuum parabola at 30/45/60 degrees. The drag
  curves fall short and come down more steeply than they went up.
- Right: range against launch angle. The optimum shifts below 45 degrees, and
  the shift grows with launch speed.

## Run it

Notebook (recommended - explanation and code side by side):
```
pip install numpy matplotlib jupyter
jupyter notebook projectile_drag.ipynb
```

Or just the figures:
```
python projectile_drag.py
```

The notebook also opens in VS Code, or in Google Colab with nothing installed.

## Try changing
- `speed` in `main()` - push it to 80 m/s and watch the optimum drop further.
- `DRAG_K` - set it to 0 to recover the textbook result exactly.
- `MASS` - a ping-pong ball vs a cannonball at the same speed.

**Method note:** this uses Euler integration with `DT = 0.001 s`. Larger steps
drift noticeably - worth trying, since it shows why step size matters.
