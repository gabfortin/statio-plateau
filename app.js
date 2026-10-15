// Plateau-Mont-Royal bounding box (south, west, north, east)
const BOUNDS = "45.510,-73.600,45.545,-73.555";
const PLATEAU_CENTER = [45.5245, -73.5757];

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

// Main instance first, mirrors as fallback when it is overloaded
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const FETCH_TIMEOUT = 20000;
const CACHE_TTL = 24 * 60 * 60 * 1000; // OSM data changes rarely

// ── State ──────────────────────────────────────────────────────────────────
let map = null;
let allParkings = [];
const parkingsById = new Map();
const markers = {};
let userCoords = null;
let activeFilter = "tous";
let selectedParking = null;
let proximityCircles = [];
let cyclingLayer = null;

const STYLE_CYCLING_DEFAULT   = { color: "#16a34a", weight: 1.5, opacity: 0.3,  dashArray: "6 4" };
const STYLE_CYCLING_HIGHLIGHT = { color: "#16a34a", weight: 3,   opacity: 0.95, dashArray: null };
const STYLE_CYCLING_DIM       = { color: "#16a34a", weight: 1,   opacity: 0.06, dashArray: "6 4" };

const $ = (sel) => document.querySelector(sel);

// ── UI helpers ─────────────────────────────────────────────────────────────
// OSM tags are user-contributed: never inject them raw into innerHTML
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

let toastTimer = null;
function toast(message, { tone = "info", duration = 3500 } = {}) {
  const el = $("#toast");
  el.textContent = message;
  el.dataset.tone = tone;
  el.classList.add("show");
  clearTimeout(toastTimer);
  if (duration) toastTimer = setTimeout(() => el.classList.remove("show"), duration);
}

function setStatus(text) {
  const el = $("#loading-status");
  if (el) el.textContent = text;
}

function showError(title, detail) {
  const overlay = $("#map-overlay");
  overlay.hidden = false;
  overlay.classList.add("is-error");
  overlay.innerHTML = `
    <div class="overlay-card">
      <div class="overlay-icon">⚠️</div>
      <p class="overlay-title">${esc(title)}</p>
      <p class="overlay-detail">${esc(detail)}</p>
      <button class="btn-primary" id="retry-btn" type="button">Réessayer</button>
    </div>`;
  $("#retry-btn").addEventListener("click", () => location.reload());
  $("#parking-list").innerHTML = "";
  $("#count-badge").textContent = "—";
}

function hideOverlay() {
  const overlay = $("#map-overlay");
  overlay.classList.add("fade-out");
  overlay.addEventListener("transitionend", () => (overlay.hidden = true), { once: true });
  setTimeout(() => (overlay.hidden = true), 500); // in case transitionend never fires
}

