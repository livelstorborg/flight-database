"""Aircraft model lookup backed by Wikipedia (summary + image) and a
best-effort parse of the "Infobox aircraft" wikitext template for
structured specs (manufacturer, first flight, capacity, fuel capacity, ...).

This is intentionally a lightweight scraper rather than a full wikitext
parser: it handles the common cases well enough for an MVP and degrades
gracefully (missing fields are simply omitted) when a page's infobox
doesn't follow the usual shape.
"""

from __future__ import annotations

import re
from urllib.parse import quote

import httpx

from .config import USER_AGENT

WIKI_API = "https://en.wikipedia.org/w/api.php"
HEADERS = {"User-Agent": USER_AGENT}

FIELD_MAP = {
    "manufacturer": "Manufacturer",
    "national origin": "Country of origin",
    "first flight": "First flight",
    "introduction": "Introduced",
    "status": "Status",
    "primary user": "Primary user",
    "produced": "Production period",
    "number built": "Number built",
    "capacity": "Capacity",
    "fuel capacity": "Fuel capacity",
    "range": "Range",
    "cruise speed": "Cruise speed",
    "max takeoff weight": "Max takeoff weight (MTOW)",
    "length": "Length",
    "wingspan": "Wingspan",
}

_summary_cache: dict[str, dict] = {}
_spec_cache: dict[str, dict] = {}


async def search_title(query: str) -> str | None:
    """Resolve a free-text query to a canonical Wikipedia page title."""
    for candidate in (query, f"{query} aircraft"):
        params = {
            "action": "opensearch",
            "search": candidate,
            "limit": 1,
            "namespace": 0,
            "format": "json",
        }
        async with httpx.AsyncClient(timeout=15, headers=HEADERS) as client:
            resp = await client.get(WIKI_API, params=params)
            resp.raise_for_status()
            data = resp.json()
        titles = data[1] if len(data) > 1 else []
        if titles:
            return titles[0]
    return None


async def get_summary(title: str) -> dict:
    if title in _summary_cache:
        return _summary_cache[title]
    url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{quote(title)}"
    async with httpx.AsyncClient(timeout=15, headers=HEADERS) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        data = resp.json()
    image = (data.get("originalimage") or data.get("thumbnail") or {}).get("source")
    result = {
        "title": data.get("title") or title,
        "description": data.get("description"),
        "extract": data.get("extract"),
        "image": image,
        "wikipedia_url": (data.get("content_urls") or {}).get("desktop", {}).get("page"),
    }
    _summary_cache[title] = result
    return result


async def get_infobox_specs(title: str) -> dict:
    if title in _spec_cache:
        return _spec_cache[title]
    params = {
        "action": "query",
        "titles": title,
        "prop": "revisions",
        "rvslots": "main",
        "rvprop": "content",
        "format": "json",
        "formatversion": "2",
    }
    async with httpx.AsyncClient(timeout=15, headers=HEADERS) as client:
        resp = await client.get(WIKI_API, params=params)
        resp.raise_for_status()
        data = resp.json()

    pages = (data.get("query") or {}).get("pages") or []
    if not pages or pages[0].get("missing"):
        _spec_cache[title] = {}
        return {}

    revisions = pages[0].get("revisions") or []
    if not revisions:
        _spec_cache[title] = {}
        return {}

    wikitext = revisions[0]["slots"]["main"]["content"]

    merged: dict[str, str] = {}
    for block in _find_infobox_blocks(wikitext):
        merged.update(_parse_params(block))

    result: dict[str, str] = {}
    for key, label in FIELD_MAP.items():
        raw = merged.get(key)
        if raw:
            cleaned = _clean_value(raw)
            if cleaned:
                result[label] = cleaned

    year_match = re.search(r"(19|20)\d{2}", result.get("First flight", ""))
    if year_match:
        result["First flight year"] = year_match.group(0)

    _spec_cache[title] = result
    return result


def _extract_template(text: str, start_idx: int) -> str:
    """Return the full '{{...}}' block starting at start_idx, respecting
    nested templates by brace-depth counting."""
    depth = 0
    i = start_idx
    n = len(text)
    while i < n - 1:
        two = text[i : i + 2]
        if two == "{{":
            depth += 1
            i += 2
            continue
        if two == "}}":
            depth -= 1
            i += 2
            if depth == 0:
                return text[start_idx:i]
            continue
        i += 1
    return text[start_idx:]


def _find_infobox_blocks(wikitext: str) -> list[str]:
    blocks = []
    for m in re.finditer(r"\{\{\s*Infobox aircraft", wikitext, re.IGNORECASE):
        blocks.append(_extract_template(wikitext, m.start()))
    return blocks


def _parse_params(block: str) -> dict[str, str]:
    """Split a '{{Template | key = value | key2 = value2}}' block into a
    dict, splitting only on top-level '|' (i.e. not inside nested {{}} or
    [[]])."""
    inner = block[2:-2] if block.startswith("{{") and block.endswith("}}") else block
    parts: list[str] = []
    current: list[str] = []
    depth_curly = 0
    depth_square = 0
    i = 0
    n = len(inner)
    while i < n:
        two = inner[i : i + 2]
        if two == "{{":
            depth_curly += 1
            current.append(two)
            i += 2
            continue
        if two == "}}":
            depth_curly -= 1
            current.append(two)
            i += 2
            continue
        if two == "[[":
            depth_square += 1
            current.append(two)
            i += 2
            continue
        if two == "]]":
            depth_square -= 1
            current.append(two)
            i += 2
            continue
        ch = inner[i]
        if ch == "|" and depth_curly == 0 and depth_square == 0:
            parts.append("".join(current))
            current = []
            i += 1
            continue
        current.append(ch)
        i += 1
    parts.append("".join(current))

    params: dict[str, str] = {}
    for part in parts[1:]:  # parts[0] is the template name
        if "=" not in part:
            continue
        key, _, value = part.partition("=")
        key = key.strip().lower()
        value = value.strip()
        if key and value:
            params[key] = value
    return params


def _clean_value(value: str) -> str:
    v = value
    v = re.sub(r"<ref[^>]*>.*?</ref>", "", v, flags=re.DOTALL | re.IGNORECASE)
    v = re.sub(r"<ref[^>]*/>", "", v, flags=re.IGNORECASE)
    v = re.sub(r"<!--.*?-->", "", v, flags=re.DOTALL)
    v = re.sub(r"\{\{convert\|([^|}]+)\|([^|}]+)\|[^}]*\}\}", r"\1 \2", v, flags=re.IGNORECASE)
    v = re.sub(r"\{\{nowrap\|([^}]*)\}\}", r"\1", v, flags=re.IGNORECASE)
    v = re.sub(r"\{\{[^{}]*\}\}", "", v)  # drop any remaining simple (non-nested) templates
    # Anything still starting with "{{" is a nested/malformed template (e.g. a
    # {{refn|...{{cite ...}}...}} citation) that the simple regex above can't
    # balance — just cut the value off there rather than leaking raw wikitext.
    v = v.split("{{")[0]
    v = re.sub(r"\[\[[^\]|]*\|([^\]]+)\]\]", r"\1", v)  # [[X|Y]] -> Y
    v = re.sub(r"\[\[([^\]]+)\]\]", r"\1", v)  # [[X]] -> X
    v = re.sub(r"'{2,}", "", v)  # bold/italic markup
    v = re.sub(r"<br\s*/?>", ", ", v, flags=re.IGNORECASE)
    v = re.sub(r"<[^>]+>", "", v)  # remaining html tags
    v = re.sub(r"\s+", " ", v).strip(" ,;")
    return v.strip()
