// Plateau-Mont-Royal bounding box (south, west, north, east)
const BOUNDS = "45.510,-73.600,45.545,-73.555";

const OVERPASS_QUERY = `[out:json][timeout:30];
(
  way["amenity"="parking"]["parking"!="street_side"]["parking"!="on_street"]["parking"!="lane"]
    ["access"!="private"]["access"!="residents"]["access"!="no"](${BOUNDS});
  node["amenity"="parking"]["parking"!="street_side"]["parking"!="on_street"]["parking"!="lane"]
    ["access"!="private"]["access"!="residents"]["access"!="no"](${BOUNDS});
);
out center tags;`;

const CYCLING_QUERY = `[out:json][timeout:30];
(
  way["highway"="cycleway"](${BOUNDS});
  way["cycleway"~"lane|track|shared_lane"](${BOUNDS});
);
out geom;`;

// ── State ──────────────────────────────────────────────────────────────────
let allParkings = [];
let userCoords = null;
let activeFilter = "tous";
const markers = {};
let selectedParking = null;
let proximityCircles = [];
let cyclingLayer = null;

const STYLE_CYCLING_DEFAULT   = { color: "#16a34a", weight: 2.5, opacity: 0.3,  dashArray: "6 4" };
const STYLE_CYCLING_HIGHLIGHT = { color: "#16a34a", weight: 4.5, opacity: 0.95, dashArray: null };
const STYLE_CYCLING_DIM       = { color: "#16a34a", weight: 1,   opacity: 0.06, dashArray: "6 4" };

// ── Map ────────────────────────────────────────────────────────────────────
const map = L.map("map").setView([45.5245, -73.5757], 14);

L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
  attribution: '© <a href="https://www.openstreetmap.org/copyright">OSM</a> · <a href="https://carto.com">CARTO</a>',
  maxZoom: 19,
}).addTo(map);

// ── OSM processing ─────────────────────────────────────────────────────────
function classifyFee(tags) {
  if (tags.fee === "yes") return "payant";
  if (tags.fee === "no") return tags.access === "customers" ? "mixte" : "gratuit";
  return "inconnu";
}

function buildName(tags, id) {
  if (tags.name) return tags.name;
  if (tags.operator) return `Stationnement ${tags.operator}`;
  const street = tags["addr:street"];
  const num = tags["addr:housenumber"];
  if (street) return num ? `${num} ${street}` : street;
  const typeLabel = { surface: "extérieur", underground: "souterrain", "multi-storey": "étagé" };
  const label = typeLabel[tags.parking] || "";
  return ("Stationnement " + label).trim();
}

function buildAddress(tags) {
  const num = tags["addr:housenumber"] || "";
  const street = tags["addr:street"] || "";
  if (num && street) return `${num} ${street}`;
  if (street) return street;
  return null;
}

function parkingTypeLabel(tags) {
  return { surface: "Extérieur", underground: "Souterrain", "multi-storey": "Étagé" }[tags.parking] || null;
}

function processElement(e) {
  const tags = e.tags || {};
  const lat = e.lat ?? e.center?.lat;
  const lon = e.lon ?? e.center?.lon;
  if (!lat || !lon) return null;

  return {
    id: e.id,
    nom: buildName(tags, e.id),
    adresse: buildAddress(tags),
    type: classifyFee(tags),
    tarif: tags.fee === "yes" ? (tags["charge"] || "Payant") : tags.fee === "no" ? "Gratuit" : null,
    heures: tags["opening_hours"] || null,
    places: tags.capacity ? parseInt(tags.capacity) : null,
    parkingType: parkingTypeLabel(tags),
    coords: [lat, lon],
    notes: tags.note || tags.description || null,
    osmId: e.id,
  };
}

// ── Fetch ──────────────────────────────────────────────────────────────────
async function fetchParkings() {
  const url = "https://overpass-api.de/api/interpreter";
  const res = await fetch(url, {
    method: "POST",
    body: "data=" + encodeURIComponent(OVERPASS_QUERY),
  });
  const data = await res.json();
  return data.elements.map(processElement).filter(Boolean);
}

async function fetchCyclingPaths() {
  const url = "https://overpass-api.de/api/interpreter";
  const res = await fetch(url, {
    method: "POST",
    body: "data=" + encodeURIComponent(CYCLING_QUERY),
  });
  const data = await res.json();
  return {
    type: "FeatureCollection",
    features: data.elements
      .filter((e) => e.geometry && e.geometry.length > 1)
      .map((e) => ({
        type: "Feature",
        properties: { id: e.id },
        geometry: { type: "LineString", coordinates: e.geometry.map((n) => [n.lon, n.lat]) },
      })),
  };
}

function segmentNearParking(feature, center, radiusMeters) {
  return feature.geometry.coordinates.some(([lon, lat]) =>
    haversine(center[0], center[1], lat, lon) <= radiusMeters
  );
}