function timeAgo(ms) {
  const h = Math.round(ms / 3600000);
  if (h < 1) return "moins d'une heure";
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} jours`;
}

// ── Fetch ──────────────────────────────────────────────────────────────────
function readCache(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}

function writeCache(key, data) {
  try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), data })); } catch {}
}

async function fetchWithTimeout(url, options, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Overpass query with localStorage cache, mirror fallback, and stale-cache fallback.
// Returns { elements, stale } where stale is the cache age in ms (or 0 if fresh).
async function overpass(key, query) {
  const cached = readCache(key);
  if (cached && Date.now() - cached.t < CACHE_TTL) return { elements: cached.data, stale: 0 };

  let lastErr = null;
  if (navigator.onLine !== false) {
    for (const endpoint of OVERPASS_ENDPOINTS) {
      try {
        const res = await fetchWithTimeout(endpoint, {
          method: "POST",
          body: "data=" + encodeURIComponent(query),
        }, FETCH_TIMEOUT);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!Array.isArray(json.elements)) throw new Error("Réponse Overpass invalide");
        writeCache(key, json.elements);
        return { elements: json.elements, stale: 0 };
      } catch (err) {
        lastErr = err;
      }
    }
  } else {
    lastErr = new Error("Hors ligne");
  }

  if (cached) return { elements: cached.data, stale: Date.now() - cached.t };
  throw lastErr;
}

// ── OSM processing ─────────────────────────────────────────────────────────
function classifyFee(tags) {
  if (tags.fee === "yes") return "payant";
  if (tags.fee === "no") return tags.access === "customers" ? "mixte" : "gratuit";
  return "inconnu";
}

function buildName(tags) {
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
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const places = parseInt(tags.capacity, 10);

  return {
    id: `${e.type}/${e.id}`, // node and way ids can collide
    nom: buildName(tags),
    adresse: buildAddress(tags),
    type: classifyFee(tags),
    tarif: tags.fee === "yes" ? (tags["charge"] || "Payant") : tags.fee === "no" ? "Gratuit" : null,
    heures: tags["opening_hours"] || null,
    places: places > 0 ? places : null,
    parkingType: parkingTypeLabel(tags),
    coords: [lat, lon],
    notes: tags.note || tags.description || null,
  };
}

async function fetchParkings() {
  const { elements, stale } = await overpass("osm:parkings:v2", OVERPASS_QUERY);
  return { parkings: elements.map(processElement).filter(Boolean), stale };
}

async function fetchCyclingPaths() {
  const { elements } = await overpass("osm:cycling:v1", CYCLING_QUERY);
  return {
    type: "FeatureCollection",
    features: elements
      .filter((e) => e.geometry && e.geometry.length > 1)
      .map((e) => ({
        type: "Feature",
        properties: { id: e.id },
        geometry: { type: "LineString", coordinates: e.geometry.map((n) => [n.lon, n.lat]) },
      })),
  };
}

function segmentNearParking(layer, center, radiusMeters) {
  // Cheap bounding-box rejection before per-vertex haversine
  if (!layer._bbox) layer._bbox = layer.getBounds();
  const b = layer._bbox;
  const pad = radiusMeters / 111000; // ~degrees of latitude
  const padLon = pad / Math.cos((center[0] * Math.PI) / 180);
  if (center[0] < b.getSouth() - pad || center[0] > b.getNorth() + pad ||
      center[1] < b.getWest() - padLon || center[1] > b.getEast() + padLon) return false;
  return layer.feature.geometry.coordinates.some(([lon, lat]) =>
    haversine(center[0], center[1], lat, lon) <= radiusMeters
  );
}

function updateCyclingHighlight(parkingCoords) {
  if (!cyclingLayer) return;
  cyclingLayer.eachLayer((layer) => {
    if (!parkingCoords) {
      layer.setStyle(STYLE_CYCLING_DEFAULT);
    } else {
      const near = segmentNearParking(layer, parkingCoords, 2500);
      layer.setStyle(near ? STYLE_CYCLING_HIGHLIGHT : STYLE_CYCLING_DIM);
    }
  });
}

// ── Map icons ──────────────────────────────────────────────────────────────
const iconColor = { gratuit: "#16a34a", payant: "#ea580c", mixte: "#2563eb", inconnu: "#71717a" };
const typeLabel = { gratuit: "Gratuit", payant: "Payant", mixte: "Mixte", inconnu: "Inconnu" };

// Icons are immutable, so build each (type, variant) once
const iconCache = new Map();

function getIcon(type, variant = "normal") {
  const key = type + ":" + variant;
  if (!iconCache.has(key)) {
    iconCache.set(key, makeIcon(type, { small: variant === "small", dot: variant === "dot" }));
  }
  return iconCache.get(key);
}

function makeIcon(type, { small = false, dot = false } = {}) {
  const c = iconColor[type] || "#888";

  if (dot) {
    const r = 7;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${r * 2}" height="${r * 2}">
      <circle cx="${r}" cy="${r}" r="${r - 1.5}" fill="${c}" stroke="white" stroke-width="1.5"/>
    </svg>`;
    return L.divIcon({ html: svg, iconSize: [r * 2, r * 2], iconAnchor: [r, r], className: "pin pin-dot" });
  }

  const w = small ? 18 : 28;
  const h = small ? 26 : 40;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 40" width="${w}" height="${h}">
    <path d="M14 0C6.268 0 0 6.268 0 14c0 9.333 14 26 14 26S28 23.333 28 14C28 6.268 21.732 0 14 0z"
      fill="${c}" stroke="white" stroke-width="1.5"/>
    <text x="14" y="19" text-anchor="middle" font-size="${small ? 8 : 11}" font-weight="bold" fill="white" font-family="system-ui, sans-serif">P</text>
  </svg>`;
  return L.divIcon({
    html: svg, iconSize: [w, h], iconAnchor: [w / 2, h], popupAnchor: [0, -(h + 2)],
    className: small ? "pin pin-faded" : "pin",
  });
}

function isCompletelyUnknown(p) {
  return p.type === "inconnu" && !p.heures && !p.places && !p.adresse && !p.notes;
}

function updateMarkerIcons(selectedId = null) {
  const someSelected = selectedId !== null;
  allParkings.forEach((pk) => {
    const m = markers[pk.id];
    if (!m) return;
    const variant =
      pk.id === selectedId ? "normal" :
      someSelected         ? "dot" :
      isCompletelyUnknown(pk) ? "small" : "normal";
    if (m._variant === variant) return; // skip needless DOM rebuild
    m._variant = variant;
    m.setIcon(getIcon(pk.type, variant));
    m.setZIndexOffset(pk.id === selectedId ? 1000 : 0);
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
  const html = `<div class="circle-label" style="--c:${color}">${emoji} ${text}</div>`;
  return L.divIcon({ html, className: "", iconAnchor: [0, 12] });
}

function popupHtml(p) {
  return `
    <div class="popup-name">${esc(p.nom)}</div>
    <span class="popup-badge ${p.type}">${typeLabel[p.type]}</span>
    ${p.adresse ? `<div class="popup-address">📍 ${esc(p.adresse)}</div>` : ""}
    ${p.tarif ? `<div><strong>${esc(p.tarif)}</strong></div>` : ""}
    ${p.heures ? `<div>🕐 ${esc(p.heures)}</div>` : ""}
    ${p.places ? `<div>🚗 ${p.places} places</div>` : ""}
    <a class="popup-dir" href="https://www.google.com/maps/dir/?api=1&destination=${p.coords[0]},${p.coords[1]}" target="_blank" rel="noopener">Itinéraire →</a>`;
}

function selectParking(p) {
  selectedParking = p;
  updateMarkerIcons(p.id);
  updateCyclingHighlight(p.coords);
  proximityCircles.forEach((c) => map.removeLayer(c));
  const walkPos = pointOnCircle(p.coords, 1000, 90);
  const bikePos = pointOnCircle(p.coords, 2500, 90);
  proximityCircles = [
    L.circle(p.coords, { radius: 1000, color: "#2563eb", weight: 1.5, fillColor: "#2563eb", fillOpacity: 0.06, interactive: false }).addTo(map),
    L.circle(p.coords, { radius: 2500, color: "#16a34a", weight: 1.5, fillColor: "#16a34a", fillOpacity: 0.03, interactive: false }).addTo(map),
    L.marker(walkPos, { icon: makeCircleLabel("🚶", "15 min", "#2563eb"), interactive: false, keyboard: false }).addTo(map),
    L.marker(bikePos, { icon: makeCircleLabel("🚴", "10 min", "#16a34a"), interactive: false, keyboard: false }).addTo(map),
  ];
  highlightCard(p.id);
}

function deselectParking() {
  if (!selectedParking) return;
  selectedParking = null;
  updateMarkerIcons(null);
  updateCyclingHighlight(null);
  proximityCircles.forEach((c) => map.removeLayer(c));
  proximityCircles = [];
  clearActiveCard();
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

let userMarker = null;

function setGeoActive(coords) {
  const btn = $("#geo-btn");
  userCoords = coords;
  btn.classList.toggle("active", !!coords);
  btn.title = coords ? "Désactiver le tri par distance" : "Trier par distance";
  btn.setAttribute("aria-pressed", String(!!coords));
  if (userMarker) { map.removeLayer(userMarker); userMarker = null; }
  if (coords) {
    userMarker = L.marker(coords, {
      icon: L.divIcon({ className: "", html: '<div class="user-dot"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }),
      interactive: false, keyboard: false, zIndexOffset: 2000,
    }).addTo(map);
  }
  render(activeFilter);
}

function onGeoClick() {
  const btn = $("#geo-btn");
  if (btn.classList.contains("busy")) return; // request already in flight
  if (userCoords) return setGeoActive(null);

  if (!("geolocation" in navigator)) {
    return toast("La géolocalisation n'est pas supportée par ce navigateur.", { tone: "error" });
  }
  if (!window.isSecureContext) {
    return toast("La géolocalisation requiert une connexion HTTPS.", { tone: "error" });
  }

  btn.classList.add("busy");
  btn.disabled = true;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      btn.classList.remove("busy");
      btn.disabled = false;
      const coords = [pos.coords.latitude, pos.coords.longitude];
      setGeoActive(coords);
      const distToPlateau = haversine(coords[0], coords[1], PLATEAU_CENTER[0], PLATEAU_CENTER[1]);
      if (distToPlateau > 15000) {
        toast(`Vous êtes à ${formatDist(distToPlateau)} du Plateau — liste triée quand même.`);
      } else {
        flyToVisible(coords, 15, { duration: 0.8 });
        toast("Liste triée par distance", { tone: "success", duration: 2000 });
      }
    },
    (err) => {
      btn.classList.remove("busy");
      btn.disabled = false;
      const msg = {
        1: "Accès à la position refusé. Autorisez-le dans les réglages du navigateur.",
        2: "Position indisponible pour le moment.",
        3: "La localisation a pris trop de temps. Réessayez.",
      }[err.code] || "Impossible d'obtenir votre position.";
      toast(msg, { tone: "error", duration: 5000 });
    },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
  );
}

// ── Floating panels vs. map ────────────────────────────────────────────────
const desktopMQ = window.matchMedia("(min-width: 900px)");

// Popup auto-pan padding, mutated in place so every popup sees current values
const popupPadTL = { x: 24, y: 24 };
const popupPadBR = { x: 24, y: 24 };

// The part of the map not covered by the top bar and the list panel
function visibleMapRect() {
  const top = $(".topbar").getBoundingClientRect();
  const sheet = $(".sheet").getBoundingClientRect();
  const W = window.innerWidth, H = window.innerHeight;
  if (desktopMQ.matches) return { left: Math.max(top.right, sheet.right), top: 0, right: W, bottom: H };
  return { left: 0, top: top.bottom, right: W, bottom: Math.min(sheet.top, H) };
}

function syncLayoutVars() {
  const root = document.documentElement.style;
  root.setProperty("--topbar-h", $(".topbar").offsetHeight + "px");
  const collapsed = document.body.classList.contains("map-focus");
  const sheetH = collapsed ? $(".sheet-handle").offsetHeight : $(".sheet").offsetHeight;
  root.setProperty("--sheet-visible-h", desktopMQ.matches ? "0px" : sheetH + "px");

  // Use the target layout (not mid-transition rects) for popup padding
  const gap = desktopMQ.matches ? 16 : 12;
  const topbarBottom = $(".topbar").offsetHeight + gap;
  popupPadTL.x = desktopMQ.matches ? $(".topbar").offsetWidth + gap * 2 : 16;
  popupPadTL.y = desktopMQ.matches ? 24 : topbarBottom + 16;
  popupPadBR.x = 24;
  popupPadBR.y = desktopMQ.matches ? 24 : sheetH + gap + 16;
}

// flyTo, but centred in the visible area rather than behind a panel
function flyToVisible(coords, zoom, opts) {
  const r = visibleMapRect();
  const size = map.getSize();
  const offset = L.point((r.left + r.right) / 2 - size.x / 2, (r.top + r.bottom) / 2 - size.y / 2);
  const target = map.unproject(map.project(coords, zoom).subtract(offset), zoom);
  map.flyTo(target, zoom, opts);
}

// ── Render ─────────────────────────────────────────────────────────────────
function clearActiveCard() {
  document.querySelector(".card.active")?.classList.remove("active");
}

function highlightCard(id) {
  clearActiveCard();
  const card = document.querySelector(`.card[data-id="${CSS.escape(id)}"]`);
  if (!card) return;
  card.classList.add("active");
  if (!document.body.classList.contains("map-focus")) {
    card.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
}

function updateFilterCounts() {
  const counts = { tous: allParkings.length, gratuit: 0, mixte: 0, payant: 0, inconnu: 0 };
  allParkings.forEach((p) => counts[p.type]++);
  document.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.querySelector(".count").textContent = counts[btn.dataset.filter] ?? 0;
  });
}

function render(filter) {
  activeFilter = filter;
  const list = $("#parking-list");

  const filtered = filter === "tous" ? allParkings : allParkings.filter((p) => p.type === filter);

  // Distance computed once per parking, not on every sort comparison
  const items = filtered.map((p) => ({
    p,
    dist: userCoords ? haversine(userCoords[0], userCoords[1], p.coords[0], p.coords[1]) : null,
  }));
  if (userCoords) items.sort((a, b) => a.dist - b.dist);

  $("#count-badge").textContent =
    filtered.length + " stationnement" + (filtered.length > 1 ? "s" : "");

  // Show/hide markers
  allParkings.forEach((p) => {
    const m = markers[p.id];
    if (!m) return;
    const visible = filter === "tous" || p.type === filter;
    if (visible && !map.hasLayer(m)) m.addTo(map);
    else if (!visible && map.hasLayer(m)) map.removeLayer(m);
  });

  if (selectedParking && filter !== "tous" && selectedParking.type !== filter) deselectParking();

  if (items.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🅿️</div>
        <p>Aucun stationnement dans cette catégorie.</p>
        <button class="btn-ghost" type="button" data-reset-filter>Voir tous les stationnements</button>
      </div>`;
    return;
  }

  list.innerHTML = items.map(({ p, dist }) => `
    <article class="card ${p.type}${selectedParking?.id === p.id ? " active" : ""}" data-id="${esc(p.id)}" tabindex="0" role="button" aria-label="${esc(p.nom)}">
      <div class="card-top">
        <h3 class="card-name">${esc(p.nom)}</h3>
        ${dist !== null ? `<span class="distance-badge">${formatDist(dist)}</span>` : ""}
      </div>
      ${p.adresse ? `<div class="card-address">${esc(p.adresse)}</div>` : ""}
      <div class="card-meta">
        <span class="badge ${p.type}">${typeLabel[p.type]}</span>
        ${p.parkingType ? `<span class="badge neutral">${p.parkingType}</span>` : ""}
        ${p.tarif && p.type === "payant" ? `<span class="meta-item">💰 ${esc(p.tarif)}</span>` : ""}
        ${p.heures ? `<span class="meta-item">🕐 ${esc(p.heures)}</span>` : ""}
        ${p.places ? `<span class="meta-item">🚗 ${p.places} places</span>` : ""}
      </div>
      ${p.notes ? `<div class="card-notes">${esc(p.notes)}</div>` : ""}
    </article>`).join("");
}

