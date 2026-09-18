const form = document.getElementById("search-form");
const input = document.getElementById("search-input");
const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");
const tabs = document.querySelectorAll(".tab");

let mode = "aircraft";

const PLACEHOLDERS = {
  aircraft: "e.g. Boeing 737 MAX",
  flight: "e.g. BA117",
};

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    mode = tab.dataset.mode;
    input.placeholder = PLACEHOLDERS[mode];
    input.value = "";
    resultsEl.innerHTML = "";
    statusEl.textContent = "";
  });
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = input.value.trim();
  if (!query) return;

  resultsEl.innerHTML = "";
  statusEl.textContent = "Searching …";
  statusEl.className = "status loading";

  try {
    const url =
      mode === "aircraft"
        ? `/api/aircraft?query=${encodeURIComponent(query)}`
        : `/api/flight?number=${encodeURIComponent(query)}`;

    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.detail || "Something went wrong.");
    }

    statusEl.textContent = "";
    statusEl.className = "status";

    if (mode === "aircraft") {
      renderAircraft(data);
    } else {
      renderFlight(data);
    }
  } catch (err) {
    statusEl.textContent = err.message;
    statusEl.className = "status error";
  }
});

function renderAircraft(data) {
  const { summary, specs } = data;
  const specRows = Object.entries(specs)
    .map(
      ([label, value]) => `
        <div class="spec-row">
          <span class="spec-label">${escapeHtml(label)}</span>
          <span class="spec-value">${escapeHtml(value)}</span>
        </div>`
    )
    .join("");

  resultsEl.innerHTML = `
    <div class="card aircraft-card">
      ${summary.image ? `<img class="aircraft-image" src="${escapeHtml(summary.image)}" alt="${escapeHtml(summary.title)}">` : ""}
      <div class="aircraft-body">
        <h2>${escapeHtml(summary.title)}</h2>
        ${summary.description ? `<p class="description">${escapeHtml(summary.description)}</p>` : ""}
        ${summary.extract ? `<p class="extract">${escapeHtml(summary.extract)}</p>` : ""}
        <div class="specs">
          ${specRows || "<p class='muted'>No structured specifications found for this model.</p>"}
        </div>
        ${summary.wikipedia_url ? `<a class="source-link" href="${escapeHtml(summary.wikipedia_url)}" target="_blank" rel="noopener">Source: Wikipedia</a>` : ""}
      </div>
    </div>`;
}

function renderFlight(data) {
  resultsEl.innerHTML = data.flights.map((f, i) => flightCard(f, i)).join("");
  data.flights.forEach((f, i) => drawRoute(f, `globe-${i}`));
}

function flightCard(f, i) {
  const waypoints = routeWaypoints(f);
  const globeId = `globe-${i}`;

  return `
    <div class="card flight-card">
      <div class="flight-header">
        <span class="airline">${escapeHtml(f.airline || "Unknown airline")}</span>
        <span class="flight-number">${escapeHtml(f.number || "")}</span>
        ${f.status ? `<span class="flight-status">${escapeHtml(f.status)}</span>` : ""}
      </div>
      <div class="route">
        <div class="route-point">
          <div class="airport">${escapeHtml(airportLabel(f.departure.airport))}</div>
          <div class="time">${fmtTime(f.departure.revised || f.departure.scheduled)}</div>
          ${f.departure.terminal ? `<div class="meta">Terminal ${escapeHtml(f.departure.terminal)}${f.departure.gate ? ", gate " + escapeHtml(f.departure.gate) : ""}</div>` : ""}
        </div>
        <div class="route-line">&rarr;</div>
        <div class="route-point">
          <div class="airport">${escapeHtml(airportLabel(f.arrival.airport))}</div>
          <div class="time">${fmtTime(f.arrival.revised || f.arrival.scheduled)}</div>
          ${f.arrival.terminal ? `<div class="meta">Terminal ${escapeHtml(f.arrival.terminal)}${f.arrival.gate ? ", gate " + escapeHtml(f.arrival.gate) : ""}</div>` : ""}
        </div>
      </div>
      ${f.aircraft_model ? `<div class="aircraft-line">Aircraft: ${escapeHtml(f.aircraft_model)}${f.aircraft_reg ? " · reg " + escapeHtml(f.aircraft_reg) : ""}</div>` : ""}
      ${waypoints.length >= 2 ? `<div class="globe-container"><div id="${globeId}" class="globe"></div></div>` : ""}
    </div>`;
}

