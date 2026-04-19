// URL WFS suministrada por el usuario
const WFS_URL =
  "https://geoportal.emtvalencia.es/geoserver/wfs?service=wfs&version=1.1.0&request=GetFeature&outputFormat=json&srsName=EPSG:4326&typeName=emt:Lineas";
// Endpoint para obtener paradas de una línea; el usuario pidió que pasemos la línea seleccionada en 'linea'
const PARADAS_URL_BASE =
  "https://geoportal.emtvalencia.es/ciudadano/servicios/paradas_linea.php";

const PARADAS_USUARIO = "7gH8m45w7A";

// Estado
let lines = []; // { id: ID_PUBLICO, name: NOMBRE_LINEA, color, stops: [] }
let activeLineId = null;
let fetchingStops = false;
let allStopsData = null; // JSON con todas las paradas

// DOM
const linesList = document.getElementById("linesList");
const stopsContainer = document.getElementById("stopsContainer");
const currentLineName = document.getElementById("currentLineName");
const currentLineInfo = document.getElementById("currentLineInfo");
const newLineName = document.getElementById("newLineName");
const addLineBtn = document.getElementById("addLineBtn");
const addStopBtn = document.getElementById("addStopBtn");
const saveBtn = document.getElementById("saveBtn");
const clearBtn = document.getElementById("clearBtn");
const searchStop = document.getElementById("searchStop");
const statusContainer = document.getElementById("statusContainer");
const reloadBtn = document.getElementById("reloadBtn");

// Helpers UI
function showStatus(message, type = "info") {
  statusContainer.textContent = message;
  statusContainer.className =
    "status " + (type === "ok" ? "ok" : type === "err" ? "err" : "info");
  console.log("[Status]", message);
}

function uid(prefix = "id") {
  return prefix + "-" + Math.random().toString(36).slice(2, 9);
}

// Storage key
const STORAGE_KEY = "emt_lineas_v1";

function saveToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    showStatus("Líneas guardadas en localStorage", "ok");
  } catch (e) {
    console.error("Error guardando en storage", e);
    showStatus("Error al guardar en localStorage", "err");
  }
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length) {
      lines = parsed;
      return true;
    }
    return false;
  } catch (e) {
    console.error("Error leyendo localStorage", e);
    return false;
  }
}

// Fetch with timeout
async function fetchWithTimeout(url, options = {}, timeout = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(id);
    return res;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}

async function fetchAllStops() {
  try {
    const url =
      "https://geoportal.emtvalencia.es/geoserver/wfs?service=wfs&version=1.1.0&request=GetFeature&outPutFormat=json&srsName=EPSG:4326&typeName=emt:Paradas";
    const res = await fetch(url);
    if (!res.ok) throw new Error("Error fetch Paradas");
    allStopsData = await res.json();
    localStorage.setItem("emt_paradas", JSON.stringify(allStopsData));
    console.log("Todas las paradas cargadas y guardadas en localStorage");
  } catch (e) {
    console.error("Error al cargar todas las paradas", e);
  }
}

// Intentar leer el WFS: primero directamente (CORS), si falla por CORS o red, intentar mediante proxy público AllOrigins
async function fetchLinesFromWFS() {
  showStatus("Intentando cargar líneas desde WFS (directo)...");
  try {
    const res = await fetchWithTimeout(WFS_URL, { cache: "no-store" }, 10000);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const geo = await res.json();
    validateAndSetLinesFromGeoJSON(geo, "directo");
    return true;
  } catch (err) {
    console.warn(
      "Error fetch directo WFS:",
      err && err.message ? err.message : err
    );
    showStatus("Fetch directo falló: intentando proxy CORS...", "info");
    // Fallback: AllOrigins (public proxy)
    try {
      const proxy =
        "https://api.allorigins.win/raw?url=" + encodeURIComponent(WFS_URL);
      const res2 = await fetchWithTimeout(proxy, { cache: "no-store" }, 12000);
      if (!res2.ok) throw new Error("Proxy HTTP " + res2.status);
      const geo2 = await res2.json();
      validateAndSetLinesFromGeoJSON(geo2, "proxy");
      return true;
    } catch (err2) {
      console.error(
        "Error fetch via proxy:",
        err2 && err2.message ? err2.message : err2
      );
      // último recurso: intentar cargar desde localStorage
      const ok = loadFromStorage();
      if (ok) {
        showStatus(
          "WFS no disponible: cargadas líneas desde localStorage",
          "ok"
        );
        activeLineId = lines.length ? lines[0].id : null;
        renderLines();
        renderStops();
        return false;
      }
      showStatus("No se pudieron cargar líneas (WFS y proxy fallaron).", "err");
      lines = [];
      activeLineId = null;
      renderLines();
      renderStops();
      return false;
    }
  }
}

