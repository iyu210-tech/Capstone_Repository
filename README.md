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

## The website

There is a browsable version of this collection in [`docs/`](docs), built to be
served by GitHub Pages:

- a landing page with **search** and subject filters, so you can find a topic by
  typing the question you are stuck on rather than opening every folder;
- an **interactive animation** of each topic that runs in the browser, with
  sliders — no Python needed to get the idea;
- the **full Python source** on each page, with a copy button and a download
  button, plus links to the notebook and to Colab.

### Turning it on

In the repository settings: **Settings → Pages → Source: Deploy from a branch**,
branch `main`, folder `/docs`. The site is then at
`https://iyu210-tech.github.io/Capstone_Repository/`.

### Working on it locally

```
python -m http.server -d docs 8000
```

Then open `http://localhost:8000`.

### Deploying it

The site is static: the build regenerates `docs/topics.js` from the real `.py`
files, and the host serves `docs/`. Three hosts are wired up, and all three
serve the same folder.

| Host | Config | Build | Serves |
|---|---|---|---|
| Vercel | [`vercel.json`](vercel.json) | `python3 build_site.py` | `docs/` as static files |
| Render | [`render.yaml`](render.yaml) | `python build_site.py` | `python server.py` |
| GitHub Pages | repo settings | none | `docs/` on `main` |

On Vercel, [`.vercelignore`](.vercelignore) hides `server.py` and
`requirements.txt`. Without it Vercel sniffs those, decides the repo is a Python
app, and fails the build looking for a WSGI entrypoint that does not exist.

On Render, [`server.py`](server.py) is what runs: a web service has to bind
`$PORT`, and the stock `http.server` defaults are wrong for a deployed site
(localhost-only, no cache headers, `.js` typed as `text/plain` on some images -
which stops a module from executing at all). It is stdlib only, so the build
never installs matplotlib, scipy or jupyter. Note that the free instance sleeps
after 15 minutes idle and takes about 50 seconds to wake.

### Sign-in

Google and email/password sign-in run on Supabase. Nothing on the site is gated
by it - every topic stays free to read and run - so an account only exists to
remember a reader between visits.

The credentials live in [`docs/auth-config.js`](docs/auth-config.js). Both are
public by design: the publishable key is a browser key and reaches every
visitor whichever way it is set. **Row Level Security on every table is what
protects the data, not hiding that key.** The `service_role` / `sb_secret` key
must never appear in `docs/`.

`server.py` can override the file from `SUPABASE_URL` and
`SUPABASE_PUBLISHABLE_KEY`, so Render can point at a different Supabase project
than local does. That only works on Render - Vercel and GitHub Pages serve
`docs/` as plain files, with no process to generate a response, so there the
committed values are what ship.

Each deployed origin has to be registered twice before sign-in works:

1. **Google Cloud -> Credentials -> Authorized JavaScript origins**: add the
   site's origin. The Authorized redirect URI stays the Supabase callback,
   `https://<project-ref>.supabase.co/auth/v1/callback`, on every host.
2. **Supabase -> Authentication -> URL Configuration**: set Site URL, and add
   `<origin>/**` to Redirect URLs.

### After changing any topic

The site does not keep its own copy of the code — `docs/topics.js` is generated
from the real `.py` files, so it can never quietly drift out of date:

```
python build_site.py
```

Run that whenever you edit a script or add a topic, and commit the regenerated
`docs/topics.js`.

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
5. Add an entry to [`topics.json`](topics.json) — that is what feeds the website's
   cards and its search. The `tags` field is worth a minute of thought: it is how
   someone finds your topic when they do not know its name. Write the *questions*
   a stuck student would type, not just the technical term.
6. To give it an animation, add a case to `docs/demos.js` and point the entry's
   `demo` field at it. Skip this and the topic still gets a page, just without
   the interactive panel.
7. Run `python build_site.py`.

Keeping the shape identical every week is what makes the collection browsable
later - and it is what a search or index page would be built on top of.