// Waypoints along the route, in flight order. Aviationstack's flight-status
// endpoint only reports departure + arrival for a given flight number (no
// technical-stop data on the free tier), so this is currently always a
// single [departure, arrival] pair. The rendering below already draws one
// great-circle segment per consecutive waypoint pair, so a future data
// source that reports a layover only needs to add a middle waypoint here —
// no changes needed in drawRoute.
function routeWaypoints(f) {
  const points = [];
  if (f.departure.airport && f.departure.airport.lat != null) {
    points.push({ ...f.departure.airport, role: "departure" });
  }
  if (f.arrival.airport && f.arrival.airport.lat != null) {
    points.push({ ...f.arrival.airport, role: "arrival" });
  }
  return points;
}

function drawRoute(f, elementId) {
  const waypoints = routeWaypoints(f);
  if (waypoints.length < 2 || typeof Plotly === "undefined") return;

  const el = document.getElementById(elementId);
  if (!el) return;

  const segmentTraces = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    const arc = greatCirclePoints(a.lat, a.lon, b.lat, b.lon, 100);
    segmentTraces.push({
      type: "scattergeo",
      mode: "lines",
      lat: arc.map((p) => p[0]),
      lon: arc.map((p) => p[1]),
      line: { color: "#ff4d4d", width: 2, dash: "dot" },
      hoverinfo: "skip",
      showlegend: false,
    });
  }

  const markerTrace = {
    type: "scattergeo",
    mode: "markers+text",
    lat: waypoints.map((w) => w.lat),
    lon: waypoints.map((w) => w.lon),
    text: waypoints.map((w) => w.iata || w.icao || ""),
    textposition: "top center",
    textfont: { color: "#e6e9f2", size: 12 },
    marker: { size: 7, color: "#4da3ff", line: { color: "#0b1020", width: 1 } },
    hoverinfo: "text",
    showlegend: false,
  };

  const midLat = waypoints.reduce((sum, w) => sum + w.lat, 0) / waypoints.length;
  const midLon = waypoints.reduce((sum, w) => sum + w.lon, 0) / waypoints.length;

  Plotly.newPlot(
    el,
    [...segmentTraces, markerTrace],
    {
      geo: {
        projection: { type: "orthographic", rotation: { lon: midLon, lat: midLat } },
        showland: true,
        landcolor: "#1b2340",
        showocean: true,
        oceancolor: "#0b1020",
        showcountries: true,
        countrycolor: "#2a355c",
        showcoastlines: false,
        bgcolor: "rgba(0,0,0,0)",
      },
      paper_bgcolor: "rgba(0,0,0,0)",
      margin: { t: 0, b: 0, l: 0, r: 0 },
    },
    { displayModeBar: false, responsive: true }
  );
}

// Great-circle interpolation (spherical slerp) so the route follows the
// Earth's curvature instead of cutting a straight chord through the globe.
function greatCirclePoints(lat1, lon1, lat2, lon2, n = 100) {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;

  const phi1 = toRad(lat1);
  const lam1 = toRad(lon1);
  const phi2 = toRad(lat2);
  const lam2 = toRad(lon2);

  const d =
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin((phi2 - phi1) / 2) ** 2 +
          Math.cos(phi1) * Math.cos(phi2) * Math.sin((lam2 - lam1) / 2) ** 2
      )
    );

  if (d === 0) return [[lat1, lon1]];

  const points = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(phi1) * Math.cos(lam1) + B * Math.cos(phi2) * Math.cos(lam2);
    const y = A * Math.cos(phi1) * Math.sin(lam1) + B * Math.cos(phi2) * Math.sin(lam2);
    const z = A * Math.sin(phi1) + B * Math.sin(phi2);
    const phi = Math.atan2(z, Math.sqrt(x * x + y * y));
    const lam = Math.atan2(y, x);
    points.push([toDeg(phi), toDeg(lam)]);
  }
  return points;
}

function fmtTime(t) {
  if (!t || !t.local) return "–";
  const d = new Date(t.local);
  if (isNaN(d)) return t.local;
  return d.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

function airportLabel(a) {
  if (!a) return "Unknown";
  const code = a.iata || a.icao || "";
  return `${code ? code + " · " : ""}${a.name || ""}${a.city ? " (" + a.city + ")" : ""}`;
}

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
