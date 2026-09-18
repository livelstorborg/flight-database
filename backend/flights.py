"""Flight number -> route lookup via Aviationstack (https://aviationstack.com).

Requires an AVIATIONSTACK_API_KEY in .env — see README.md for how to get a
free one (plain email signup, no credit card, no RapidAPI account needed).
"""

from __future__ import annotations

import httpx

from . import airports
from .config import AVIATIONSTACK_API_KEY, USER_AGENT

BASE_URL = "https://api.aviationstack.com/v1/flights"


class AviationstackError(RuntimeError):
    pass


async def get_flight(number: str, date: str | None = None) -> list[dict]:
    params = {
        "access_key": AVIATIONSTACK_API_KEY,
        "flight_iata": number,
    }
    if date:
        params["flight_date"] = date

    headers = {"User-Agent": USER_AGENT}

    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.get(BASE_URL, params=params, headers=headers)
        resp.raise_for_status()
        body = resp.json()

    if "error" in body:
        # Aviationstack returns HTTP 200 with an "error" object on API-level
        # failures (bad key, rate limit, invalid params, ...).
        raise AviationstackError(body["error"].get("info") or "Unknown error from Aviationstack.")

    return body.get("data") or []


def _time_pair(iso: str | None) -> dict | None:
    if not iso:
        return None
    return {"utc": iso, "local": iso}


def _airport(name: str | None, iata: str | None, icao: str | None) -> dict | None:
    if not (name or iata or icao):
        return None
    coords = airports.lookup(iata, icao) or {}
    return {
        "iata": iata,
        "icao": icao,
        "name": name,
        "city": coords.get("city"),
        "country": coords.get("country"),
        "lat": coords.get("lat"),
        "lon": coords.get("lon"),
    }


def normalize(raw: dict) -> dict:
    departure = raw.get("departure") or {}
    arrival = raw.get("arrival") or {}
    aircraft = raw.get("aircraft") or {}
    airline = raw.get("airline") or {}
    flight = raw.get("flight") or {}

    return {
        "number": flight.get("iata") or flight.get("icao") or raw.get("flight_date"),
        "callsign": flight.get("icao"),
        "status": raw.get("flight_status"),
        "airline": airline.get("name"),
        "aircraft_model": aircraft.get("icao") or aircraft.get("iata"),
        "aircraft_reg": aircraft.get("registration"),
        "departure": {
            "airport": _airport(departure.get("airport"), departure.get("iata"), departure.get("icao")),
            "scheduled": _time_pair(departure.get("scheduled")),
            "revised": _time_pair(departure.get("actual") or departure.get("estimated")),
            "terminal": departure.get("terminal"),
            "gate": departure.get("gate"),
        },
        "arrival": {
            "airport": _airport(arrival.get("airport"), arrival.get("iata"), arrival.get("icao")),
            "scheduled": _time_pair(arrival.get("scheduled")),
            "revised": _time_pair(arrival.get("actual") or arrival.get("estimated")),
            "terminal": arrival.get("terminal"),
            "gate": arrival.get("gate"),
        },
    }
