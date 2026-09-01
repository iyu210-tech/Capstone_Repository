"""Projectile motion with air resistance (IB HL Physics - Topic A.1 / B).

Idea: the textbook parabola assumes no drag. With a drag force proportional to
v^2 the range shrinks, the path becomes asymmetric, and the optimal launch
angle drops below 45 degrees.

Run:  python projectile_drag.py
"""

import matplotlib.pyplot as plt
import numpy as np

G = 9.81          # m s^-2
MASS = 0.145      # kg  (a baseball)
DRAG_K = 0.0013   # drag coefficient lumped: F_drag = k * v^2, in N s^2 m^-2
DT = 0.001        # s


def simulate(speed, angle_deg, drag_k):
    """Euler integration of the trajectory until the projectile lands."""
    theta = np.radians(angle_deg)
    vx, vy = speed * np.cos(theta), speed * np.sin(theta)
    x, y = 0.0, 0.0
    xs, ys = [x], [y]

    while y >= 0.0:
        v = np.hypot(vx, vy)
        # drag acts opposite to velocity, magnitude k*v^2
        ax = -drag_k * v * vx / MASS
        ay = -G - drag_k * v * vy / MASS
        vx += ax * DT
        vy += ay * DT
        x += vx * DT
        y += vy * DT
        xs.append(x)
        ys.append(y)

    return np.array(xs), np.array(ys)


def best_angle(speed, drag_k):
    """Scan launch angles and return the one giving the greatest range."""
    angles = np.arange(10, 81, 1)
    ranges = [simulate(speed, a, drag_k)[0][-1] for a in angles]
    return angles[int(np.argmax(ranges))], angles, np.array(ranges)


def main():
    speed = 40.0  # m/s

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 5))

    # left panel: trajectories at several angles, with and without drag
    for angle in (30, 45, 60):
        x, y = simulate(speed, angle, DRAG_K)
        ax1.plot(x, y, lw=2, label=f"{angle} deg (with drag)")
        x0, y0 = simulate(speed, angle, 0.0)
        ax1.plot(x0, y0, lw=1, ls="--", alpha=0.6, label=f"{angle} deg (vacuum)")

    ax1.set_xlabel("horizontal distance / m")
    ax1.set_ylabel("height / m")
    ax1.set_title(f"Trajectories at {speed:.0f} m/s")
    ax1.legend(fontsize=8)
    ax1.grid(alpha=0.3)
    ax1.set_ylim(bottom=0)

    # right panel: range vs angle, showing the optimum shifting below 45 deg
    opt_drag, angles, ranges_drag = best_angle(speed, DRAG_K)
    opt_vac, _, ranges_vac = best_angle(speed, 0.0)

    ax2.plot(angles, ranges_vac, ls="--", label=f"vacuum (best {opt_vac} deg)")
    ax2.plot(angles, ranges_drag, lw=2, label=f"with drag (best {opt_drag} deg)")
    ax2.axvline(45, color="grey", ls=":", lw=1)
    ax2.set_xlabel("launch angle / degrees")
    ax2.set_ylabel("range / m")
    ax2.set_title("Range vs launch angle")
    ax2.legend()
    ax2.grid(alpha=0.3)

    plt.tight_layout()
    plt.show()


if __name__ == "__main__":
    main()
