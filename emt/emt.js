const APP_CONFIG = {
  wfsLinesUrl:
    "https://geoportal.emtvalencia.es/geoserver/wfs?service=wfs&version=1.1.0&request=GetFeature&outputFormat=json&srsName=EPSG:4326&typeName=emt:Lineas",
  wfsStopsUrl:
    "https://geoportal.emtvalencia.es/geoserver/wfs?service=wfs&version=1.1.0&request=GetFeature&outPutFormat=json&srsName=EPSG:4326&typeName=emt:Paradas",
  paradasUrlBase:
    "https://geoportal.emtvalencia.es/ciudadano/servicios/paradas_linea.php",
  paradasUsuario: "7gH8m45w7A",
  corsProxy: "https://api.allorigins.win/raw?url=",
  storageKey: "emt_lineas_v1",
  storageStopsKey: "emt_paradas",
  requestTimeoutMs: 10000,
  proxyTimeoutMs: 12000,
};

class DomRefs {
  constructor() {
    this.linesList = document.getElementById("linesList");
    this.stopsContainer = document.getElementById("stopsContainer");
    this.currentLineName = document.getElementById("currentLineName");
    this.currentLineInfo = document.getElementById("currentLineInfo");
    this.saveBtn = document.getElementById("saveBtn");
    this.clearBtn = document.getElementById("clearBtn");
    this.searchStop = document.getElementById("searchStop");
    this.statusContainer = document.getElementById("statusContainer");
    this.reloadBtn = document.getElementById("reloadBtn");
  }
}

class StatusPresenter {
  constructor(statusContainer) {
    this.statusContainer = statusContainer;
  }

  show(message, type = "info") {
    if (!this.statusContainer) return;
    this.statusContainer.textContent = message;
    this.statusContainer.className = `status ${type === "ok" ? "ok" : type === "err" ? "err" : "info"}`;
    console.log("[Status]", message);
  }
}

class StorageService {
  constructor(storageKey, status) {
    this.storageKey = storageKey;
    this.status = status;
  }

  saveLines(lines, options = {}) {
    const { silent = false } = options;
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(lines));
      if (!silent) {
        this.status.show("Líneas guardadas en localStorage", "ok");
      }
    } catch (error) {
      console.error("Error guardando en storage", error);
      if (!silent) {
        this.status.show("Error al guardar en localStorage", "err");
      }
    }
  }

  loadLines() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error("Error leyendo localStorage", error);
      return [];
    }
  }

  clearLines() {
    localStorage.removeItem(this.storageKey);
  }

  saveStopsSnapshot(key, payload) {
    try {
      localStorage.setItem(key, JSON.stringify(payload));
    } catch (error) {
      console.error("No se pudo guardar snapshot de paradas", error);
    }
  }
}

class HttpClient {
  static async fetchWithTimeout(url, options = {}, timeout = 10000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }
}

class EMTApi {
  constructor(config) {
    this.config = config;
  }

  async fetchLinesDirect() {
    return this.fetchLinesFromUrl(
      this.config.wfsLinesUrl,
      this.config.requestTimeoutMs,
    );
  }

  async fetchLinesViaProxy() {
    const url =
      this.config.corsProxy + encodeURIComponent(this.config.wfsLinesUrl);
    return this.fetchLinesFromUrl(url, this.config.proxyTimeoutMs);
  }

  async fetchLinesFromUrl(url, timeoutMs) {
    const response = await HttpClient.fetchWithTimeout(
      url,
      { cache: "no-store" },
      timeoutMs,
    );
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
  }

  async fetchStopsForLineDirect(lineId) {
    const url = this.getStopsUrl(lineId);
    return this.fetchStopsFromUrl(url, this.config.requestTimeoutMs);
  }

  async fetchStopsForLineViaProxy(lineId) {
    const originalUrl = this.getStopsUrl(lineId);
    const proxyUrl = this.config.corsProxy + encodeURIComponent(originalUrl);
    return this.fetchStopsFromUrl(proxyUrl, this.config.proxyTimeoutMs);
  }

  async fetchStopsFromUrl(url, timeoutMs) {
    const response = await HttpClient.fetchWithTimeout(
      url,
      { cache: "no-store" },
      timeoutMs,
    );
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const rawText = await response.text();
    return this.parseStopsXml(rawText);
  }

  async fetchAllStopsSnapshot() {
    const response = await fetch(this.config.wfsStopsUrl);
    if (!response.ok) {
      throw new Error("Error fetch Paradas");
    }
    return response.json();
  }

  getStopsUrl(lineId) {
    const params =
      "?usuario=" +
      encodeURIComponent(this.config.paradasUsuario) +
      "&linea=" +
      encodeURIComponent(lineId) +
      "&lang=es";
    return this.config.paradasUrlBase + params;
  }

