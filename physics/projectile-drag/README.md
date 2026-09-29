# Projectile motion with air resistance

**Subject:** Physics HL, first assessment 2025 (A.1 Kinematics - projectile
motion, and the qualitative effect of fluid resistance on projectiles)

The syllabus only asks for the effect of drag *qualitatively*. The `k v^2`
model and the step-by-step integration here are beyond it: they are the
machinery that lets you see the qualitative answers rather than memorise them.

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
- `speed` in `main()` - push it to 80 m/s and watch the optimum drop from 40
  to 35 degrees.
- `DRAG_K` - set it to 0 to recover the textbook result: the best angle is
  45 degrees, and the range matches `v^2 sin 2θ / g` to within one step.
- `MASS` - a ping-pong ball vs a cannonball at the same speed.

**Method note:** this steps the motion forward with `DT = 0.001 s` using
*semi-implicit* (symplectic) Euler: each step updates the velocity from the
forces first, then moves the position with that new velocity. (Plain Euler
would move with the old velocity - swap the two pairs of lines and it
becomes that.) Both are first-order methods: the error shrinks in proportion
to `DT`. In a vacuum at 40 m/s and 45 degrees this version lands 0.028 m short
of the exact 163.10 m, which is one step's worth of horizontal travel.
Larger steps drift noticeably - worth trying, since it shows why step size
matters.

The loop stops on the first step that goes below the ground, so the last
point is slightly underground. The landing point is found by interpolating
along the straight line between the last two points to where the height is
exactly zero; that is the range the script reports. The website demo does
exactly the same, with the same `DT`, and finds the same best angle for
every speed and drag setting on its sliders.
