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
  storageStopsNormalizedKey: "emt_paradas_normalizadas_v1",
  storageStopLinesIndexKey: "emt_paradas_lineas_index_v1",
  firstRunFlagKey: "emt_first_run_done_v1",
  requestTimeoutMs: 10000,
  proxyTimeoutMs: 12000,
  stopLinesIndexConcurrency: 10,
};

class DomRefs {
  constructor() {
    this.menuView = document.getElementById("menuView");
    this.linesView = document.getElementById("linesView");
    this.stopsView = document.getElementById("stopsView");
    this.goLinesBtn = document.getElementById("goLinesBtn");
    this.goStopsBtn = document.getElementById("goStopsBtn");
    this.backFromLinesBtn = document.getElementById("backFromLinesBtn");
    this.backFromStopsBtn = document.getElementById("backFromStopsBtn");

    this.linesTableBody = document.getElementById("linesTableBody");
    this.stopsTableBody = document.getElementById("stopsTableBody");

    this.searchLine = document.getElementById("searchLine");
    this.searchStopName = document.getElementById("searchStopName");
    this.stopLineFilterBtn = document.getElementById("stopLineFilterBtn");
    this.stopLineFilterLabel = document.getElementById("stopLineFilterLabel");
    this.stopLineFilterPanel = document.getElementById("stopLineFilterPanel");
    this.stopLineFilterOptions = document.getElementById(
      "stopLineFilterOptions",
    );
    this.clearStopLineFiltersBtn = document.getElementById(
      "clearStopLineFiltersBtn",
    );
    this.stopsPrevPageBtn = document.getElementById("stopsPrevPageBtn");
    this.stopsNextPageBtn = document.getElementById("stopsNextPageBtn");
    this.stopsPageInfo = document.getElementById("stopsPageInfo");

    this.saveBtn = document.getElementById("saveBtn");
    this.clearBtn = document.getElementById("clearBtn");
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
    this.statusContainer.classList.remove("hidden");
    this.statusContainer.textContent = message;
    const baseClasses =
      "mt-4 rounded-2xl border px-3 py-2 text-sm font-medium transition";
    const stateClasses = {
      info: "border-sky-200/30 bg-sky-500/10 text-sky-100",
      ok: "border-emerald-200/30 bg-emerald-500/10 text-emerald-100",
      err: "border-rose-200/30 bg-rose-500/10 text-rose-100",
    };
    const safeType = stateClasses[type] ? type : "info";
    this.statusContainer.className = `${baseClasses} ${stateClasses[safeType]}`;
    console.log("[Status]", message);
  }
}

class LoadingPresenter {
  constructor() {
    this.overlay = document.createElement("div");
    this.overlay.className =
      "fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-slate-950/90 text-slate-100 backdrop-blur-sm";
    this.overlay.innerHTML = `
      <div class="h-12 w-12 animate-spin rounded-full border-4 border-cyan-300/25 border-t-cyan-300"></div>
      <p id="loadingMessage" class="text-sm tracking-wide text-slate-200">Cargando...</p>
    `;
    this.messageEl = this.overlay.querySelector("#loadingMessage");
  }

  show(message = "Cargando...") {
    if (this.messageEl) {
      this.messageEl.textContent = message;
    }
    if (!document.body.contains(this.overlay)) {
      document.body.appendChild(this.overlay);
    }
  }