  parseStopsXml(xmlText) {
    try {
      const xml = new DOMParser().parseFromString(
        String(xmlText || "").trim(),
        "application/xml",
      );
      if (xml.getElementsByTagName("parsererror").length > 0) {
        return [];
      }

      const paradaNodes = xml.getElementsByTagName("parada");
      const stops = [];
      for (let index = 0; index < paradaNodes.length; index++) {
        const node = paradaNodes[index];
        const orden = this.readXmlText(node, "orden") || String(index + 1);
        const nombre =
          this.readXmlText(node, "nombre_parada") ||
          this.readXmlText(node, "nombre") ||
          this.readXmlText(node, "name");
        const stopId =
          this.readXmlText(node, "id_parada") || this.readXmlText(node, "id");

        if (nombre) {
          stops.push(`${orden}. ${nombre} (${stopId})`);
        } else if (stopId) {
          stops.push(`${orden}. ${stopId}`);
        }
      }
      return stops;
    } catch (error) {
      console.warn("parseStopsXml failed", error);
      return [];
    }
  }

  readXmlText(parent, tagName) {
    const node = parent.getElementsByTagName(tagName)[0];
    return node ? String(node.textContent || "").trim() : "";
  }
}

class BusView {
  constructor(domRefs) {
    this.dom = domRefs;
  }

  renderLines(lines, activeLineId, onLineClick) {
    const { linesList } = this.dom;
    if (!linesList) return;

    linesList.innerHTML = "";
    if (!lines.length) {
      const emptyState = document.createElement("div");
      emptyState.className = "muted";
      emptyState.textContent = "No hay líneas cargadas";
      linesList.appendChild(emptyState);
      return;
    }

    lines.forEach((line) => {
      const card = document.createElement("div");
      card.className = `line-item${line.id === activeLineId ? " active" : ""}`;
      card.dataset.id = line.id;
      card.setAttribute("role", "listitem");
      card.innerHTML = `
        <div class="line-dot" style="background:${line.color}"></div>
        <div style="flex:1">${this.escapeHtml(line.name)}
          <div class="muted" style="font-size:12px">
            (ID: ${this.escapeHtml(line.id)} - ${line.stops.length} paradas)
          </div>
        </div>
      `;
      card.addEventListener("click", () => onLineClick(line.id));
      linesList.appendChild(card);
    });
  }

  renderStops(line, query = "") {
    const { stopsContainer, currentLineName, currentLineInfo } = this.dom;
    if (!stopsContainer || !currentLineName || !currentLineInfo) return;

    stopsContainer.innerHTML = "";

    if (!line) {
      currentLineName.textContent = "Selecciona una línea";
      currentLineInfo.textContent = "Paradas de la línea";
      return;
    }

    currentLineName.textContent = `${line.name} (ID: ${line.id})`;
    currentLineInfo.textContent = `${line.stops.length} paradas`;

    line.stops
      .filter((stopName) => {
        if (!query) return true;
        return stopName.toLowerCase().includes(query);
      })
      .forEach((stopName) => {
        const item = document.createElement("div");
        item.className = "stop";
        item.innerHTML = `<div>${this.escapeHtml(stopName)}</div>`;
        stopsContainer.appendChild(item);
      });
  }

  getSearchQuery() {
    if (!this.dom.searchStop) return "";
    return String(this.dom.searchStop.value || "")
      .trim()
      .toLowerCase();
  }

  escapeHtml(value) {
    return String(value).replace(/[&<>\"']/g, (char) => {
      const map = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      };
      return map[char] || char;
    });
  }
}

class BusApp {
  constructor(config) {
    this.config = config;
    this.dom = new DomRefs();
    this.status = new StatusPresenter(this.dom.statusContainer);
    this.storage = new StorageService(this.config.storageKey, this.status);
    this.api = new EMTApi(this.config);
    this.view = new BusView(this.dom);

    this.lines = [];
    this.activeLineId = null;
    this.fetchingStops = false;
  }

  async init() {
    this.bindEvents();
    try {
      await this.fetchLinesFromWFS();
      await this.prefetchStopsSnapshot();
    } catch (error) {
      console.error("Inicio: error al cargar líneas", error);
    }
  }

  bindEvents() {
    if (this.dom.saveBtn) {
      this.dom.saveBtn.addEventListener("click", () => {
        this.storage.saveLines(this.lines);
      });
    }

    if (this.dom.clearBtn) {
      this.dom.clearBtn.addEventListener("click", () => {
        if (!confirm("Borrar datos locales (localStorage)?")) return;
        this.storage.clearLines();
        this.lines = [];
        this.activeLineId = null;
        this.render();
        this.status.show("Datos locales borrados", "ok");
      });
    }

    if (this.dom.searchStop) {
      this.dom.searchStop.addEventListener("input", () => this.renderStops());
    }

    if (this.dom.reloadBtn) {
      this.dom.reloadBtn.addEventListener("click", () => {
        this.fetchLinesFromWFS();
      });
    }
  }