function setFilter(filter) {
  if (!allParkings.length) return; // guard: no data yet
  document.querySelectorAll(".filter-btn").forEach((b) => {
    const on = b.dataset.filter === filter;
    b.classList.toggle("active", on);
    b.setAttribute("aria-pressed", String(on));
  });
  render(filter);
}

function activateCard(card) {
  const p = parkingsById.get(card.dataset.id);
  if (!p) return;
  map.closePopup();
  flyToVisible(p.coords, 17, { duration: 0.6 });
  // Open after the flight so auto-pan doesn't fight the animation
  map.once("moveend", () => markers[p.id]?.openPopup());
  selectParking(p);
}

// ── Init ───────────────────────────────────────────────────────────────────
function bindUI() {
  // One delegated listener instead of one per card
  $("#parking-list").addEventListener("click", (e) => {
    if (e.target.closest("[data-reset-filter]")) return setFilter("tous");
    const card = e.target.closest(".card");
    if (card) activateCard(card);
  });
  $("#parking-list").addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const card = e.target.closest(".card");
    if (!card) return;
    e.preventDefault();
    activateCard(card);
  });

  document.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => setFilter(btn.dataset.filter));
  });

  $("#geo-btn").addEventListener("click", onGeoClick);

  $("#list-toggle").addEventListener("click", () => {
    const collapsed = document.body.classList.toggle("map-focus");
    $("#list-toggle").setAttribute("aria-expanded", String(!collapsed));
    syncLayoutVars();
  });

  new ResizeObserver(syncLayoutVars).observe($(".topbar"));
  window.addEventListener("resize", syncLayoutVars);
  syncLayoutVars();

  window.addEventListener("offline", () => toast("Vous êtes hors ligne — données en cache affichées.", { tone: "error" }));
  window.addEventListener("online", () => toast("Connexion rétablie", { tone: "success", duration: 2000 }));
}