  hide() {
    if (document.body.contains(this.overlay)) {
      this.overlay.remove();
    }
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

  loadStopsSnapshot(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (error) {
      console.error("No se pudo leer snapshot de paradas", error);
      return null;
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

  async fetchStopsForLineEntriesDirect(lineId) {
    const url = this.getStopsUrl(lineId);
    return this.fetchStopsEntriesFromUrl(url, this.config.requestTimeoutMs);
  }

  async fetchStopsForLineViaProxy(lineId) {
    const originalUrl = this.getStopsUrl(lineId);
    const proxyUrl = this.config.corsProxy + encodeURIComponent(originalUrl);
    return this.fetchStopsFromUrl(proxyUrl, this.config.proxyTimeoutMs);
  }

  async fetchStopsForLineEntriesViaProxy(lineId) {
    const originalUrl = this.getStopsUrl(lineId);
    const proxyUrl = this.config.corsProxy + encodeURIComponent(originalUrl);
    return this.fetchStopsEntriesFromUrl(proxyUrl, this.config.proxyTimeoutMs);
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

  async fetchStopsEntriesFromUrl(url, timeoutMs) {
    const response = await HttpClient.fetchWithTimeout(
      url,
      { cache: "no-store" },
      timeoutMs,
    );
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const rawText = await response.text();
    return this.parseStopsXmlEntries(rawText);
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

  parseStopsXmlEntries(xmlText) {
    try {
      const xml = new DOMParser().parseFromString(
        String(xmlText || "").trim(),
        "application/xml",
      );
      if (xml.getElementsByTagName("parsererror").length > 0) {
        return [];
      }

      const paradaNodes = xml.getElementsByTagName("parada");
      const entries = [];

      for (let index = 0; index < paradaNodes.length; index++) {
        const node = paradaNodes[index];
        const stopId =
          this.readXmlText(node, "id_parada") || this.readXmlText(node, "id");

        const lineNodes = node.getElementsByTagName("linea_parada");
        const lineIds = [];
        for (let lineIndex = 0; lineIndex < lineNodes.length; lineIndex++) {
          const value = String(lineNodes[lineIndex].textContent || "").trim();
          if (value) lineIds.push(value);
        }

        if (stopId) {
          entries.push({
            stopId: String(stopId).trim(),
            lineIds,
          });
        }
      }

      return entries;
    } catch (error) {
      console.warn("parseStopsXmlEntries failed", error);
      return [];
    }
  }

  readXmlText(parent, tagName) {
    const node = parent.getElementsByTagName(tagName)[0];
    return node ? String(node.textContent || "").trim() : "";
  }

  normalizeStopsGeoJson(geoJson) {
    if (!geoJson || !Array.isArray(geoJson.features)) return [];

    return geoJson.features
      .map((feature, index) => {
        const properties =
          feature && feature.properties ? feature.properties : {};
        const normalizedMap = this.buildNormalizedPropertyMap(properties);

        const stopId =
          this.pickFromNormalizedMap(normalizedMap, [
            "idparadas",
            "idparada",
            "id",
            "codigo",
            "codigoparada",
            "objectid",
            "gid",
            "fid",
            "idpublico",
          ]) ||
          this.findByKeyIncludes(normalizedMap, ["id", "parada"]) ||
          this.findByKeyIncludes(normalizedMap, ["codigo", "parada"]) ||
          (feature && feature.id
            ? this.normalizeFeatureId(feature.id)
            : null) ||
          `SIN-ID-${index + 1}`;

        const stopName =
          this.pickFromNormalizedMap(normalizedMap, [
            "nombreparada",
            "nombre",
            "denominacion",
            "descripcion",
            "parada",
            "name",
          ]) ||
          this.findByKeyIncludes(normalizedMap, ["nombre"]) ||
          "Parada sin nombre";

        let lineValue = this.pickFromNormalizedMap(normalizedMap, [
          "linea",
          "lineas",
          "linea1",
          "idlinea",
          "codlinea",
          "nlinea",
          "numerolinea",
          "ruta",
          "idpublicolinea",
        ]);

        if (lineValue === null) {
          lineValue = this.findByKeyIncludes(normalizedMap, ["linea"]);
        }

        if (lineValue === null) {
          lineValue = this.extractLineFromText(String(stopName));
        }

        const normalizedLine =
          lineValue === undefined ||
          lineValue === null ||
          String(lineValue).trim() === ""
            ? "-"
            : this.stringifyValue(lineValue);

        return {
          id: String(stopId),
          name: String(stopName),
          line: normalizedLine,
        };
      })
      .filter((stop) => stop.name || stop.id);
  }

  buildNormalizedPropertyMap(properties) {
    const map = {};
    const keys = Object.keys(properties || {});
    for (let index = 0; index < keys.length; index++) {
      const originalKey = keys[index];
      const normalizedKey = this.normalizeKey(originalKey);
      if (!normalizedKey) continue;
      map[normalizedKey] = properties[originalKey];
    }
    return map;
  }

  normalizeKey(key) {
    return String(key || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }

  pickFromNormalizedMap(map, aliases) {
    for (let index = 0; index < aliases.length; index++) {
      const alias = aliases[index];
      const value = map[alias];
      if (
        value !== undefined &&
        value !== null &&
        String(value).trim() !== ""
      ) {
        return value;
      }
    }
    return null;
  }

  findByKeyIncludes(map, requiredParts) {
    const keys = Object.keys(map || {});
    for (let index = 0; index < keys.length; index++) {
      const key = keys[index];
      const matchesAll = requiredParts.every((part) => key.includes(part));
      if (!matchesAll) continue;
      const value = map[key];
      if (
        value !== undefined &&
        value !== null &&
        String(value).trim() !== ""
      ) {
        return value;
      }
    }
    return null;
  }

  extractLineFromText(text) {
    const safeText = String(text || "");
    const lineRegex = /(?:linea|l)\s*([0-9]{1,3}[a-z]?)/i;
    const match = safeText.match(lineRegex);
    return match ? match[1] : null;
  }

  stringifyValue(value) {
    if (Array.isArray(value)) {
      return value.map((item) => String(item)).join(", ");
    }
    if (typeof value === "object") {
      try {
        return JSON.stringify(value);
      } catch (error) {
        return String(value);
      }
    }
    return String(value);
  }

  normalizeFeatureId(value) {
    const text = String(value || "").trim();
    const match = text.match(/\.(\d+)$/);
    return match ? match[1] : text;
  }

  pickFirst(obj, keys) {
    for (let index = 0; index < keys.length; index++) {
      const value = obj[keys[index]];
      if (
        value !== undefined &&
        value !== null &&
        String(value).trim() !== ""
      ) {
        return value;
      }
    }
    return null;
  }
}

class BusView {
  constructor(domRefs) {
    this.dom = domRefs;
  }

  renderLinesTable(lines, query, onLoadStops) {
    const { linesTableBody } = this.dom;
    if (!linesTableBody) return;

    const safeQuery = String(query || "")
      .trim()
      .toLowerCase();
    const filtered = lines.filter((line) => {
      if (!safeQuery) return true;
      return (
        String(line.id).toLowerCase().includes(safeQuery) ||
        String(line.name).toLowerCase().includes(safeQuery)
      );
    });

    linesTableBody.innerHTML = "";
    if (!filtered.length) {
      this.renderEmptyTableRow(linesTableBody, 4, "No hay líneas para mostrar");
      return;
    }

    filtered.forEach((line) => {
      const row = document.createElement("tr");
      row.className = "hover:bg-white/10";
      row.innerHTML = `
        <td class="px-4 py-3 font-semibold text-cyan-200">${this.escapeHtml(line.id)}</td>
        <td class="px-4 py-3 text-slate-100">${this.escapeHtml(line.name)}</td>
        <td class="px-4 py-3 text-slate-300">${line.stops.length}</td>
        <td class="px-4 py-3">
          <button data-line-id="${this.escapeHtml(line.id)}" class="load-stops-btn rounded-xl border border-cyan-300/30 bg-cyan-500/20 px-3 py-1.5 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-500/30">
            Cargar paradas
          </button>
        </td>
      `;

      const actionBtn = row.querySelector(".load-stops-btn");
      if (actionBtn) {
        actionBtn.addEventListener("click", () => onLoadStops(line.id));
      }

      linesTableBody.appendChild(row);
    });
  }

  renderStopsTable(
    stops,
    stopNameQuery,
    selectedLineIds = [],
    page = 1,
    pageSize = 25,
  ) {
    const { stopsTableBody } = this.dom;
    if (!stopsTableBody) return;

    const safeStopName = String(stopNameQuery || "")
      .trim()
      .toLowerCase();
    const selectedSet = new Set(
      Array.isArray(selectedLineIds)
        ? selectedLineIds.map((lineId) => String(lineId).trim()).filter(Boolean)
        : [],
    );

    const filtered = stops.filter((stop) => {
      const byName = !safeStopName
        ? true
        : String(stop.name).toLowerCase().includes(safeStopName);
      const stopLineValues = String(stop.line || "-")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      const byLine =
        selectedSet.size === 0
          ? true
          : stopLineValues.some((lineId) => selectedSet.has(lineId));
      return byName && byLine;
    });

    const totalItems = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const startIndex = (safePage - 1) * pageSize;
    const paginated = filtered.slice(startIndex, startIndex + pageSize);

    stopsTableBody.innerHTML = "";
    if (!totalItems) {
      this.renderEmptyTableRow(
        stopsTableBody,
        3,
        "No hay paradas para los filtros aplicados",
      );
      return {
        totalItems: 0,
        totalPages: 1,
        page: 1,
        from: 0,
        to: 0,
      };
    }

    paginated.forEach((stop) => {
      const row = document.createElement("tr");
      row.className = "hover:bg-white/10";
      row.innerHTML = `
        <td class="px-4 py-3 font-semibold text-fuchsia-200">${this.escapeHtml(stop.id)}</td>
        <td class="px-4 py-3 text-slate-100">${this.escapeHtml(stop.name)}</td>
        <td class="px-4 py-3 text-slate-300">${this.escapeHtml(stop.line)}</td>
      `;
      stopsTableBody.appendChild(row);
    });

    return {
      totalItems,
      totalPages,
      page: safePage,
      from: startIndex + 1,
      to: Math.min(startIndex + pageSize, totalItems),
    };
  }

  renderEmptyTableRow(tableBody, colSpan, message) {
    const row = document.createElement("tr");
    row.innerHTML = `<td colspan="${colSpan}" class="px-4 py-8 text-center text-sm text-slate-300/80">${this.escapeHtml(message)}</td>`;
    tableBody.appendChild(row);
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
    this.loading = new LoadingPresenter();
    this.storage = new StorageService(this.config.storageKey, this.status);
    this.api = new EMTApi(this.config);
    this.view = new BusView(this.dom);

    this.lines = [];
    this.allStops = [];
    this.stopLinesIndex = {};
    this.buildingStopLinesIndex = false;
    this.activeScreen = "menu";
    this.fetchingStops = false;
    this.stopsPage = 1;
    this.stopsPageSize = 25;
    this.selectedStopLineIds = new Set();
  }

  async init() {
    this.loading.show("Preparando aplicacion...");
    this.bindEvents();

    this.prepareFirstRun();

    try {
      this.loading.show("Cargando lineas y paradas...");
      await this.fetchLinesFromWFS();
      await this.prefetchStopsSnapshot();
      this.setScreen("menu");
    } catch (error) {
      console.error("Inicio: error al cargar líneas", error);
    } finally {
      this.loading.hide();
    }
  }

  prepareFirstRun() {
    const firstRunDone = localStorage.getItem(this.config.firstRunFlagKey);
    if (firstRunDone) return;

    localStorage.removeItem(this.config.storageKey);
    localStorage.removeItem(this.config.storageStopsKey);
    localStorage.removeItem(this.config.storageStopsNormalizedKey);
    localStorage.removeItem(this.config.storageStopLinesIndexKey);
    localStorage.setItem(this.config.firstRunFlagKey, "1");
  }

  bindEvents() {
    if (this.dom.goLinesBtn) {
      this.dom.goLinesBtn.addEventListener("click", () =>
        this.setScreen("lines"),
      );
    }

    if (this.dom.goStopsBtn) {
      this.dom.goStopsBtn.addEventListener("click", () =>
        this.setScreen("stops"),
      );
    }

    if (this.dom.backFromLinesBtn) {
      this.dom.backFromLinesBtn.addEventListener("click", () =>
        this.setScreen("menu"),
      );
    }

    if (this.dom.backFromStopsBtn) {
      this.dom.backFromStopsBtn.addEventListener("click", () =>
        this.setScreen("menu"),
      );
    }

    if (this.dom.saveBtn) {
      this.dom.saveBtn.addEventListener("click", () => {
        this.storage.saveLines(this.lines);
      });
    }

    if (this.dom.clearBtn) {
      this.dom.clearBtn.addEventListener("click", () => {
        if (!confirm("Borrar datos locales (localStorage)?")) return;
        this.storage.clearLines();
        localStorage.removeItem(this.config.storageStopsKey);
        localStorage.removeItem(this.config.storageStopsNormalizedKey);
        this.lines = [];
        this.allStops = [];
        this.stopLinesIndex = {};
        this.selectedStopLineIds.clear();
        this.updateStopLineFilterLabel();
        this.renderCurrentScreen();
        this.status.show("Datos locales borrados", "ok");
      });
    }

    if (this.dom.searchLine) {
      this.dom.searchLine.addEventListener("input", () => {
        if (this.activeScreen === "lines") this.renderLinesScreen();
      });
    }

    if (this.dom.searchStopName) {
      this.dom.searchStopName.addEventListener("input", () => {
        this.stopsPage = 1;
        if (this.activeScreen === "stops") this.renderStopsScreen();
      });
    }

    if (this.dom.stopLineFilterBtn) {
      this.dom.stopLineFilterBtn.addEventListener("click", () => {
        const isHidden = this.dom.stopLineFilterPanel
          ? this.dom.stopLineFilterPanel.classList.contains("hidden")
          : true;
        if (isHidden) {
          this.openStopLineFilterPanel();
        } else {
          this.closeStopLineFilterPanel();
        }
      });
    }

    if (this.dom.clearStopLineFiltersBtn) {
      this.dom.clearStopLineFiltersBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        this.selectedStopLineIds.clear();
        this.syncStopLineCheckboxes();
        this.updateStopLineFilterLabel();
        this.stopsPage = 1;
        if (this.activeScreen === "stops") this.renderStopsScreen();
      });
    }

    document.addEventListener("click", (event) => {
      if (!this.dom.stopLineFilterPanel || !this.dom.stopLineFilterBtn) return;
      const panel = this.dom.stopLineFilterPanel;
      const button = this.dom.stopLineFilterBtn;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panel.contains(target) || button.contains(target)) return;
      this.closeStopLineFilterPanel();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        this.closeStopLineFilterPanel();
      }
    });
  }

  renderStopLineFilterOptions() {
    const optionsContainer = this.dom.stopLineFilterOptions;
    if (!optionsContainer) return;

    const sortedLineIds = this.lines
      .map((line) => String(line.id).trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "es", { numeric: true }));

    optionsContainer.innerHTML = "";
    if (!sortedLineIds.length) {
      const emptyText = document.createElement("p");
      emptyText.className = "px-2 py-3 text-xs text-slate-300/80";
      emptyText.textContent = "No hay lineas disponibles";
      optionsContainer.appendChild(emptyText);
      return;
    }

    sortedLineIds.forEach((lineId) => {
      const item = document.createElement("label");
      item.className =
        "flex cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 text-sm text-slate-100 transition hover:bg-white/10";
      item.innerHTML = `
        <input type="checkbox" value="${this.view.escapeHtml(lineId)}" class="h-4 w-4 rounded border-white/30 bg-slate-800 text-fuchsia-300 focus:ring-fuchsia-400/50" />
        <span>Linea ${this.view.escapeHtml(lineId)}</span>
      `;

      const checkbox = item.querySelector("input[type='checkbox']");
      if (checkbox) {
        checkbox.checked = this.selectedStopLineIds.has(lineId);
        checkbox.addEventListener("change", () => {
          if (checkbox.checked) {
            this.selectedStopLineIds.add(lineId);
          } else {
            this.selectedStopLineIds.delete(lineId);
          }
          this.updateStopLineFilterLabel();
          this.stopsPage = 1;
          if (this.activeScreen === "stops") this.renderStopsScreen();
        });
      }

      optionsContainer.appendChild(item);
    });
  }

  syncStopLineCheckboxes() {
    const optionsContainer = this.dom.stopLineFilterOptions;
    if (!optionsContainer) return;
    const checkboxes = optionsContainer.querySelectorAll(
      "input[type='checkbox']",
    );
    checkboxes.forEach((checkbox) => {
      const lineId = String(checkbox.value || "").trim();
      checkbox.checked = this.selectedStopLineIds.has(lineId);
    });
  }

  updateStopLineFilterLabel() {
    if (!this.dom.stopLineFilterLabel) return;
    const selectedCount = this.selectedStopLineIds.size;
    if (!selectedCount) {
      this.dom.stopLineFilterLabel.textContent = "Todas las lineas";
      return;
    }

    if (selectedCount <= 2) {
      const selected = Array.from(this.selectedStopLineIds).sort((a, b) =>
        a.localeCompare(b, "es", { numeric: true }),
      );
      this.dom.stopLineFilterLabel.textContent = `Lineas: ${selected.join(", ")}`;
      return;
    }

    this.dom.stopLineFilterLabel.textContent = `${selectedCount} lineas seleccionadas`;
  }

  openStopLineFilterPanel() {
    if (!this.dom.stopLineFilterPanel) return;
    this.dom.stopLineFilterPanel.classList.remove("hidden");
    if (this.dom.stopLineFilterBtn) {
      this.dom.stopLineFilterBtn.setAttribute("aria-expanded", "true");
    }
  }

  closeStopLineFilterPanel() {
    if (!this.dom.stopLineFilterPanel) return;
    this.dom.stopLineFilterPanel.classList.add("hidden");
    if (this.dom.stopLineFilterBtn) {
      this.dom.stopLineFilterBtn.setAttribute("aria-expanded", "false");
    }

    if (this.dom.stopsPrevPageBtn) {
      this.dom.stopsPrevPageBtn.addEventListener("click", () => {
        if (this.stopsPage <= 1) return;
        this.stopsPage -= 1;
        this.renderStopsScreen();
      });
    }

    if (this.dom.stopsNextPageBtn) {
      this.dom.stopsNextPageBtn.addEventListener("click", () => {
        this.stopsPage += 1;
        this.renderStopsScreen();
      });
    }

    if (this.dom.reloadBtn) {
      this.dom.reloadBtn.addEventListener("click", () => {
        this.stopLinesIndex = {};
        localStorage.removeItem(this.config.storageStopLinesIndexKey);
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
      this.renderCurrentScreen();
      this.status.show(
        "WFS no disponible: cargadas líneas desde localStorage",
        "ok",
      );
      return false;
    }

    this.lines = [];
    this.renderCurrentScreen();
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

    this.storage.saveLines(this.lines);
    this.stopLinesIndex = {};
    localStorage.removeItem(this.config.storageStopLinesIndexKey);
    this.renderCurrentScreen();
    this.status.show(
      `Cargadas ${this.lines.length} líneas desde ${sourceLabel} (se usan ID_PUBLICO y NOMBRE_LINEA).`,
      "ok",
    );
  }

  async prefetchStopsSnapshot() {
    try {
      const geoJson = await this.api.fetchAllStopsSnapshot();
      const normalized = this.api.normalizeStopsGeoJson(geoJson);
      this.allStops = normalized;
      const cachedIndex = this.storage.loadStopsSnapshot(
        this.config.storageStopLinesIndexKey,
      );
      this.stopLinesIndex = this.isNonEmptyObject(cachedIndex)
        ? cachedIndex
        : {};
      this.applyStopLinesIndex();
      this.storage.saveStopsSnapshot(this.config.storageStopsKey, geoJson);
      this.storage.saveStopsSnapshot(
        this.config.storageStopsNormalizedKey,
        normalized,
      );
      console.log("Todas las paradas cargadas y guardadas en localStorage");
    } catch (error) {
      console.error("Error al cargar todas las paradas", error);
      const cachedNormalized = this.storage.loadStopsSnapshot(
        this.config.storageStopsNormalizedKey,
      );
      if (Array.isArray(cachedNormalized)) {
        this.allStops = cachedNormalized;
        const cachedIndex = this.storage.loadStopsSnapshot(
          this.config.storageStopLinesIndexKey,
        );
        this.stopLinesIndex = this.isNonEmptyObject(cachedIndex)
          ? cachedIndex
          : {};
        this.applyStopLinesIndex();
        this.status.show(
          "Paradas cargadas desde cache local por fallo de red",
          "info",
        );
      } else {
        const cachedRaw = this.storage.loadStopsSnapshot(
          this.config.storageStopsKey,
        );
        if (cachedRaw && Array.isArray(cachedRaw.features)) {
          this.allStops = this.api.normalizeStopsGeoJson(cachedRaw);
          const cachedIndex = this.storage.loadStopsSnapshot(
            this.config.storageStopLinesIndexKey,
          );
          this.stopLinesIndex = this.isNonEmptyObject(cachedIndex)
            ? cachedIndex
            : {};
          this.applyStopLinesIndex();
          this.storage.saveStopsSnapshot(
            this.config.storageStopsNormalizedKey,
            this.allStops,
          );
          this.status.show("Paradas reconstruidas desde cache local", "info");
        }
      }
    }

    this.renderCurrentScreen();
  }

  setScreen(screen) {
    this.activeScreen = screen;

    if (this.dom.menuView) {
      this.dom.menuView.classList.toggle("hidden", screen !== "menu");
    }
    if (this.dom.linesView) {
      this.dom.linesView.classList.toggle("hidden", screen !== "lines");
    }
    if (this.dom.stopsView) {
      this.dom.stopsView.classList.toggle("hidden", screen !== "stops");
    }

    if (screen === "stops") {
      this.stopsPage = 1;
      this.renderStopLineFilterOptions();
      this.updateStopLineFilterLabel();
    }

    this.renderCurrentScreen();
  }

  renderCurrentScreen() {
    if (this.activeScreen === "lines") {
      this.renderLinesScreen();
      return;
    }
    if (this.activeScreen === "stops") {
      this.renderStopsScreen();
    }
  }

  renderLinesScreen() {
    const search = this.dom.searchLine ? this.dom.searchLine.value : "";
    this.view.renderLinesTable(this.lines, search, (lineId) => {
      this.loadStopsForLine(lineId);
    });
  }

  renderStopsScreen() {
    this.ensureStopLinesIndex();

    const stopName = this.dom.searchStopName
      ? this.dom.searchStopName.value
      : "";
    const selectedLineIds = Array.from(this.selectedStopLineIds);
    const pageMeta = this.view.renderStopsTable(
      this.allStops,
      stopName,
      selectedLineIds,
      this.stopsPage,
      this.stopsPageSize,
    );
    this.updateStopsPagination(pageMeta);
  }

  applyStopLinesIndex() {
    if (!Array.isArray(this.allStops) || !this.allStops.length) return;
    const index = this.stopLinesIndex || {};
    this.allStops = this.allStops.map((stop) => {
      const key = String(stop.id || "").trim();
      const mappedLine = index[key];
      return {
        ...stop,
        line:
          mappedLine && String(mappedLine).trim() !== ""
            ? String(mappedLine)
            : stop.line || "-",
      };
    });
  }

  async ensureStopLinesIndex() {
    if (this.buildingStopLinesIndex) return;
    if (!this.lines.length || !this.allStops.length) return;

    const hasAnyMappedLine = this.allStops.some(
      (stop) => String(stop.line || "").trim() !== "-",
    );
    if (hasAnyMappedLine && Object.keys(this.stopLinesIndex || {}).length > 0) {
      return;
    }

    const cachedIndex = this.storage.loadStopsSnapshot(
      this.config.storageStopLinesIndexKey,
    );
    if (this.isNonEmptyObject(cachedIndex)) {
      this.stopLinesIndex = cachedIndex;
      this.applyStopLinesIndex();
      return;
    }

    this.buildingStopLinesIndex = true;
    this.status.show("Calculando líneas por parada...", "info");

    try {
      const stopLines = {};
      const lineQueue = this.lines.map((line) => String(line.id));
      const workerCount = Math.max(
        1,
        Math.min(this.config.stopLinesIndexConcurrency || 10, lineQueue.length),
      );
      let processed = 0;
      let nextProgressAt = 20;
      let lastRenderMs = 0;

      const mergeLineEntries = (entries, fallbackLineId) => {
        entries.forEach((entry) => {
          const stopId = String(
            entry && entry.stopId ? entry.stopId : "",
          ).trim();
          if (!stopId) return;

          if (!stopLines[stopId]) {
            stopLines[stopId] = new Set();
          }

          const lineIds = Array.isArray(entry && entry.lineIds)
            ? entry.lineIds
            : [];
          if (lineIds.length) {
            lineIds.forEach((lineId) => {
              const clean = String(lineId || "").trim();
              if (clean) stopLines[stopId].add(clean);
            });
            return;
          }

          stopLines[stopId].add(String(fallbackLineId));
        });
      };

      const worker = async () => {
        while (lineQueue.length) {
          const lineId = lineQueue.shift();
          if (!lineId) continue;

          const entries = await this.fetchStopsForLineEntriesData(lineId);
          mergeLineEntries(entries, lineId);
          processed += 1;

          if (processed >= nextProgressAt) {
            this.status.show(
              `Calculando líneas por parada... ${processed}/${this.lines.length}`,
              "info",
            );
            nextProgressAt += 20;
          }

          const now = Date.now();
          if (this.activeScreen === "stops" && now - lastRenderMs > 900) {
            this.stopLinesIndex = this.flattenStopLinesIndex(stopLines);
            this.applyStopLinesIndex();
            this.renderStopsScreen();
            lastRenderMs = now;
          }
        }
      };

      const workers = Array.from({ length: workerCount }, () => worker());
      await Promise.all(workers);

      const flatIndex = this.flattenStopLinesIndex(stopLines);
      if (!this.isNonEmptyObject(flatIndex)) {
        throw new Error("Indice vacio tras procesar lineas");
      }

      this.stopLinesIndex = flatIndex;
      this.storage.saveStopsSnapshot(
        this.config.storageStopLinesIndexKey,
        flatIndex,
      );
      this.applyStopLinesIndex();
      this.renderStopsScreen();
      this.status.show("Líneas por parada calculadas", "ok");
    } catch (error) {
      console.error(
        "No se pudo calcular el indice de lineas por parada",
        error,
      );
      this.status.show(
        "No se pudo calcular la línea de algunas paradas",
        "err",
      );
    } finally {
      this.buildingStopLinesIndex = false;
    }
  }

  async fetchStopsForLineData(lineId) {
    try {
      return await this.api.fetchStopsForLineDirect(lineId);
    } catch (directError) {
      console.warn(
        "Error en fetch directo de paradas para indice",
        directError,
      );
      try {
        return await this.api.fetchStopsForLineViaProxy(lineId);
      } catch (proxyError) {
        console.warn("Error en fetch proxy de paradas para indice", proxyError);
        return [];
      }
    }
  }

  async fetchStopsForLineEntriesData(lineId) {
    try {
      return await this.api.fetchStopsForLineEntriesDirect(lineId);
    } catch (directError) {
      console.warn(
        "Error en fetch directo de entradas de paradas para indice",
        directError,
      );
      try {
        return await this.api.fetchStopsForLineEntriesViaProxy(lineId);
      } catch (proxyError) {
        console.warn(
          "Error en fetch proxy de entradas de paradas para indice",
          proxyError,
        );
        return [];
      }
    }
  }

  flattenStopLinesIndex(stopLines) {
    const flatIndex = {};
    Object.keys(stopLines).forEach((stopId) => {
      flatIndex[stopId] = Array.from(stopLines[stopId]).sort().join(", ");
    });
    return flatIndex;
  }

  extractStopIdFromStopLabel(label) {
    const text = String(label || "").trim();
    const withParens = text.match(/\(([^)]+)\)\s*$/);
    if (withParens && withParens[1]) {
      return String(withParens[1]).trim();
    }
    const fromEndDigits = text.match(/(\d+)\s*$/);
    return fromEndDigits ? fromEndDigits[1] : null;
  }

  isNonEmptyObject(value) {
    return (
      !!value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length > 0
    );
  }

  updateStopsPagination(pageMeta) {
    const safeMeta = pageMeta || {
      totalItems: 0,
      totalPages: 1,
      page: 1,
      from: 0,
      to: 0,
    };
    this.stopsPage = safeMeta.page;

    if (this.dom.stopsPageInfo) {
      if (!safeMeta.totalItems) {
        this.dom.stopsPageInfo.textContent = "Sin resultados";
      } else {
        this.dom.stopsPageInfo.textContent = `Mostrando ${safeMeta.from}-${safeMeta.to} de ${safeMeta.totalItems} · Pagina ${safeMeta.page} de ${safeMeta.totalPages}`;
      }
    }

    if (this.dom.stopsPrevPageBtn) {
      const disabled = safeMeta.page <= 1;
      this.dom.stopsPrevPageBtn.disabled = disabled;
      this.dom.stopsPrevPageBtn.classList.toggle("opacity-40", disabled);
      this.dom.stopsPrevPageBtn.classList.toggle(
        "cursor-not-allowed",
        disabled,
      );
    }

    if (this.dom.stopsNextPageBtn) {
      const disabled = safeMeta.page >= safeMeta.totalPages;
      this.dom.stopsNextPageBtn.disabled = disabled;
      this.dom.stopsNextPageBtn.classList.toggle("opacity-40", disabled);
      this.dom.stopsNextPageBtn.classList.toggle(
        "cursor-not-allowed",
        disabled,
      );
    }
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
    this.renderLinesScreen();
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
  loadStopsForLine: (lineId) => app.loadStopsForLine(lineId),
  showMenu: () => app.setScreen("menu"),
  showLines: () => app.setScreen("lines"),
  showStops: () => app.setScreen("stops"),
};