  async fetchLinesFromWFS() {
    this.status.show("Intentando cargar líneas desde WFS (directo)...");
    try {
      const geoJson = await this.api.fetchLinesDirect();
      this.setLinesFromGeoJson(geoJson, "directo");
      return true;
    } catch (directError) {
      console.warn("Error fetch directo WFS", directError);
      this.status.show("Fetch directo falló: intentando proxy CORS...", "info");
    }

    try {
      const geoJsonProxy = await this.api.fetchLinesViaProxy();
      this.setLinesFromGeoJson(geoJsonProxy, "proxy");
      return true;
    } catch (proxyError) {
      console.error("Error fetch via proxy", proxyError);
    }

    const storedLines = this.storage.loadLines();
    if (storedLines.length) {
      this.lines = storedLines;
      this.activeLineId = this.lines[0].id;
      this.render();
      this.status.show(
        "WFS no disponible: cargadas líneas desde localStorage",
        "ok",
      );
      return false;
    }

    this.lines = [];
    this.activeLineId = null;
    this.render();
    this.status.show(
      "No se pudieron cargar líneas (WFS y proxy fallaron).",
      "err",
    );
    return false;
  }

  setLinesFromGeoJson(geoJson, sourceLabel) {
    if (!geoJson || !Array.isArray(geoJson.features)) {
      throw new Error("Respuesta WFS inválida: no hay features");
    }

    this.lines = geoJson.features.map((feature) => {
      const properties = feature.properties || {};
      const rawId =
        properties.ID_PUBLICO !== undefined && properties.ID_PUBLICO !== null
          ? properties.ID_PUBLICO
          : properties.ID ||
            properties.id ||
            properties.CODIGO ||
            this.createUid();
      const rawName =
        properties.NOMBRE_LINEA !== undefined &&
        properties.NOMBRE_LINEA !== null
          ? properties.NOMBRE_LINEA
          : properties.NOMBRE || properties.nombre || String(rawId);

      return {
        id: String(rawId),
        name: String(rawName),
        color: this.colorFromString(String(rawId)),
        stops: [],
      };
    });

    this.activeLineId = this.lines.length ? this.lines[0].id : null;
    this.storage.saveLines(this.lines);
    this.render();
    this.status.show(
      `Cargadas ${this.lines.length} líneas desde ${sourceLabel} (se usan ID_PUBLICO y NOMBRE_LINEA).`,
      "ok",
    );

    if (this.activeLineId) {
      this.selectLine(this.activeLineId);
    }
  }

  async prefetchStopsSnapshot() {
    try {
      const data = await this.api.fetchAllStopsSnapshot();
      this.storage.saveStopsSnapshot(this.config.storageStopsKey, data);
      console.log("Todas las paradas cargadas y guardadas en localStorage");
    } catch (error) {
      console.error("Error al cargar todas las paradas", error);
    }
  }

  render() {
    this.view.renderLines(this.lines, this.activeLineId, (lineId) => {
      this.selectLine(lineId);
    });
    this.renderStops();
  }

  renderStops() {
    const currentLine = this.lines.find(
      (line) => line.id === this.activeLineId,
    );
    this.view.renderStops(currentLine, this.view.getSearchQuery());
  }

  async selectLine(lineId) {
    if (!lineId) return;
    const exists = this.lines.some((line) => line.id === lineId);
    if (!exists) return;

    this.activeLineId = lineId;
    this.render();
    await this.loadStopsForLine(lineId);
  }

  async loadStopsForLine(lineId) {
    if (this.fetchingStops || !lineId) return;
    this.fetchingStops = true;
    this.status.show(`Cargando paradas para la línea ${lineId}...`);

    let stops = [];
    try {
      stops = await this.api.fetchStopsForLineDirect(lineId);
      this.status.show(
        `Paradas cargadas desde servidor (${stops.length} entradas)`,
        "ok",
      );
    } catch (directError) {
      console.warn("Error cargando paradas directo", directError);
      this.status.show(
        "Fetch directo de paradas falló: intentando proxy...",
        "info",
      );
      try {
        stops = await this.api.fetchStopsForLineViaProxy(lineId);
        this.status.show(
          `Paradas cargadas vía proxy (${stops.length} entradas)`,
          "ok",
        );
      } catch (proxyError) {
        console.error("Error fetch paradas via proxy", proxyError);
        this.status.show(
          `No se pudieron cargar paradas para la línea ${lineId}`,
          "err",
        );
        this.fetchingStops = false;
        return;
      }
    }

    const normalized = stops.map((item) => String(item).trim()).filter(Boolean);
    const target = this.lines.find((line) => line.id === lineId);
    if (target) {
      target.stops = normalized;
    }

    this.storage.saveLines(this.lines, { silent: true });
    this.render();
    this.fetchingStops = false;
  }

  getLinesSnapshot() {
    return JSON.parse(JSON.stringify(this.lines));
  }

  createUid(prefix = "L") {
    return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
  }

  colorFromString(value) {
    let hash = 0;
    for (let index = 0; index < value.length; index++) {
      hash = (hash << 5) - hash + value.charCodeAt(index);
    }
    const colorNum = (hash >>> 0) % 0xffffff;
    return `#${colorNum.toString(16).padStart(6, "0")}`;
  }
}

const app = new BusApp(APP_CONFIG);
app.init();

window.BusApp = {
  getLines: () => app.getLinesSnapshot(),
  fetchLinesFromWFS: () => app.fetchLinesFromWFS(),
  selectLine: (lineId) => app.selectLine(lineId),
};
