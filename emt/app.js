import { DomRefs, StatusPresenter, LoadingPresenter, BusView } from "./ui.js";
import { StorageService, EMTApi } from "./services.js";
import { LeafletMapManager } from "./map-manager.js";

export class BusApp {
  constructor(config) {
    this.config = config;
    this.dom = new DomRefs();
    this.status = new StatusPresenter(this.dom.statusContainer);
    this.loading = new LoadingPresenter();
    this.storage = new StorageService(this.config.storageKey, this.status);
    this.api = new EMTApi(this.config);
    this.view = new BusView(this.dom);
    this.mapManager = new LeafletMapManager(
      this.status,
      (value) => this.view.escapeHtml(value),
      (stopId) => this.fetchStopArrivalsData(stopId),
    );

    this.lines = [];
    this.allStops = [];
    this.stopLinesIndex = {};
    this.stopDirectionsIndex = {};
    this.buildingStopLinesIndex = false;
    this.activeScreen = "menu";
    this.fetchingStops = false;
    this.stopsPage = 1;
    this.stopsPageSize = 25;
    this.selectedStopLineIds = new Set();
    this.expandedStopId = null;
    this.expandedLineId = null;
    this.stopArrivalsRequestToken = 0;
    this.stopMapOverlayEl = null;
    this.stopMapTitleEl = null;
    this.stopMapContainerEl = null;
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
    localStorage.removeItem(this.config.storageStopDirectionsIndexKey);
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

    if (this.dom.linesBackIosBtn) {
      this.dom.linesBackIosBtn.addEventListener("click", () =>
        this.setScreen("menu"),
      );
    }

    if (this.dom.linesMenuToMenuBtn) {
      this.dom.linesMenuToMenuBtn.addEventListener("click", () =>
        this.setScreen("menu"),
      );
    }

    if (this.dom.linesMenuToStopsBtn) {
      this.dom.linesMenuToStopsBtn.addEventListener("click", () =>
        this.setScreen("stops"),
      );
    }

    if (this.dom.stopsBackIosBtn) {
      this.dom.stopsBackIosBtn.addEventListener("click", () =>
        this.setScreen("menu"),
      );
    }

    if (this.dom.stopsMenuToMenuBtn) {
      this.dom.stopsMenuToMenuBtn.addEventListener("click", () =>
        this.setScreen("menu"),
      );
    }

    if (this.dom.stopsMenuToLinesBtn) {
      this.dom.stopsMenuToLinesBtn.addEventListener("click", () =>
        this.setScreen("lines"),
      );
    }

    if (this.dom.searchLine) {
      this.dom.searchLine.addEventListener("input", () => {
        this.updateSearchClearButtons();
        if (this.activeScreen === "lines") this.renderLinesScreen();
      });
    }

    if (this.dom.clearSearchLineBtn && this.dom.searchLine) {
      this.dom.clearSearchLineBtn.addEventListener("click", () => {
        this.dom.searchLine.value = "";
        this.updateSearchClearButtons();
        if (this.activeScreen === "lines") this.renderLinesScreen();
        this.dom.searchLine.focus();
      });
    }

    if (this.dom.searchStopName) {
      this.dom.searchStopName.addEventListener("input", () => {
        this.stopsPage = 1;
        this.updateSearchClearButtons();
        if (this.activeScreen === "stops") this.renderStopsScreen();
      });
    }

    if (this.dom.clearSearchStopNameBtn && this.dom.searchStopName) {
      this.dom.clearSearchStopNameBtn.addEventListener("click", () => {
        this.dom.searchStopName.value = "";
        this.stopsPage = 1;
        this.updateSearchClearButtons();
        if (this.activeScreen === "stops") this.renderStopsScreen();
        this.dom.searchStopName.focus();
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

    this.updateSearchClearButtons();
  }

  updateSearchClearButtons() {
    if (this.dom.clearSearchLineBtn && this.dom.searchLine) {
      const show = String(this.dom.searchLine.value || "").trim() !== "";
      this.dom.clearSearchLineBtn.classList.toggle("hidden", !show);
    }

    if (this.dom.clearSearchStopNameBtn && this.dom.searchStopName) {
      const show = String(this.dom.searchStopName.value || "").trim() !== "";
      this.dom.clearSearchStopNameBtn.classList.toggle("hidden", !show);
    }
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
    this.stopDirectionsIndex = {};
    localStorage.removeItem(this.config.storageStopLinesIndexKey);
    localStorage.removeItem(this.config.storageStopDirectionsIndexKey);
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
      const cachedDirections = this.storage.loadStopsSnapshot(
        this.config.storageStopDirectionsIndexKey,
      );
      this.stopLinesIndex = this.isNonEmptyObject(cachedIndex)
        ? cachedIndex
        : {};
      this.stopDirectionsIndex = this.isNonEmptyObject(cachedDirections)
        ? cachedDirections
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
        const cachedDirections = this.storage.loadStopsSnapshot(
          this.config.storageStopDirectionsIndexKey,
        );
        this.stopLinesIndex = this.isNonEmptyObject(cachedIndex)
          ? cachedIndex
          : {};
        this.stopDirectionsIndex = this.isNonEmptyObject(cachedDirections)
          ? cachedDirections
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
          const cachedDirections = this.storage.loadStopsSnapshot(
            this.config.storageStopDirectionsIndexKey,
          );
          this.stopLinesIndex = this.isNonEmptyObject(cachedIndex)
            ? cachedIndex
            : {};
          this.stopDirectionsIndex = this.isNonEmptyObject(cachedDirections)
            ? cachedDirections
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
    this.closeStopMapPage();

    if (screen !== "lines") {
      this.expandedLineId = null;
    }

    if (screen !== "stops") {
      this.expandedStopId = null;
      this.destroyLeafletMap();
    }

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
    this.view.renderLinesTable(
      this.lines,
      search,
      this.expandedLineId,
      this.fetchingStops,
      (line) => this.toggleLineStops(line),
    );
  }

  async toggleLineStops(line) {
    const lineId = String(line && line.id ? line.id : "").trim();
    if (!lineId) return;

    if (this.expandedLineId === lineId) {
      this.expandedLineId = null;
      this.renderLinesScreen();
      return;
    }

    this.expandedLineId = lineId;
    this.renderLinesScreen();

    const target = this.lines.find((item) => String(item.id) === lineId);
    const hasStops = !!(
      target &&
      Array.isArray(target.stops) &&
      target.stops.length
    );

    if (hasStops || this.fetchingStops) return;

    await this.loadStopsForLine(lineId);
    if (this.activeScreen === "lines") {
      this.renderLinesScreen();
    }
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
      this.expandedStopId,
      (stop) => this.toggleStopMap(stop),
      (stop) => this.openStopMapPage(stop),
    );
    this.updateStopsPagination(pageMeta);
    this.destroyLeafletMap();
    this.renderExpandedStopArrivals(pageMeta ? pageMeta.expandedMap : null);
  }

  toggleStopMap(stop) {
    const stopId = stop && stop.id ? String(stop.id) : "";
    if (!stopId) return;

    if (String(this.expandedStopId || "") === stopId) {
      this.expandedStopId = null;
      this.destroyLeafletMap();
      this.renderStopsScreen();
      return;
    }

    this.expandedStopId = stopId;
    this.renderStopsScreen();
  }

  renderExpandedStopMap(expandedMap) {
    const payload = this.buildExpandedMapPayload(expandedMap);
    this.mapManager.render(payload);
    this.renderExpandedStopArrivals(payload);
  }

  async openStopMapPage(stop) {
    const lat = Number(stop && stop.lat);
    const lon = Number(stop && stop.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      this.status.show("No hay coordenadas para mostrar el mapa", "err");
      return;
    }

    await this.ensureStopLinesIndex();

    this.ensureStopMapOverlay();
    if (!this.stopMapOverlayEl || !this.stopMapContainerEl) return;

    this.stopMapOverlayEl.classList.remove("hidden");
    document.body.classList.add("overflow-hidden");

    if (this.stopMapTitleEl) {
      const safeName = String(stop && stop.name ? stop.name : "Parada");
      const safeId = String(stop && stop.id ? stop.id : "");
      this.stopMapTitleEl.textContent = safeId
        ? `${safeName} (${safeId})`
        : safeName;
    }

    const mapContainerId = this.stopMapContainerEl.id;
    const mapRoutePanelId = "stopMapRoutePanel";
    const payload = this.buildExpandedMapPayload({
      stop,
      mapContainerId,
      mapRoutePanelId,
      routeSummaryId: "",
    });
    this.mapManager.render(payload);
  }

  ensureStopMapOverlay() {
    if (this.stopMapOverlayEl) return;

    const overlay = document.createElement("div");
    overlay.className = "fixed inset-0 z-[1200] hidden bg-slate-950";

    const topBar = document.createElement("div");
    topBar.className =
      "flex h-14 items-center gap-3 border-b border-white/20 bg-slate-900/95 px-3 text-slate-100";

    const backBtn = document.createElement("button");
    backBtn.type = "button";
    backBtn.className =
      "rounded-xl border border-white/25 bg-white/10 px-3 py-1.5 text-sm font-semibold text-slate-100 transition hover:bg-white/15";
    backBtn.textContent = "‹ Atras";
    backBtn.addEventListener("click", () => this.closeStopMapPage());

    const title = document.createElement("div");
    title.className = "truncate text-sm font-semibold";
    title.textContent = "Mapa";

    topBar.appendChild(backBtn);
    topBar.appendChild(title);

    const mapContainer = document.createElement("div");
    mapContainer.id = "stopMapLeafletContainer";
    mapContainer.className = "h-[calc(100%-56px)] w-full";

    overlay.appendChild(topBar);
    overlay.appendChild(mapContainer);
    document.body.appendChild(overlay);

    this.stopMapOverlayEl = overlay;
    this.stopMapTitleEl = title;
    this.stopMapContainerEl = mapContainer;
  }

  closeStopMapPage() {
    this.destroyLeafletMap();

    if (this.stopMapOverlayEl) {
      this.stopMapOverlayEl.classList.add("hidden");
    }

    document.body.classList.remove("overflow-hidden");
  }

  async renderExpandedStopArrivals(expandedMap) {
    if (!expandedMap || !expandedMap.stop || !expandedMap.stopArrivalsId)
      return;

    const stopId = String(expandedMap.stop.id || "").trim();
    if (!stopId) return;

    const panel = document.getElementById(expandedMap.stopArrivalsId);
    if (!panel) return;

    const currentRequestToken = ++this.stopArrivalsRequestToken;
    panel.textContent = "Proximos buses: consultando...";
    this.applyStopArrivalsPanelState(panel, "loading");

    let arrivals = [];
    try {
      arrivals = await this.fetchStopArrivalsData(stopId);
    } catch (error) {
      console.warn("No se pudieron obtener llegadas de la parada", error);
    }

    if (currentRequestToken !== this.stopArrivalsRequestToken) return;
    const arrivalsView = this.buildStopArrivalsView(arrivals);
    this.renderStopArrivalsPanel(panel, arrivalsView);
    this.applyStopArrivalsPanelState(panel, arrivalsView.variant);
  }

  async fetchStopArrivalsData(stopId) {
    try {
      return await this.api.fetchStopArrivalsDirect(stopId);
    } catch (directError) {
      console.warn("Llegadas directo fallaron", directError);
    }

    try {
      return await this.api.fetchStopArrivalsViaProxy(stopId);
    } catch (proxyError) {
      console.warn("Llegadas por proxy fallaron", proxyError);
    }

    return [];
  }

  buildStopArrivalsView(arrivals) {
    const safeArrivals = Array.isArray(arrivals) ? arrivals.slice(0, 6) : [];
    const visibleArrivals = safeArrivals.filter((item) => {
      if (this.isServiceNoticeArrival(item)) return false;
      if (this.isZeroMinuteNoticeArrival(item)) return false;
      if (this.isNoticeArrival(item)) return false;
      return true;
    });
    if (!visibleArrivals.length) {
      return {
        title: "Proximos buses",
        rows: [
          {
            label: "Estado",
            value: "No disponibles para esta parada en este momento.",
          },
        ],
        variant: "neutral",
      };
    }

    const rows = this.groupArrivalsByLine(visibleArrivals);
    if (!rows.length) {
      return {
        title: "Proximos buses",
        rows: [
          {
            label: "Estado",
            value: "No disponibles para esta parada en este momento.",
          },
        ],
        variant: "neutral",
      };
    }

    return {
      title: "Proximos buses",
      rows,
      variant: "ok",
    };
  }

  groupArrivalsByLine(arrivals) {
    const grouped = new Map();

    arrivals.forEach((arrival) => {
      if (!arrival || typeof arrival !== "object") return;

      const lineId = String(arrival.lineId || "").trim();
      if (!lineId) return;

      const destination = String(arrival.destination || "").trim();
      const timeLabel = String(arrival.timeLabel || "").trim();
      const minutes = Number(arrival.minutes);
      const waitText = Number.isFinite(minutes)
        ? `${minutes} min`
        : timeLabel || "sin tiempo";

      const key = lineId;
      const rowLabel = `L${lineId}`;

      if (!grouped.has(key)) {
        grouped.set(key, {
          label: rowLabel,
          values: [],
        });
      }

      const value = destination ? `${waitText} (${destination})` : waitText;
      grouped.get(key).values.push(value);
    });

    return Array.from(grouped.values()).map((entry) => ({
      label: entry.label,
      value: entry.values.join(", "),
    }));
  }

  renderStopArrivalsPanel(panel, arrivalsView) {
    if (!panel || !arrivalsView) return;

    panel.replaceChildren();

    const titleEl = document.createElement("div");
    titleEl.className = "mb-1 font-semibold tracking-wide";
    titleEl.textContent = String(arrivalsView.title || "Proximos buses");
    panel.appendChild(titleEl);

    const rows = Array.isArray(arrivalsView.rows)
      ? arrivalsView.rows.filter((row) => !this.isNoticeRow(row))
      : [];
    if (!rows.length) {
      const emptyEl = document.createElement("div");
      emptyEl.textContent = "Sin datos";
      panel.appendChild(emptyEl);
      return;
    }

    rows.forEach((row) => {
      const rowEl = document.createElement("div");
      rowEl.className = "mb-0.5 flex flex-wrap gap-x-2";

      const labelEl = document.createElement("span");
      labelEl.className = "font-semibold";
      labelEl.textContent = `${String(row.label || "Linea")}:`;

      const valueEl = document.createElement("span");
      valueEl.textContent = String(row.value || "-");

      rowEl.appendChild(labelEl);
      rowEl.appendChild(valueEl);
      panel.appendChild(rowEl);
    });
  }

  isServiceNoticeArrival(arrival) {
    if (!arrival || typeof arrival !== "object") return false;

    const lineId = String(arrival.lineId || "").trim();
    const minutes = Number(arrival.minutes);
    const label = String(arrival.timeLabel || "").trim();

    return !lineId && !Number.isFinite(minutes) && !!label;
  }

  isNoticeArrival(arrival) {
    if (!arrival || typeof arrival !== "object") return false;

    const lineId = String(arrival.lineId || "").trim();
    const destination = String(arrival.destination || "").trim();
    const label = String(arrival.timeLabel || "").trim();
    const noticeText = `${lineId} ${destination} ${label}`.toLowerCase();
    return this.hasNoticeKeyword(noticeText);
  }

  isNoticeRow(row) {
    if (!row || typeof row !== "object") return false;
    const label = String(row.label || "")
      .trim()
      .toLowerCase();
    const value = String(row.value || "")
      .trim()
      .toLowerCase();
    return this.hasNoticeKeyword(`${label} ${value}`);
  }

  isZeroMinuteNoticeArrival(arrival) {
    if (!arrival || typeof arrival !== "object") return false;

    const lineId = String(arrival.lineId || "").trim();
    const destination = String(arrival.destination || "").trim();
    const minutes = Number(arrival.minutes);
    const label = String(arrival.timeLabel || "").trim();

    if (!Number.isFinite(minutes) || minutes !== 0) return false;

    const noticeText = `${lineId} ${destination} ${label}`.toLowerCase();

    if (!lineId) return true;
    return this.hasNoticeKeyword(noticeText);
  }

  hasNoticeKeyword(text) {
    const safeText = String(text || "").toLowerCase();
    const noticeKeywords = [
      "aviso",
      "incidenc",
      "sin servicio",
      "no disponible",
      "error",
      "fuera de servicio",
    ];
    return noticeKeywords.some((keyword) => safeText.includes(keyword));
  }

  applyStopArrivalsPanelState(panel, variant) {
    if (!panel || !panel.classList) return;

    panel.classList.remove(
      "border-white/15",
      "bg-slate-900/35",
      "text-slate-200",
      "border-amber-300/45",
      "bg-amber-500/15",
      "text-amber-100",
      "border-emerald-300/35",
      "bg-emerald-500/15",
      "text-emerald-100",
      "border-cyan-300/35",
      "bg-cyan-500/15",
      "text-cyan-100",
    );

    if (variant === "warning") {
      panel.classList.add(
        "border-amber-300/45",
        "bg-amber-500/15",
        "text-amber-100",
      );
      return;
    }

    if (variant === "ok") {
      panel.classList.add(
        "border-emerald-300/35",
        "bg-emerald-500/15",
        "text-emerald-100",
      );
      return;
    }

    if (variant === "loading") {
      panel.classList.add(
        "border-cyan-300/35",
        "bg-cyan-500/15",
        "text-cyan-100",
      );
      return;
    }

    panel.classList.add("border-white/15", "bg-slate-900/35", "text-slate-200");
  }

  buildExpandedMapPayload(expandedMap) {
    if (!expandedMap || !expandedMap.stop) return expandedMap;

    const selectedStop = expandedMap.stop;
    const selectedStopId = String(selectedStop.id || "").trim();
    const stopLineIds = this.view.getStopLineValues(selectedStop);
    const indexedStopLineIds = selectedStopId
      ? this.view.getStopLineValues({
          id: selectedStopId,
          line:
            (this.stopLinesIndex && this.stopLinesIndex[selectedStopId]) || "",
        })
      : [];
    const directionLineIds = selectedStopId
      ? Object.keys(
          (this.stopDirectionsIndex &&
            this.stopDirectionsIndex[selectedStopId]) ||
            {},
        )
      : [];
    const activeFilterLineIds = Array.from(this.selectedStopLineIds || []);

    const selectedLineIds = Array.from(
      new Set([
        ...stopLineIds,
        ...indexedStopLineIds,
        ...directionLineIds,
        ...activeFilterLineIds,
      ]),
    ).filter(Boolean);

    if (!selectedLineIds.length) {
      return {
        ...expandedMap,
        selectedLineIds: [],
        lineStops: [],
      };
    }

    const selectedLineSet = new Set(selectedLineIds);
    const lineStops = this.allStops.filter((stop) => {
      const stopLineIds = this.view.getStopLineValues(stop);
      return stopLineIds.some((lineId) => selectedLineSet.has(lineId));
    });

    return {
      ...expandedMap,
      selectedLineIds,
      lineStops,
      stopDirectionsIndex: this.stopDirectionsIndex,
    };
  }

  destroyLeafletMap() {
    this.mapManager.destroy();
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
    if (
      hasAnyMappedLine &&
      Object.keys(this.stopLinesIndex || {}).length > 0 &&
      Object.keys(this.stopDirectionsIndex || {}).length > 0
    ) {
      return;
    }

    const cachedIndex = this.storage.loadStopsSnapshot(
      this.config.storageStopLinesIndexKey,
    );
    const cachedDirections = this.storage.loadStopsSnapshot(
      this.config.storageStopDirectionsIndexKey,
    );
    if (
      this.isNonEmptyObject(cachedIndex) &&
      this.isNonEmptyObject(cachedDirections)
    ) {
      this.stopLinesIndex = cachedIndex;
      this.stopDirectionsIndex = cachedDirections;
      this.applyStopLinesIndex();
      return;
    }

    this.buildingStopLinesIndex = true;
    this.status.show("Calculando líneas por parada...", "info");

    try {
      const stopLines = {};
      const stopDirections = {};
      const lineQueue = this.lines.map((line) => String(line.id));
      const workerCount = Math.max(
        1,
        Math.min(this.config.stopLinesIndexConcurrency || 10, lineQueue.length),
      );
      let processed = 0;
      let nextProgressAt = 20;
      let lastRenderMs = 0;

      const mergeLineEntries = (entries, fallbackLineId) => {
        const requestedLineId = String(fallbackLineId || "").trim();
        const normalizeDirection = (rawValue) => {
          const value = String(rawValue || "")
            .trim()
            .toUpperCase();
          if (!value) return "";
          if (value === "I" || value === "IDA") return "I";
          if (value === "V" || value === "VUELTA") return "V";
          if (
            value === "IV" ||
            value === "VI" ||
            value === "IDA,VUELTA" ||
            value === "VUELTA,IDA"
          ) {
            return "IV";
          }
          return "";
        };

        entries.forEach((entry) => {
          const stopId = String(
            entry && entry.stopId ? entry.stopId : "",
          ).trim();
          if (!stopId) return;

          const direction = normalizeDirection(
            entry && entry.sentidoParada ? entry.sentidoParada : "",
          );

          if (!stopLines[stopId]) {
            stopLines[stopId] = new Set();
          }

          if (!stopDirections[stopId]) {
            stopDirections[stopId] = {};
          }

          const addDirection = (lineId, value) => {
            const cleanLineId = String(lineId || "").trim();
            if (!cleanLineId || !value) return;
            const current = stopDirections[stopId][cleanLineId];
            if (!current) {
              stopDirections[stopId][cleanLineId] = value;
              return;
            }
            if (current.includes(value)) return;
            stopDirections[stopId][cleanLineId] = `${current},${value}`;
          };

          const lineIds = Array.isArray(entry && entry.lineIds)
            ? entry.lineIds
            : [];
          if (lineIds.length) {
            lineIds.forEach((lineId) => {
              const clean = String(lineId || "").trim();
              if (!clean) return;
              stopLines[stopId].add(clean);
            });
            if (direction && requestedLineId) {
              addDirection(requestedLineId, direction);
            }
            return;
          }

          if (requestedLineId) {
            stopLines[stopId].add(requestedLineId);
            if (direction) addDirection(requestedLineId, direction);
          }
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
      this.stopDirectionsIndex = stopDirections;
      this.storage.saveStopsSnapshot(
        this.config.storageStopLinesIndexKey,
        flatIndex,
      );
      this.storage.saveStopsSnapshot(
        this.config.storageStopDirectionsIndexKey,
        stopDirections,
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

  async fetchStopsForLineEntriesData(lineId) {
    const sentidos = ["I", "V"];
    const allEntries = [];

    for (let index = 0; index < sentidos.length; index++) {
      const sentido = sentidos[index];
      try {
        const entries = await this.api.fetchStopsForLineEntriesDirect(
          lineId,
          sentido,
        );
        allEntries.push(...entries);
        continue;
      } catch (directError) {
        console.warn(
          `Error en fetch directo de entradas de paradas (${sentido}) para indice`,
          directError,
        );
      }

      try {
        const entries = await this.api.fetchStopsForLineEntriesViaProxy(
          lineId,
          sentido,
        );
        allEntries.push(...entries);
      } catch (proxyError) {
        console.warn(
          `Error en fetch proxy de entradas de paradas (${sentido}) para indice`,
          proxyError,
        );
      }
    }

    return allEntries;
  }

  flattenStopLinesIndex(stopLines) {
    const flatIndex = {};
    Object.keys(stopLines).forEach((stopId) => {
      flatIndex[stopId] = Array.from(stopLines[stopId]).sort().join(", ");
    });
    return flatIndex;
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
