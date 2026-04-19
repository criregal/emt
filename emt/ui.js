export class DomRefs {
  constructor() {
    this.menuView = document.getElementById("menuView");
    this.linesView = document.getElementById("linesView");
    this.stopsView = document.getElementById("stopsView");
    this.goLinesBtn = document.getElementById("goLinesBtn");
    this.goStopsBtn = document.getElementById("goStopsBtn");
    this.linesBackIosBtn = document.getElementById("linesBackIosBtn");
    this.linesMenuToMenuBtn = document.getElementById("linesMenuToMenuBtn");
    this.linesMenuToStopsBtn = document.getElementById("linesMenuToStopsBtn");
    this.stopsBackIosBtn = document.getElementById("stopsBackIosBtn");
    this.stopsMenuToMenuBtn = document.getElementById("stopsMenuToMenuBtn");
    this.stopsMenuToLinesBtn = document.getElementById("stopsMenuToLinesBtn");

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

    this.statusContainer = document.getElementById("statusContainer");
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

  renderLinesTable(
    lines,
    query,
    expandedLineId = null,
    isLoadingStops = false,
    onToggleLine = null,
  ) {
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
      this.renderEmptyTableRow(linesTableBody, 2, "No hay líneas para mostrar");
      return;
    }

    filtered.forEach((line) => {
      const lineId = String(line.id);
      const isExpanded = String(expandedLineId || "") === lineId;
      const toggleIcon = isExpanded ? "▾" : "▸";
      const toggleLabel = isExpanded ? "Contraer" : "Desplegar";
      const lineNameHtml = this.renderLineNameTwoLines(line.name);
      const row = document.createElement("tr");
      row.className = "cursor-pointer hover:bg-white/10";
      row.setAttribute("tabindex", "0");
      row.innerHTML = `
        <td class="px-4 py-3"><span class="inline-flex items-center rounded-full bg-rose-600 px-2 py-0.5 text-xs font-bold text-white">${this.escapeHtml(line.id)}</span></td>
        <td class="px-4 py-3 text-slate-100">
          <div class="flex items-center justify-between gap-3">
            <span>${lineNameHtml}</span>
            <span class="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/20 bg-white/10 text-sm text-slate-100" aria-label="${toggleLabel}">${toggleIcon}</span>
          </div>
        </td>
      `;

      const triggerToggle = () => {
        if (typeof onToggleLine === "function") {
          onToggleLine(line);
        }
      };

      row.addEventListener("click", triggerToggle);
      row.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          triggerToggle();
        }
      });

      linesTableBody.appendChild(row);

      if (!isExpanded) return;

      const detailsRow = document.createElement("tr");
      detailsRow.className = "bg-slate-900/35";
      const detailsCell = document.createElement("td");
      detailsCell.colSpan = 2;
      detailsCell.className = "px-4 py-3";

      const stops = Array.isArray(line.stops) ? line.stops : [];
      if (isLoadingStops && !stops.length) {
        detailsCell.innerHTML =
          '<div class="rounded-xl border border-cyan-300/25 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100">Cargando paradas...</div>';
      } else if (!stops.length) {
        detailsCell.innerHTML =
          '<div class="rounded-xl border border-slate-300/20 bg-slate-800/35 px-3 py-2 text-xs text-slate-200">No hay paradas cargadas para esta linea.</div>';
      } else {
        const listItems = stops
          .map((stop, index) => {
            const zebraClass =
              index % 2 === 0 ? "bg-slate-900/55" : "bg-slate-800/45";
            return `<li class="flex items-start gap-2 rounded-lg px-2.5 py-1.5 ${zebraClass}">
              <span class="mt-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-950/80 text-[11px] font-semibold text-cyan-200">${index + 1}</span>
              <span class="text-sm text-slate-100/95">${this.escapeHtml(stop)}</span>
            </li>`;
          })
          .join("");
        detailsCell.innerHTML = `
          <div class="text-xs uppercase tracking-[0.16em] text-cyan-100/80">Paradas de la linea</div>
          <ul class="mt-2 flex flex-col gap-1">${listItems}</ul>
        `;
      }

      detailsRow.appendChild(detailsCell);
      linesTableBody.appendChild(detailsRow);
    });
  }

  renderLineNameTwoLines(value) {
    const text = String(value || "").trim();
    if (!text) return "";

    const parts = text.split(/\s*-\s*/).filter(Boolean);
    if (parts.length < 2) {
      return this.escapeHtml(text);
    }

    const firstLine = this.escapeHtml(parts[0]);
    const secondLine = this.escapeHtml(parts.slice(1).join(" - "));

    return `<span class="block">${firstLine}</span><span class="block text-slate-300">${secondLine}</span>`;
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
      const lineBadges = this.renderStopLineBadgesHtml(stop);
      const row = document.createElement("tr");
      row.className =
        "cursor-pointer hover:bg-white/10 focus-within:bg-white/10";
      row.setAttribute("tabindex", "0");
      row.innerHTML = `
        <td class="px-4 py-3 font-semibold text-fuchsia-200">${this.escapeHtml(stop.id)}</td>
        <td class="px-4 py-3 text-slate-100">${this.escapeHtml(stop.name)}</td>
        <td class="px-4 py-3">${lineBadges}</td>
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
          const stopArrivalsId = `${mapContainerId}-arrivals`;
          const routeSummaryId = `${mapContainerId}-route-summary`;
          const mapRoutePanelId = `${mapContainerId}-route-panel`;
          detailsCell.innerHTML = `
            <div class="mb-2 text-xs text-slate-300/80">Lat: ${lat.toFixed(6)} · Lon: ${lon.toFixed(6)}</div>
            <div id="${this.escapeHtml(stopArrivalsId)}" class="mb-2 rounded-lg border border-white/15 bg-slate-900/35 px-3 py-2 text-xs text-slate-200">Proximos buses: consultando...</div>
            <div id="${this.escapeHtml(routeSummaryId)}" class="mb-2 rounded-lg border border-white/15 bg-slate-900/35 px-3 py-2 text-xs text-slate-200">Ruta a pie: calcula la ruta para ver distancia y tiempos.</div>
            <div id="${this.escapeHtml(mapContainerId)}" class="relative w-full overflow-auto rounded-xl border border-white/15" style="height: 32rem; resize: vertical; min-height: 32rem; max-height: 80vh;"></div>
          `;
          expandedMap = {
            stop,
            mapContainerId,
            stopArrivalsId,
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

  renderStopLineBadgesHtml(stop) {
    const lineValues = this.getStopLineValues(stop);
    if (!lineValues.length) {
      return '<span class="inline-flex items-center rounded-full bg-rose-700 px-2 py-0.5 text-xs font-semibold text-white">-</span>';
    }

    return lineValues
      .map(
        (lineId) =>
          `<span class="mr-1 mb-1 inline-flex items-center rounded-full bg-rose-600 px-2 py-0.5 text-xs font-semibold text-white">${this.escapeHtml(lineId)}</span>`,
      )
      .join("");
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
