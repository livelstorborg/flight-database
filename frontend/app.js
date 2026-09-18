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
  resultsEl.innerHTML = data.flights.map(flightCard).join("");
}

function flightCard(f) {
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
    </div>`;
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
