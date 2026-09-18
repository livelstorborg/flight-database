"""Offline airport coordinate lookup, backed by the `airportsdata` package
(bundled OpenFlights/OurAirports data — no network call, no API key)."""

from __future__ import annotations

import airportsdata

_BY_IATA = airportsdata.load("IATA")
_BY_ICAO = airportsdata.load("ICAO")


def lookup(iata: str | None, icao: str | None) -> dict | None:
    entry = None
    if iata:
        entry = _BY_IATA.get(iata.upper())
    if not entry and icao:
        entry = _BY_ICAO.get(icao.upper())
    if not entry:
        return None
    return {
        "lat": entry["lat"],
        "lon": entry["lon"],
        "city": entry.get("city") or None,
        "country": entry.get("country") or None,
    }