// Validación y mapeo de GeoJSON -> lines
function validateAndSetLinesFromGeoJSON(geo, sourceLabel) {
  if (!geo || !Array.isArray(geo.features)) {
    throw new Error("Respuesta WFS inválida: no hay features");
  }
  const mapped = geo.features.map((f) => {
    const p = f.properties || {};
    // el usuario pidió explícitamente ID_PUBLICO y NOMBRE_LINEA
    const idPublico =
      p.ID_PUBLICO !== undefined && p.ID_PUBLICO !== null
        ? p.ID_PUBLICO
        : p.ID || p.id || p.CODIGO || uid("L");
    const nombre =
      p.NOMBRE_LINEA !== undefined && p.NOMBRE_LINEA !== null
        ? p.NOMBRE_LINEA
        : p.NOMBRE || p.nombre || String(idPublico);
    return {
      id: String(idPublico),
      name: String(nombre),
      // color determinista para mejor UX: hash simple del id
      color: colorFromString(String(idPublico)),
      // paradas locales (vacío si no se cargan desde otro WFS)
      stops: [],
    };
  });
  lines = mapped;
  activeLineId = lines.length ? lines[0].id : null;
  // seleccionar la primera línea automáticamente y cargar sus paradas
  if (activeLineId) {
    selectLine(activeLineId);
  } else {
    renderLines();
    renderStops();
  }

  saveToStorage();
  showStatus(
    "Cargadas " +
      lines.length +
      " líneas desde " +
      sourceLabel +
      " (se usan ID_PUBLICO y NOMBRE_LINEA).",
    "ok"
  );
}

// Color hashing helper
function colorFromString(s) {
  // simple deterministic color from string
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  const c = (h >>> 0) % 0xffffff;
  return "#" + c.toString(16).padStart(6, "0");
}

// Renderers
function renderLines() {
  linesList.innerHTML = "";
  if (!lines.length) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "No hay líneas cargadas";
    linesList.appendChild(empty);
    return;
  }
  lines.forEach((l) => {
    const div = document.createElement("div");
    div.className = "line-item" + (l.id === activeLineId ? " active" : "");
    div.dataset.id = l.id;
    div.setAttribute("role", "listitem");
    // Mostrar NOMBRE_LINEA y ID_PUBLICO (id)
    div.innerHTML = `
          <div class="line-dot" style="background:${l.color}"></div>
          <div style="flex:1">${escapeHtml(
            l.name
          )} <div class="muted" style="font-size:12px">(ID: ${escapeHtml(
      l.id
    )} — ${l.stops.length} paradas)</div></div>
        `;
    div.addEventListener("click", () => selectLine(l.id));
    linesList.appendChild(div);
  });
}

function renderStops() {
  stopsContainer.innerHTML = "";
  const line = lines.find((x) => x.id === activeLineId);
  if (!line) {
    currentLineName.textContent = "Selecciona una línea";
    currentLineInfo.textContent = "Paradas de la línea";
    return;
  }
  currentLineName.textContent = line.name + " (ID: " + line.id + ")";
  currentLineInfo.textContent = `${line.stops.length} paradas`;

  const query =
    searchStop && searchStop.value ? searchStop.value.trim().toLowerCase() : "";
  line.stops.forEach((stop, idx) => {
    if (query && !stop.toLowerCase().includes(query)) return;
    const el = document.createElement("div");
    el.className = "stop";
    el.innerHTML = `<div>${escapeHtml(stop)}</div>`;
    stopsContainer.appendChild(el);
  });
}

