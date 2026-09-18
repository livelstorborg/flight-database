from __future__ import annotations

from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles

from . import flights, wiki
from .config import AVIATIONSTACK_API_KEY

app = FastAPI(title="Flight Database")

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"


@app.get("/api/aircraft")
async def api_aircraft(query: str = Query(..., min_length=2)):
    try:
        title = await wiki.search_title(query)
    except httpx.HTTPError:
        raise HTTPException(502, "Could not reach Wikipedia right now.")

    if not title:
        raise HTTPException(404, f'No aircraft model found matching "{query}".')

    try:
        summary = await wiki.get_summary(title)
        specs = await wiki.get_infobox_specs(title)
    except httpx.HTTPError:
        raise HTTPException(502, "Could not fetch details from Wikipedia.")

    return {"title": title, "summary": summary, "specs": specs}


@app.get("/api/flight")
async def api_flight(number: str = Query(..., min_length=2), date: str | None = None):
    if not AVIATIONSTACK_API_KEY:
        raise HTTPException(
            400,
            "No Aviationstack API key configured yet. "
            "Add AVIATIONSTACK_API_KEY to .env (see README.md).",
        )

    try:
        raw = await flights.get_flight(number, date)
    except flights.AviationstackError as exc:
        raise HTTPException(502, str(exc))
    except httpx.HTTPError:
        raise HTTPException(502, "Could not reach the flight data service.")

    if not raw:
        raise HTTPException(404, f'No flights found for number "{number}".')

    # Aviationstack lists every codeshare of the same physical flight (e.g.
    # searching "BA117" also returns "AA6930" for the same aircraft). Prefer
    # the entry whose own flight number matches what was actually searched.
    target = number.strip().upper()
    match = next(
        (f for f in raw if (f.get("flight") or {}).get("iata", "").upper() == target),
        raw[0],
    )

    return {"flights": [flights.normalize(match)]}


app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
