export class LeafletMapManager {
  constructor(statusPresenter, escapeHtml) {
    this.status = statusPresenter;
    this.escapeHtml =
      typeof escapeHtml === "function"
        ? escapeHtml
        : (value) => String(value || "");
    this.currentMap = null;
    this.userPoint = null;
    this.selectedStopPoint = null;
    this.lineBounds = null;
    this.topMenuControl = null;
    this.lastExpandedMapData = null;
  }

  render(expandedMap) {
    this.destroy();
    if (!expandedMap || !expandedMap.stop || !expandedMap.mapContainerId)
      return;

    if (typeof window === "undefined" || typeof window.L === "undefined") {
      this.status.show(
        "Leaflet no esta disponible para mostrar el mapa",
        "err",
      );
      return;
    }

    const lat = Number(expandedMap.stop.lat);
    const lon = Number(expandedMap.stop.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    this.lastExpandedMapData = expandedMap;
    this.selectedStopPoint = window.L.latLng(lat, lon);

    const mapContainer = document.getElementById(expandedMap.mapContainerId);
    if (!mapContainer) return;

    const map = window.L.map(mapContainer, {
      zoomControl: true,
      attributionControl: true,
    }).setView([lat, lon], 16);

    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    window.L.marker([lat, lon])
      .addTo(map)
      .bindPopup(this.escapeHtml(expandedMap.stop.name || "Parada"))
      .openPopup();

    this.addLineStopsMarkers(map, expandedMap);
    this.addTopMenuControl(map);

    this.addUserLocationMarker(map, {
      fitToInclude: true,
      focusOnUser: false,
      showStatusOnError: false,
    });

    this.currentMap = map;
    setTimeout(() => {
      if (this.currentMap) this.currentMap.invalidateSize();
    }, 0);
  }

  addLineStopsMarkers(map, expandedMap) {
    const selectedStop =
      expandedMap && expandedMap.stop ? expandedMap.stop : null;
    const selectedStopId = selectedStop ? String(selectedStop.id || "") : "";
    const selectedLineIds = Array.isArray(
      expandedMap && expandedMap.selectedLineIds,
    )
      ? expandedMap.selectedLineIds
      : [];
    const stopDirectionsIndex =
      expandedMap && expandedMap.stopDirectionsIndex
        ? expandedMap.stopDirectionsIndex
        : {};
    const lineStops = Array.isArray(expandedMap && expandedMap.lineStops)
      ? expandedMap.lineStops
      : [];

    const boundsPoints = [];
    lineStops.forEach((stop) => {
      const stopId = String(stop && stop.id ? stop.id : "");
      if (!stopId || stopId === selectedStopId) return;

      const lat = Number(stop.lat);
      const lon = Number(stop.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

      const direction = this.resolveStopDirection(
        stopId,
        selectedLineIds,
        stopDirectionsIndex,
      );
      const markerStyle = this.getLineStopStyle(direction);
      const directionLabel = this.getDirectionLabel(direction);
      const popupText = directionLabel
        ? `${this.escapeHtml(stop.name || "Parada")} (${this.escapeHtml(stop.id || "-")}) · ${directionLabel}`
        : `${this.escapeHtml(stop.name || "Parada")} (${this.escapeHtml(stop.id || "-")})`;

      window.L.circleMarker([lat, lon], {
        radius: 6,
        color: markerStyle.stroke,
        weight: 2,
        fillColor: markerStyle.fill,
        fillOpacity: 0.9,
      })
        .addTo(map)
        .bindPopup(popupText);

      boundsPoints.push(window.L.latLng(lat, lon));
    });

    const selectedLat = Number(selectedStop && selectedStop.lat);
    const selectedLon = Number(selectedStop && selectedStop.lon);
    if (Number.isFinite(selectedLat) && Number.isFinite(selectedLon)) {
      boundsPoints.push(window.L.latLng(selectedLat, selectedLon));
    }

    this.lineBounds =
      boundsPoints.length >= 1 ? window.L.latLngBounds(boundsPoints) : null;

    if (boundsPoints.length >= 2) {
      map.fitBounds(this.lineBounds.pad(0.2));
    }
  }

  addTopMenuControl(map) {
    const L = window.L;
    const control = L.control({ position: "topleft" });

    control.onAdd = () => {
      const container = L.DomUtil.create(
        "div",
        "rounded-xl border border-white/20 bg-slate-900/85 p-2 shadow-lg backdrop-blur-sm",
      );
      container.innerHTML = `
        <div class="flex flex-wrap gap-1 text-[11px]">
          <button type="button" data-map-action="center-stop" class="rounded-md border border-white/20 bg-white/10 px-2 py-1 font-semibold text-slate-100 hover:bg-white/20">Centrar parada</button>
          <button type="button" data-map-action="fit-line" class="rounded-md border border-white/20 bg-white/10 px-2 py-1 font-semibold text-slate-100 hover:bg-white/20">Ver todas</button>
          <button type="button" data-map-action="center-user" class="rounded-md border border-white/20 bg-cyan-500/20 px-2 py-1 font-semibold text-cyan-100 hover:bg-cyan-500/30">Mi ubicacion</button>
          <button type="button" data-map-action="fullscreen" class="rounded-md border border-emerald-300/30 bg-emerald-500/20 px-2 py-1 font-semibold text-emerald-100 hover:bg-emerald-500/30">Pantalla completa</button>
        </div>
      `;

      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.disableScrollPropagation(container);

      const buttons = container.querySelectorAll("button[data-map-action]");
      buttons.forEach((button) => {
        button.addEventListener("click", () => {
          const action = button.getAttribute("data-map-action");
          if (action === "center-stop") {
            this.centerOnSelectedStop(map);
            return;
          }
          if (action === "fit-line") {
            this.fitAllLineStops(map);
            return;
          }
          if (action === "center-user") {
            this.centerOnUserLocation(map);
            return;
          }
          if (action === "fullscreen") {
            this.openFullscreenMap();
          }
        });
      });

      return container;
    };

    control.addTo(map);
    this.topMenuControl = control;
  }

  centerOnSelectedStop(map) {
    if (!this.selectedStopPoint) return;
    map.setView(this.selectedStopPoint, Math.max(map.getZoom(), 16));
  }

  fitAllLineStops(map) {
    if (this.lineBounds && this.lineBounds.isValid()) {
      map.fitBounds(this.lineBounds.pad(0.2));
      return;
    }

    if (this.selectedStopPoint) {
      map.setView(this.selectedStopPoint, Math.max(map.getZoom(), 16));
      return;
    }

    this.status.show("No hay paradas suficientes para ajustar el mapa", "info");
  }

  centerOnUserLocation(map) {
    if (this.userPoint) {
      map.setView(this.userPoint, Math.max(map.getZoom(), 16));
      return;
    }

    this.addUserLocationMarker(map, {
      fitToInclude: false,
      focusOnUser: true,
      showStatusOnError: true,
    });
  }

  addUserLocationMarker(map, options = {}) {
    const {
      fitToInclude = true,
      focusOnUser = false,
      showStatusOnError = false,
    } = options;

    if (
      typeof navigator === "undefined" ||
      !navigator.geolocation ||
      typeof navigator.geolocation.getCurrentPosition !== "function"
    ) {
      if (showStatusOnError) {
        this.status.show(
          "Geolocalizacion no disponible en este navegador",
          "err",
        );
      }
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!this.currentMap || this.currentMap !== map) return;

        const userLat = Number(position.coords.latitude);
        const userLon = Number(position.coords.longitude);
        if (!Number.isFinite(userLat) || !Number.isFinite(userLon)) return;

        this.userPoint = window.L.latLng(userLat, userLon);

        const userMarker = window.L.circleMarker([userLat, userLon], {
          radius: 7,
          color: "#22d3ee",
          weight: 2,
          fillColor: "#0891b2",
          fillOpacity: 0.9,
        })
          .addTo(map)
          .bindPopup("Tu ubicación actual");

        if (focusOnUser) {
          map.setView(this.userPoint, Math.max(map.getZoom(), 16));
        } else if (fitToInclude) {
          const currentBounds = map.getBounds();
          if (currentBounds && currentBounds.isValid()) {
            const extended = currentBounds.extend(this.userPoint);
            map.fitBounds(extended.pad(0.15));
          }
        }

        return userMarker;
      },
      (error) => {
        console.warn("No se pudo obtener la ubicación del usuario", error);
        if (showStatusOnError) {
          this.status.show("No se pudo obtener tu ubicación", "err");
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000,
      },
    );
  }

  openFullscreenMap() {
    const data = this.createFullscreenMapData();
    if (!data || !data.stop) {
      this.status.show("No hay datos de parada para abrir el mapa", "err");
      return;
    }

    const popup = window.open("", "_blank");
    if (!popup) {
      this.status.show("El navegador ha bloqueado la nueva pestaña", "err");
      return;
    }

    const documentHtml = this.buildFullscreenHtml(data);
    popup.document.open();
    popup.document.write(documentHtml);
    popup.document.close();
  }

  createFullscreenMapData() {
    const source = this.lastExpandedMapData;
    if (!source || !source.stop) return null;

    const stop = {
      id: String(source.stop.id || ""),
      name: String(source.stop.name || "Parada"),
      lat: Number(source.stop.lat),
      lon: Number(source.stop.lon),
    };

    const selectedLineIds = Array.isArray(source.selectedLineIds)
      ? source.selectedLineIds
      : [];
    const stopDirectionsIndex =
      source && source.stopDirectionsIndex ? source.stopDirectionsIndex : {};

    const lineStops = Array.isArray(source.lineStops)
      ? source.lineStops
          .map((item) => ({
            id: String(item && item.id ? item.id : ""),
            name: String(item && item.name ? item.name : "Parada"),
            lat: Number(item && item.lat),
            lon: Number(item && item.lon),
            direction: this.resolveStopDirection(
              String(item && item.id ? item.id : ""),
              selectedLineIds,
              stopDirectionsIndex,
            ),
          }))
          .filter(
            (item) =>
              Number.isFinite(item.lat) &&
              Number.isFinite(item.lon) &&
              !!item.id,
          )
      : [];

    const user = this.userPoint
      ? { lat: Number(this.userPoint.lat), lon: Number(this.userPoint.lng) }
      : null;

    return {
      stop,
      lineStops,
      user,
    };
  }

  buildFullscreenHtml(data) {
    const safeData = JSON.stringify(data).replace(/</g, "\\u003c");
    return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Mapa de parada</title>
    <link
      rel="stylesheet"
      href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
      integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
      crossorigin=""
    />
    <style>
      html, body, #map { height: 100%; width: 100%; margin: 0; }
      .legend {
        position: absolute;
        top: 10px;
        right: 10px;
        z-index: 999;
        background: rgba(15, 23, 42, 0.88);
        color: #e2e8f0;
        border: 1px solid rgba(148, 163, 184, 0.35);
        border-radius: 10px;
        padding: 8px 10px;
        font: 12px/1.3 sans-serif;
      }
      .legend span { display: inline-flex; align-items: center; gap: 6px; margin-right: 8px; }
      .dot { width: 10px; height: 10px; border-radius: 999px; display: inline-block; }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <div class="legend">
      <span><i class="dot" style="background:#3b82f6"></i>Parada seleccionada</span>
      <span><i class="dot" style="background:#ef4444"></i>Paradas ida</span>
      <span><i class="dot" style="background:#3b82f6"></i>Paradas vuelta</span>
      <span><i class="dot" style="background:#f59e0b"></i>Paradas mixtas</span>
      <span><i class="dot" style="background:#0891b2"></i>Tu ubicación</span>
    </div>
    <script
      src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
      integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo="
      crossorigin=""
    ></script>
    <script>
      const data = ${safeData};
      const map = L.map("map", { zoomControl: true }).setView([data.stop.lat, data.stop.lon], 16);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);

      const boundsPoints = [];
      L.marker([data.stop.lat, data.stop.lon]).addTo(map).bindPopup(data.stop.name).openPopup();
      boundsPoints.push(L.latLng(data.stop.lat, data.stop.lon));

      data.lineStops.forEach((stop) => {
        if (stop.id === data.stop.id) return;
        let stroke = "#475569";
        let fill = "#94a3b8";
        if (stop.direction === "I") {
          stroke = "#b91c1c";
          fill = "#ef4444";
        } else if (stop.direction === "V") {
          stroke = "#1d4ed8";
          fill = "#3b82f6";
        } else if (stop.direction === "IV") {
          stroke = "#b45309";
          fill = "#f59e0b";
        }
        L.circleMarker([stop.lat, stop.lon], {
          radius: 6,
          color: stroke,
          weight: 2,
          fillColor: fill,
          fillOpacity: 0.9,
        }).addTo(map).bindPopup(stop.name + " (" + stop.id + ")");
        boundsPoints.push(L.latLng(stop.lat, stop.lon));
      });

      if (data.user && Number.isFinite(data.user.lat) && Number.isFinite(data.user.lon)) {
        L.circleMarker([data.user.lat, data.user.lon], {
          radius: 7,
          color: "#22d3ee",
          weight: 2,
          fillColor: "#0891b2",
          fillOpacity: 0.9,
        }).addTo(map).bindPopup("Tu ubicación actual");
        boundsPoints.push(L.latLng(data.user.lat, data.user.lon));
      }

      if (boundsPoints.length >= 2) {
        map.fitBounds(L.latLngBounds(boundsPoints).pad(0.2));
      }
    </script>
  </body>
</html>`;
  }

  destroy() {
    this.topMenuControl = null;
    this.userPoint = null;
    this.selectedStopPoint = null;
    this.lineBounds = null;
    this.lastExpandedMapData = null;
    if (this.currentMap && typeof this.currentMap.remove === "function") {
      this.currentMap.remove();
    }
    this.currentMap = null;
  }

  resolveStopDirection(stopId, selectedLineIds, stopDirectionsIndex) {
    const normalizeDirectionToken = (rawToken) => {
      const token = String(rawToken || "")
        .trim()
        .toUpperCase();
      if (!token) return "";
      if (token === "I" || token === "IDA") return "I";
      if (token === "V" || token === "VUELTA") return "V";
      if (token === "IV" || token === "VI") return "IV";
      return "";
    };

    const cleanStopId = String(stopId || "").trim();
    if (!cleanStopId) return "";

    const byStop =
      stopDirectionsIndex && typeof stopDirectionsIndex === "object"
        ? stopDirectionsIndex[cleanStopId]
        : null;
    if (!byStop || typeof byStop !== "object") return "";

    const directions = new Set();
    selectedLineIds.forEach((lineId) => {
      const cleanLineId = String(lineId || "").trim();
      if (!cleanLineId) return;
      const raw = byStop[cleanLineId];
      if (!raw) return;
      const tokens = String(raw)
        .toUpperCase()
        .split(/[\s,;|/]+/)
        .filter(Boolean);

      tokens.forEach((token) => {
        const normalized = normalizeDirectionToken(token);
        if (!normalized) return;
        if (normalized.includes("I")) directions.add("I");
        if (normalized.includes("V")) directions.add("V");
      });
    });

    if (directions.has("I") && directions.has("V")) return "IV";
    if (directions.has("I")) return "I";
    if (directions.has("V")) return "V";
    return "";
  }

  getLineStopStyle(direction) {
    if (direction === "I") {
      return { stroke: "#b91c1c", fill: "#ef4444" };
    }
    if (direction === "V") {
      return { stroke: "#1d4ed8", fill: "#3b82f6" };
    }
    if (direction === "IV") {
      return { stroke: "#b45309", fill: "#f59e0b" };
    }
    return { stroke: "#475569", fill: "#94a3b8" };
  }

  getDirectionLabel(direction) {
    if (direction === "I") return "Ida";
    if (direction === "V") return "Vuelta";
    if (direction === "IV") return "Ida y vuelta";
    return "";
  }
}