// Escapar texto para inyección segura en HTML
function escapeHtml(str) {
  return String(str).replace(
    /[&<>\"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c])
  );
}

// Acciones
function collapseSpaces(s) {
  var out = "";
  var last = false;
  for (var i = 0; i < s.length; i++) {
    var ch = s[i];
    if (ch.trim() === "") {
      if (!last) {
        out += " ";
        last = true;
      }
    } else {
      out += ch;
      last = false;
    }
  }
  return out.trim();
}

function startsWithNumberPrefix(s) {
  var i = 0;
  while (
    i < s.length &&
    (s[i] === " " || s[i] == "." || s[i] == "-" || (s[i] >= "0" && s[i] <= "9"))
  ) {
    i++;
  }
  return s.slice(i).trim();
}

function parseStopsFromXML(html) {
  try {
    const raw = String(html || "").trim();
    const xml = new DOMParser().parseFromString(raw, "application/xml");
    if (xml.getElementsByTagName("parsererror").length === 0) {
      const paradaNodes = xml.getElementsByTagName("parada");
      const stops = [];
      for (let i = 0; i < paradaNodes.length; i++) {
        const p = paradaNodes[i];
        const getText = (tag) => {
          const n = p.getElementsByTagName(tag)[0];
          return n ? String(n.textContent || "").trim() : "";
        };
        const nombre =
          getText("nombre_parada") || getText("nombre") || getText("name");
        const orden = getText("orden") || String(i + 1);
        const id_parada = getText("id_parada") || getText("id");
        if (nombre) stops.push(orden + ". " + nombre + " (" + id_parada + ")");
        else if (id_parada) stops.push(orden + ". " + id_parada);
      }
      return stops;
    }
  } catch (e) {
    console.warn("parseStopsFromXML failed", e);
  }
  return null;
}

async function fetchStopsForLine(lineId) {
  if (!lineId) return;
  if (fetchingStops) return;
  fetchingStops = true;
  showStatus("Cargando paradas para la línea " + lineId + "...");
  var url =
    PARADAS_URL_BASE +
    "?usuario=" +
    encodeURIComponent(PARADAS_USUARIO) +
    "&linea=" +
    encodeURIComponent(lineId) +
    "&lang=es";
  try {
    var res = await fetchWithTimeout(url, { cache: "no-store" }, 10000);
    if (!res.ok) throw new Error("HTTP " + res.status);
    var text = await res.text();
    var stops = parseStopsFromXML(text);
    var line = lines.find(function (l) {
      return l.id === lineId;
    });
    if (line) {
      const idx = lines.findIndex((l) => l.id === lineId);
      const normalized = stops.map((s) => String(s).trim()).filter(Boolean);
      if (idx !== -1) {
        lines[idx].stops = normalized;
        console.debug(
          "Assigned stops to line",
          lineId,
          lines[idx].stops.length
        );
      } else {
        // fallback: attach directly to found object
        line.stops = normalized;
        console.debug(
          "Assigned stops to line (fallback)",
          lineId,
          line.stops.length
        );
      }
      renderLines();
      renderStops();
      console.debug(
        "Lines snapshot after assign:",
        lines.map((l) => ({ id: l.id, stops: (l.stops || []).length }))
      );
    }
    renderStops();
    saveToStorage();
    showStatus(
      "Paradas cargadas desde servidor (" + stops.length + " entradas)",
      "ok"
    );
  } catch (err) {
    console.warn(
      "Error cargando paradas directo:",
      err && err.message ? err.message : err
    );
    showStatus("Fetch directo de paradas falló: intentando proxy...", "info");
    try {
      var proxy =
        "https://api.allorigins.win/raw?url=" + encodeURIComponent(url);
      var res2 = await fetchWithTimeout(proxy, { cache: "no-store" }, 12000);
      if (!res2.ok) throw new Error("Proxy HTTP " + res2.status);
      var text2 = await res2.text();
      var stops2 = parseStopsFromXML(text2);
      var line2 = lines.find(function (l) {
        return l.id === lineId;
      });
      if (line2) {
        const idx2 = lines.findIndex((l) => l.id === lineId);
        const normalized2 = stops2.map((s) => String(s).trim()).filter(Boolean);
        if (idx2 !== -1) {
          lines[idx2].stops = normalized2;
          console.debug(
            "Assigned stops (proxy) to line",
            lineId,
            lines[idx2].stops.length
          );
        } else {
          line2.stops = normalized2;
          console.debug(
            "Assigned stops (proxy) to line (fallback)",
            lineId,
            line2.stops.length
          );
        }
        renderLines();
        renderStops();
        console.debug(
          "Lines snapshot after proxy assign:",
          lines.map((l) => ({ id: l.id, stops: (l.stops || []).length }))
        );
      }
      renderStops();
      saveToStorage();
      showStatus(
        "Paradas cargadas vía proxy (" + stops2.length + " entradas)",
        "ok"
      );
    } catch (err2) {
      console.error(
        "Error fetch paradas via proxy:",
        err2 && err2.message ? err2.message : err2
      );
      showStatus(
        "No se pudieron cargar paradas para la línea " + lineId,
        "err"
      );
    }
  } finally {
    fetchingStops = false;
  }
}

function selectLine(id) {
  activeLineId = id;
  renderLines();
  renderStops();
  fetchStopsForLine(id);
}

// Eventos UI

if (saveBtn) saveBtn.addEventListener("click", saveToStorage);
if (clearBtn)
  clearBtn.addEventListener("click", () => {
    if (confirm("Borrar datos locales (localStorage)?")) {
      localStorage.removeItem(STORAGE_KEY);
      lines = [];
      activeLineId = null;
      renderLines();
      renderStops();
      showStatus("Datos locales borrados", "ok");
    }
  });
if (searchStop) searchStop.addEventListener("input", renderStops);
if (reloadBtn)
  reloadBtn.addEventListener("click", () => {
    fetchLinesFromWFS();
  });

// Al iniciar: intentar siempre cargar del endpoint WFS
(async () => {
  try {
    await fetchLinesFromWFS();
    await fetchAllStops();
  } catch (e) {
    console.error("Inicio: error al cargar líneas:", e);
  }
})();

// Exponer API mínima para debugging
window.BusApp = {
  getLines: () => JSON.parse(JSON.stringify(lines)),
  fetchLinesFromWFS,
  selectLine,
};
