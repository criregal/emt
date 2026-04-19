export class DomRefs {
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
    this.clearSearchLineBtn = document.getElementById("clearSearchLineBtn");
    this.searchStopName = document.getElementById("searchStopName");
    this.clearSearchStopNameBtn = document.getElementById(
      "clearSearchStopNameBtn",
    );
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

export class StatusPresenter {
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

export class LoadingPresenter {
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

export class BusView {
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
    expandedStopId = null,
    onToggleStopMap = null,
  ) {
    const { stopsTableBody } = this.dom;
    if (!stopsTableBody) return;

    const safeStopName = this.normalizeSearchText(stopNameQuery);
    const selectedSet = new Set(
      Array.isArray(selectedLineIds)
        ? selectedLineIds
            .map((lineId) => this.normalizeLineId(lineId))
            .filter(Boolean)
        : [],
    );

    const filtered = stops.filter((stop) => {
      const byName = !safeStopName
        ? true
        : this.normalizeSearchText(stop.name).includes(safeStopName);
      const stopLineValues = this.getStopLineValues(stop);
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
        expandedMap: null,
      };
    }

    let expandedMap = null;

    paginated.forEach((stop) => {
      const row = document.createElement("tr");
      row.className =
        "cursor-pointer hover:bg-white/10 focus-within:bg-white/10";
      row.setAttribute("tabindex", "0");
      row.innerHTML = `
        <td class="px-4 py-3 font-semibold text-fuchsia-200">${this.escapeHtml(stop.id)}</td>
        <td class="px-4 py-3 text-slate-100">${this.escapeHtml(stop.name)}</td>
        <td class="px-4 py-3 text-slate-300">${this.escapeHtml(stop.line)}</td>
      `;

      const triggerToggle = () => {
        if (typeof onToggleStopMap === "function") {
          onToggleStopMap(stop);
        }
      };

      row.addEventListener("click", triggerToggle);
      row.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          triggerToggle();
        }
      });

      stopsTableBody.appendChild(row);

      if (String(expandedStopId || "") === String(stop.id || "")) {
        const detailsRow = document.createElement("tr");
        detailsRow.className = "bg-slate-900/35";

        const detailsCell = document.createElement("td");
        detailsCell.colSpan = 3;
        detailsCell.className = "px-4 pb-4 pt-1";

        const lat = Number(stop.lat);
        const lon = Number(stop.lon);
        const hasCoordinates = Number.isFinite(lat) && Number.isFinite(lon);

        if (!hasCoordinates) {
          detailsCell.innerHTML =
            '<div class="rounded-xl border border-rose-300/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">No hay coordenadas disponibles para esta parada.</div>';
        } else {
          const mapContainerId = this.getStopMapContainerId(stop.id);
          const routeSummaryId = `${mapContainerId}-route-summary`;
          const mapRoutePanelId = `${mapContainerId}-route-panel`;
          detailsCell.innerHTML = `
            <div class="mb-2 text-xs text-slate-300/80">Lat: ${lat.toFixed(6)} · Lon: ${lon.toFixed(6)}</div>
            <div id="${this.escapeHtml(routeSummaryId)}" class="mb-2 rounded-lg border border-white/15 bg-slate-900/35 px-3 py-2 text-xs text-slate-200">Ruta a pie: calcula la ruta para ver distancia y tiempos.</div>
            <div id="${this.escapeHtml(mapContainerId)}" class="relative h-64 w-full overflow-auto rounded-xl border border-white/15" style="resize: vertical; min-height: 16rem; max-height: 80vh;"></div>
          `;
          expandedMap = {
            stop,
            mapContainerId,
            routeSummaryId,
            mapRoutePanelId,
          };
        }

        detailsRow.appendChild(detailsCell);
        stopsTableBody.appendChild(detailsRow);
      }
    });

    return {
      totalItems,
      totalPages,
      page: safePage,
      from: startIndex + 1,
      to: Math.min(startIndex + pageSize, totalItems),
      expandedMap,
    };
  }

  getStopMapContainerId(stopId) {
    const safe = String(stopId || "")
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, "-");
    return `stop-map-${safe || "unknown"}`;
  }

  getStopLineValues(stop) {
    const candidates = [
      stop ? stop.line : null,
      stop ? stop.lineas : null,
      stop ? stop.lines : null,
    ];
    const values = [];

    candidates.forEach((candidate) => {
      this.extractLineValues(candidate).forEach((lineId) =>
        values.push(lineId),
      );
    });

    return Array.from(new Set(values));
  }

  extractLineValues(value) {
    if (value === undefined || value === null) return [];

    if (Array.isArray(value)) {
      const merged = [];
      value.forEach((item) => {
        this.extractLineValues(item).forEach((lineId) => merged.push(lineId));
      });
      return merged;
    }

    if (typeof value === "string") {
      const text = value.trim();
      if (!text || text === "-") return [];

      if (text.startsWith("[") && text.endsWith("]")) {
        try {
          const parsed = JSON.parse(text);
          return this.extractLineValues(parsed);
        } catch (error) {
          // Continue with comma parsing if JSON parsing fails.
        }
      }

      return text
        .split(",")
        .map((item) => this.normalizeLineId(item))
        .filter(Boolean);
    }

    return [this.normalizeLineId(value)].filter(Boolean);
  }

  normalizeLineId(value) {
    let text = String(value || "").trim();
    if (!text || text === "-") return "";

    text = text
      .replace(/[\[\]"]/g, "")
      .replace(/^linea\s*/i, "")
      .replace(/^line\s*/i, "")
      .trim();

    if (!text) return "";

    if (/^\d+$/.test(text)) {
      return String(Number(text));
    }

    return text.toUpperCase();
  }

  normalizeSearchText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
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
