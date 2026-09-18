# Flight Database

Small local web app: search aircraft models (photo + specs from Wikipedia)
or flight numbers (route with departure/arrival, time and date, via
Aviationstack, drawn as a great-circle arc on a globe).

## Usage

```bash
flight-database
```

This starts a local server on `http://127.0.0.1:8000` and opens it in your
browser automatically. Stop it with `Ctrl+C` in the terminal.

## Setup (already done on first install)

```bash
cd ~/Developer/flight-database
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
ln -sf ~/Developer/flight-database/bin/flight-database ~/.local/bin/flight-database
```

The launcher script lives in the repo at `bin/flight-database` and is
symlinked into `~/.local/bin/flight-database`, which is already on `PATH`
via `.zshrc`.

## API key for flight number search

Aircraft model search needs no key (it only uses the public Wikipedia API).

Flight number search uses [Aviationstack](https://aviationstack.com) to fetch
actual departure/arrival times and dates. It's a standalone service (not via
RapidAPI) — plain email signup, no credit card:

1. Create a free account directly at [aviationstack.com/signup/free](https://aviationstack.com/signup/free).
2. After signing up, find your **API Access Key** on the dashboard
   (aviationstack.com/dashboard).
3. Copy `.env.example` to `.env` and paste in the key:

   ```bash
   cp .env.example .env
   open -e .env
   ```

   Edit `.env`:

   ```
   AVIATIONSTACK_API_KEY=your_key_here
   ```

The free plan gives 500 requests/month, plenty for hobby use.

Without a key, aircraft model search works normally, but flight number search
shows an error saying the key is missing.

## What's included so far

- **Aircraft model search**: fetches title, description, image, and a
  best-effort parsed set of specs (manufacturer, first flight, status,
  production period, capacity/fuel capacity when Wikipedia's infobox has
  them) from Wikipedia. Many modern airliner family pages (737 MAX,
  A320neo, ...) put capacity and fuel capacity in prose instead of the
  infobox — those fields are then simply omitted, but the description
  text usually covers it anyway.
- **Flight number search**: shows departure/arrival airport, local time,
  date, terminal/gate where available, plus aircraft type and registration,
  via Aviationstack. The route is also drawn as a red dotted great-circle
  line on a rotatable orthographic globe (airport coordinates come from the
  offline `airportsdata` package, no extra API call or key needed).

  Aviationstack's free-tier flight-status endpoint only reports a single
  departure/arrival pair per flight number — it doesn't expose technical
  stopovers for a given flight number. The route-drawing code is written to
  handle any number of waypoints (it draws one great-circle segment per
  consecutive pair), so a layover only needs a data source that reports the
  intermediate airport; no frontend changes would be needed.

## Structure

```
bin/
  flight-database   CLI launcher, symlinked into ~/.local/bin
backend/
  main.py           FastAPI app, serves the frontend + two API endpoints
  wiki.py           Aircraft model lookup against Wikipedia
  flights.py        Flight number lookup against Aviationstack
  airports.py       Offline IATA/ICAO -> coordinates lookup (airportsdata)
  config.py         Reads .env
frontend/
  index.html, style.css, app.js   Plain HTML/CSS/JS frontend, Plotly.js
                                   (via CDN) for the globe/route view
```