function initMap() {
  map = L.map("map", { zoomControl: false }).setView(PLATEAU_CENTER, 14);
  L.control.zoom({ position: "bottomright" }).addTo(map);
  // CARTO basemaps now require an API key; OSM tiles are desaturated in CSS instead
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(map);
  map.on("click", deselectParking);
}

async function loadCycling() {
  try {
    const geojson = await fetchCyclingPaths();
    // Canvas renderer: hundreds of polylines restyle much faster than SVG nodes
    cyclingLayer = L.geoJSON(geojson, {
      style: STYLE_CYCLING_DEFAULT,
      renderer: L.canvas({ padding: 0.5 }),
      interactive: false,
    }).addTo(map);
    cyclingLayer.bringToBack();
    if (selectedParking) updateCyclingHighlight(selectedParking.coords);
  } catch (err) {
    console.warn("Pistes cyclables indisponibles :", err);
  }
}

// Frame all parkings inside the area left visible by the floating panels
function fitToParkings() {
  const r = visibleMapRect();
  const size = map.getSize();
  map.fitBounds(L.latLngBounds(allParkings.map((p) => p.coords)), {
    paddingTopLeft: [r.left + 24, r.top + 24],
    paddingBottomRight: [size.x - r.right + 24, size.y - r.bottom + 24],
    maxZoom: 16,
    animate: false,
  });
}