function updateCyclingHighlight(parkingCoords) {
  if (!cyclingLayer) return;
  cyclingLayer.eachLayer((layer) => {
    if (!parkingCoords) {
      layer.setStyle(STYLE_CYCLING_DEFAULT);
    } else {
      const near = segmentNearParking(layer.feature, parkingCoords, 1000);
      layer.setStyle(near ? STYLE_CYCLING_HIGHLIGHT : STYLE_CYCLING_DIM);
    }
  });
}

// ── Map icons ──────────────────────────────────────────────────────────────
const iconColor = { gratuit: "#2e7d52", payant: "#c9581a", mixte: "#1d6fa4", inconnu: "#7a7a8a" };

function makeIcon(type, { small = false, dim = false } = {}) {
  const c = iconColor[type] || "#888";
  const w = small ? 18 : 28;
  const h = small ? 26 : 40;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 40" width="${w}" height="${h}" style="opacity:${dim ? 0.35 : 1}">
    <path d="M14 0C6.268 0 0 6.268 0 14c0 9.333 14 26 14 26S28 23.333 28 14C28 6.268 21.732 0 14 0z"
      fill="${c}" stroke="rgba(0,0,0,0.15)" stroke-width="1"/>
    <text x="14" y="19" text-anchor="middle" font-size="${small ? 8 : 11}" font-weight="bold" fill="white" font-family="sans-serif">P</text>
  </svg>`;
  return L.divIcon({ html: svg, iconSize: [w, h], iconAnchor: [w / 2, h], popupAnchor: [0, -(h + 2)], className: "" });
}

function isCompletelyUnknown(p) {
  return p.type === "inconnu" && !p.heures && !p.places && !p.adresse && !p.notes;
}

function updateMarkerIcons(selectedId = null) {
  const someSelected = selectedId !== null;
  allParkings.forEach((pk) => {
    const m = markers[pk.id];
    if (!m) return;
    const isSelected = pk.id === selectedId;
    const cu = isCompletelyUnknown(pk);
    let small, dim;
    if (isSelected)        { small = false; dim = false; }
    else if (someSelected) { small = true;  dim = cu; }
    else                   { small = cu;    dim = cu; }
    m.setIcon(makeIcon(pk.type, { small, dim }));
  });
}

function pointOnCircle(center, radiusMeters, bearingDeg) {
  const R = 6371000;
  const lat1 = center[0] * Math.PI / 180;
  const lon1 = center[1] * Math.PI / 180;
  const b = bearingDeg * Math.PI / 180;
  const d = radiusMeters / R;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b));
  const lon2 = lon1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return [lat2 * 180 / Math.PI, lon2 * 180 / Math.PI];
}

function makeCircleLabel(emoji, text, color) {
  const html = `<div style="background:white;border:2px solid ${color};border-radius:12px;padding:3px 9px;font-size:0.72rem;font-weight:700;color:${color};white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.18);display:inline-flex;align-items:center;gap:4px;pointer-events:none;">${emoji} ${text}</div>`;
  return L.divIcon({ html, className: "", iconAnchor: [0, 12] });
}

function selectParking(p) {
  selectedParking = p;
  updateMarkerIcons(p.id);
  updateCyclingHighlight(p.coords);
  proximityCircles.forEach((c) => map.removeLayer(c));
  const walkPos = pointOnCircle(p.coords, 1000, 45);
  const bikePos = pointOnCircle(p.coords, 2500, 45);
  proximityCircles = [
    L.circle(p.coords, { radius: 1000, color: "#2e7d52", weight: 2, fillColor: "#2e7d52", fillOpacity: 0.07 }).addTo(map),
    L.circle(p.coords, { radius: 2500, color: "#1d6fa4", weight: 2, fillColor: "#1d6fa4", fillOpacity: 0.04 }).addTo(map),
    L.marker(walkPos, { icon: makeCircleLabel("🚶", "15 min", "#2e7d52"), interactive: false, keyboard: false }).addTo(map),
    L.marker(bikePos, { icon: makeCircleLabel("🚴", "10 min", "#1d6fa4"), interactive: false, keyboard: false }).addTo(map),
  ];
}

function deselectParking() {
  selectedParking = null;
  updateMarkerIcons(null);
  updateCyclingHighlight(null);
  proximityCircles.forEach((c) => map.removeLayer(c));
  proximityCircles = [];
}

// ── Geolocation ────────────────────────────────────────────────────────────
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDist(m) {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
}

document.getElementById("geo-btn").addEventListener("click", () => {
  const btn = document.getElementById("geo-btn");
  if (userCoords) {
    userCoords = null;
    btn.classList.remove("active");
    btn.title = "Trier par distance";
    render(activeFilter);
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      userCoords = [pos.coords.latitude, pos.coords.longitude];
      btn.classList.add("active");
      btn.title = "Désactiver la géolocalisation";
      map.flyTo(userCoords, 15, { duration: 0.8 });
      render(activeFilter);
    },
    () => alert("Impossible d'obtenir votre position.")
  );
});

// ── Render ─────────────────────────────────────────────────────────────────
function getSorted(filtered) {
  if (!userCoords) return filtered;
  return [...filtered].sort((a, b) => {
    const da = haversine(userCoords[0], userCoords[1], a.coords[0], a.coords[1]);
    const db = haversine(userCoords[0], userCoords[1], b.coords[0], b.coords[1]);
    return da - db;
  });
}

function render(filter) {
  activeFilter = filter;
  const list = document.getElementById("parking-list");
  list.innerHTML = "";

  const filtered = filter === "tous" ? allParkings : allParkings.filter((p) => p.type === filter);
  const sorted = getSorted(filtered);

  // Update badge
  document.getElementById("count-badge").textContent =
    filtered.length + " stationnement" + (filtered.length > 1 ? "s" : "");

  // Show/hide markers
  allParkings.forEach((p) => {
    const m = markers[p.id];
    if (!m) return;
    if (filtered.includes(p)) {
      if (!map.hasLayer(m)) m.addTo(map);
    } else {
      if (map.hasLayer(m)) map.removeLayer(m);
    }
  });

  if (sorted.length === 0) {
    list.innerHTML = `<div class="empty-state">Aucun stationnement dans cette catégorie.</div>`;
    return;
  }

  sorted.forEach((p) => {
    const dist =
      userCoords ? haversine(userCoords[0], userCoords[1], p.coords[0], p.coords[1]) : null;

    const card = document.createElement("div");
    card.className = `card ${p.type}`;
    card.innerHTML = `
      <div class="card-top">
        <div class="card-name">${p.nom}</div>
        <div class="card-badges">
          <span class="badge ${p.type}">${p.type}</span>
          ${p.parkingType ? `<span class="badge type-${p.parkingType === "Souterrain" ? "underground" : p.parkingType === "Étagé" ? "storey" : "surface"}">${p.parkingType}</span>` : ""}
        </div>
      </div>
      ${p.adresse ? `<div class="card-address">📍 ${p.adresse}</div>` : ""}
      <div class="card-meta">
        ${p.tarif ? `<span class="meta-item">💰 ${p.tarif}</span>` : ""}
        ${p.heures ? `<span class="meta-item">🕐 ${p.heures}</span>` : ""}
        ${p.places ? `<span class="meta-item">🚗 ${p.places} places</span>` : ""}
        ${dist !== null ? `<span class="distance-badge">📍 ${formatDist(dist)}</span>` : ""}
      </div>
      ${p.notes ? `<div class="card-notes">${p.notes}</div>` : ""}
    `;

    card.addEventListener("click", () => {
      document.querySelectorAll(".card").forEach((c) => c.classList.remove("active"));
      card.classList.add("active");
      map.flyTo(p.coords, 17, { duration: 0.5 });
      markers[p.id]?.openPopup();
      selectParking(p);
    });

    list.appendChild(card);
  });
}

// ── Filters ────────────────────────────────────────────────────────────────
document.querySelectorAll(".filter-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    render(btn.dataset.filter);
  });
});

// ── Init ───────────────────────────────────────────────────────────────────
(async () => {
  try {
    allParkings = await fetchParkings();

    // Cycling paths load in background — markers stay on top (markerPane > overlayPane)
    fetchCyclingPaths()
      .then((geojson) => {
        cyclingLayer = L.geoJSON(geojson, { style: STYLE_CYCLING_DEFAULT }).addTo(map);
        if (selectedParking) updateCyclingHighlight(selectedParking.coords);
      })
      .catch((err) => console.warn("Pistes cyclables indisponibles :", err));

    // Create markers
    allParkings.forEach((p) => {
      const m = L.marker(p.coords, { icon: makeIcon(p.type) })
        .addTo(map)
        .on("click", () => selectParking(p))
        .bindPopup(`
          <div class="popup-name">${p.nom}</div>
          <span class="popup-badge ${p.type}">${p.type}</span>
          ${p.adresse ? `<div>${p.adresse}</div>` : ""}
          ${p.tarif ? `<div><strong>${p.tarif}</strong></div>` : ""}
          ${p.heures ? `<div>🕐 ${p.heures}</div>` : ""}
          ${p.places ? `<div>🚗 ${p.places} places</div>` : ""}
        `);
      markers[p.id] = m;
    });

    document.getElementById("loading").remove();
    render("tous");
    updateMarkerIcons();
    map.on("click", () => {
      document.querySelectorAll(".card").forEach((c) => c.classList.remove("active"));
      deselectParking();
    });
  } catch (err) {
    document.getElementById("loading").innerHTML =
      `<p style="color:#c00">Erreur de chargement.<br>Vérifiez votre connexion.</p>`;
    console.error(err);
  }
})();
