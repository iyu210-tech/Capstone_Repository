# IB HL Visualisations

Small, self-contained Python programs that make hard IB Higher Level topics
visible. One folder per topic, one runnable script plus a README explaining the
concept and what to change.

Built by Ian Yu (Maths AA HL, Physics HL, Chemistry HL) as an ongoing Capstone
project: each week, pick the topic that was hardest and turn it into something
you can run.

## Topics

| Folder | Subject | Topic |
|---|---|---|
| [`math/taylor-series`](math/taylor-series) | Maths AA HL | Maclaurin series and convergence |
| [`physics/projectile-drag`](physics/projectile-drag) | Physics HL | Projectile motion with air resistance |
| [`chemistry/maxwell-boltzmann`](chemistry/maxwell-boltzmann) | Chemistry HL | Maxwell-Boltzmann and activation energy |

## Two ways to use these

Each topic ships **both** a plain script and a notebook, from the same code.

**Notebook** (`.ipynb`) - read the explanation, run a cell, change a number,
run it again. This is the one to use while learning, and GitHub renders it as a
readable page with the graphs already visible - no install needed to just look.

```
pip install -r requirements.txt
jupyter notebook math/taylor-series/taylor_series.ipynb
```

Or open the file in VS Code, or upload it to
[Google Colab](https://colab.research.google.com) to run it in a browser with
nothing installed at all.

**Script** (`.py`) - one file, run it, get the figures. Better when you just
want the output, or want to import the functions into something else.

```
python math/taylor-series/taylor_series.py
```

Both are standalone: download the single file and it runs.

## Adding a new topic

1. Make a folder `subject/topic-name/`.
2. Add a notebook and a script named after the topic, plus a `README.md` with
   four sections: subject, the hard bit, what this shows, try changing.
3. Run the notebook top to bottom before committing, so the saved outputs match
   the code and GitHub shows the graphs.
4. Add a row to the table above.

Keeping the shape identical every week is what makes the collection browsable
later - and it is what a search or index page would be built on top of.