async function loadParkings() {
  setStatus("Chargement des stationnements…");
  const slowTimer = setTimeout(() => setStatus("Le serveur OpenStreetMap est lent, encore un instant…"), 6000);
  let result;
  try {
    result = await fetchParkings();
  } finally {
    clearTimeout(slowTimer);
  }
  const { parkings, stale } = result;

  if (!parkings.length) {
    showError("Aucun stationnement trouvé", "Le serveur a répondu sans données. Réessayez dans quelques minutes.");
    return;
  }

  allParkings = parkings;
  parkings.forEach((p) => {
    parkingsById.set(p.id, p);
    // Popup HTML is built lazily, only when a popup actually opens
    markers[p.id] = L.marker(p.coords, { icon: getIcon(p.type), title: p.nom, riseOnHover: true })
      .addTo(map)
      .on("click", () => selectParking(p))
      .bindPopup(() => popupHtml(p), {
        closeButton: false, maxWidth: 260,
        autoPanPaddingTopLeft: popupPadTL, autoPanPaddingBottomRight: popupPadBR,
      });
  });

  updateFilterCounts();
  updateMarkerIcons();
  render("tous");
  $("#parking-list").setAttribute("aria-busy", "false");
  document.querySelectorAll(".filter-btn").forEach((b) => (b.disabled = false));
  $("#geo-btn").disabled = false;
  fitToParkings();
  hideOverlay();

  if (stale) toast(`Données hors ligne (mises à jour il y a ${timeAgo(stale)})`, { duration: 5000 });
}

(async () => {
  if (typeof L === "undefined") {
    showError("Impossible de charger la carte", "La librairie de cartographie n'a pas pu être téléchargée. Vérifiez votre connexion.");
    return;
  }

  initMap();
  bindUI();

  // Both requests fire simultaneously; cycling paths are optional
  loadCycling();
  try {
    await loadParkings();
  } catch (err) {
    console.error(err);
    const offline = navigator.onLine === false;
    showError(
      offline ? "Vous êtes hors ligne" : "Erreur de chargement",
      offline
        ? "Connectez-vous à Internet pour charger les stationnements."
        : "Le serveur OpenStreetMap ne répond pas. Réessayez dans quelques instants."
    );
  }
})();
