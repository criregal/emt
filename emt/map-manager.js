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
    this.mapResizeObserver = null;
    this.mapContainerElement = null;
    this.routeLayer = null;
    this.routeRequestController = null;
    this.routeSummaryElementId = "";
    this.mapRoutePanelElementId = "";
    this.routeTargetStop = null;
    this.userMarker = null;
    this.realtimeLocationEnabled = false;
    this.realtimeLocationIntervalId = null;
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
    this.routeSummaryElementId = String(expandedMap.routeSummaryId || "");
    this.mapRoutePanelElementId = String(expandedMap.mapRoutePanelId || "");
    this.selectedStopPoint = window.L.latLng(lat, lon);
    this.routeTargetStop = {
      id: String(expandedMap.stop.id || ""),
      name: String(expandedMap.stop.name || "Parada"),
    };

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

    const selectedStopMarker = window.L.marker([lat, lon])
      .addTo(map)
      .bindPopup(this.escapeHtml(expandedMap.stop.name || "Parada"))
      .openPopup();
    selectedStopMarker.on("click", () => {
      this.selectRouteTargetStop(
        {
          id: String(expandedMap.stop.id || ""),
          name: String(expandedMap.stop.name || "Parada"),
          lat,
          lon,
        },
        map,
        {
          fitBounds: true,
          showStatusOnError: true,
        },
      );
    });

    this.currentMap = map;
    this.mapContainerElement = mapContainer;

    this.addLineStopsMarkers(map, expandedMap);
    this.addTopMenuControl(map);

    this.addUserLocationMarker(map, {
      fitToInclude: false,
      focusOnUser: true,
      showStatusOnError: false,
      drawRouteToStop: true,
    });

    this.ensureMapRoutePanel(mapContainer, this.mapRoutePanelElementId);
    this.updateRoutePanels({
      distanceText: "-",
      durationApiText: "-",
      durationAverageText: "-",
    });
    this.setupResizeHandling(map, mapContainer);
    setTimeout(() => {
      if (this.currentMap) this.currentMap.invalidateSize();
    }, 0);
  }

  setupResizeHandling(map, mapContainer) {
    if (!map || !mapContainer) return;

    if (this.mapResizeObserver) {
      this.mapResizeObserver.disconnect();
      this.mapResizeObserver = null;
    }

    if (typeof window !== "undefined" && "ResizeObserver" in window) {
      this.mapResizeObserver = new window.ResizeObserver(() => {
        if (this.currentMap && this.currentMap === map) {
          this.currentMap.invalidateSize();
        }
      });
      this.mapResizeObserver.observe(mapContainer);
      return;
    }

    mapContainer.addEventListener("mouseup", () => {
      if (this.currentMap && this.currentMap === map) {
        this.currentMap.invalidateSize();
      }
    });
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

      const marker = window.L.circleMarker([lat, lon], {
        radius: 6,
        color: markerStyle.stroke,
        weight: 2,
        fillColor: markerStyle.fill,
        fillOpacity: 0.9,
      })
        .addTo(map)
        .bindPopup(popupText);

      marker.on("click", () => {
        this.selectRouteTargetStop(
          {
            id: stopId,
            name: String(stop.name || "Parada"),
            lat,
            lon,
          },
          map,
          {
            fitBounds: true,
            showStatusOnError: true,
          },
        );
      });

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
          <button type="button" data-map-action="route-user-stop" class="rounded-md border border-amber-300/30 bg-amber-500/20 px-2 py-1 font-semibold text-amber-100 hover:bg-amber-500/30">Ruta a pie</button>
          <button type="button" data-map-action="fullscreen" class="rounded-md border border-emerald-300/30 bg-emerald-500/20 px-2 py-1 font-semibold text-emerald-100 hover:bg-emerald-500/30">Pantalla completa</button>
            <label class="inline-flex items-center gap-1 rounded-md border border-white/20 bg-white/10 px-2 py-1 font-semibold text-slate-100">
              <input type="checkbox" data-map-action="realtime-location" class="h-3.5 w-3.5 accent-cyan-400" />
              Tiempo real
            </label>
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
          if (action === "route-user-stop") {
            this.drawRouteToSelectedStop(map, {
              fitBounds: true,
              showStatusOnError: true,
            });
            return;
          }
          if (action === "fullscreen") {
            this.openFullscreenMap();
          }
        });
      });

      const realtimeSwitch = container.querySelector(
        'input[data-map-action="realtime-location"]',
      );
      if (realtimeSwitch) {
        realtimeSwitch.checked = !!this.realtimeLocationEnabled;
        realtimeSwitch.addEventListener("change", () => {
          this.toggleRealtimeLocation(map, !!realtimeSwitch.checked);
        });
      }

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
      drawRouteToStop = false,
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

        if (this.userMarker && map.hasLayer && map.hasLayer(this.userMarker)) {
          this.userMarker.setLatLng([userLat, userLon]);
        } else {
          this.userMarker = window.L.marker([userLat, userLon], {
            icon: this.createUserMarkerIcon(),
            draggable: !this.realtimeLocationEnabled,
            autoPan: true,
          })
            .addTo(map)
            .bindPopup("Tu ubicación actual");

          this.userMarker.on("dragend", () => {
            if (this.realtimeLocationEnabled) return;
            if (!this.userMarker) return;

            const markerPoint = this.userMarker.getLatLng();
            if (!markerPoint) return;
            this.userPoint = window.L.latLng(markerPoint.lat, markerPoint.lng);

            if (this.currentMap && this.selectedStopPoint) {
              this.drawRouteToSelectedStop(this.currentMap, {
                fitBounds: true,
                showStatusOnError: true,
              });
            }
          });
        }

        this.updateUserMarkerDraggableState();

        if (focusOnUser) {
          map.setView(this.userPoint, Math.max(map.getZoom(), 16));
        } else if (fitToInclude) {
          const currentBounds = map.getBounds();
          if (currentBounds && currentBounds.isValid()) {
            const extended = currentBounds.extend(this.userPoint);
            map.fitBounds(extended.pad(0.15));
          }
        }

        if (drawRouteToStop) {
          this.drawRouteToSelectedStop(map, {
            fitBounds: true,
            showStatusOnError,
          });
        }
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

  toggleRealtimeLocation(map, enabled) {
    this.realtimeLocationEnabled = !!enabled;

    if (!this.realtimeLocationEnabled) {
      this.stopRealtimeLocationUpdates();
      this.updateUserMarkerDraggableState();
      this.status.show("Ubicación en tiempo real desactivada", "info");
      return;
    }

    this.stopRealtimeLocationUpdates();
    this.updateUserMarkerDraggableState();
    this.status.show("Ubicación en tiempo real activada", "ok");

    const tick = () => {
      if (!this.currentMap || this.currentMap !== map) return;
      this.addUserLocationMarker(map, {
        fitToInclude: false,
        focusOnUser: false,
        showStatusOnError: false,
        drawRouteToStop: true,
      });
    };

    tick();
    this.realtimeLocationIntervalId = window.setInterval(tick, 5000);
  }

  stopRealtimeLocationUpdates() {
    if (this.realtimeLocationIntervalId !== null) {
      clearInterval(this.realtimeLocationIntervalId);
      this.realtimeLocationIntervalId = null;
    }
  }

  createUserMarkerIcon() {
    return window.L.divIcon({
      className: "",
      iconSize: [14, 14],
      iconAnchor: [7, 7],
      html: '<span style="display:block;width:14px;height:14px;border-radius:999px;background:#0891b2;border:2px solid #22d3ee;"></span>',
    });
  }

  updateUserMarkerDraggableState() {
    if (!this.userMarker || !this.userMarker.dragging) return;

    if (this.realtimeLocationEnabled) {
      this.userMarker.dragging.disable();
      return;
    }

    this.userMarker.dragging.enable();
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

  selectRouteTargetStop(stop, map, options = {}) {
    const lat = Number(stop && stop.lat);
    const lon = Number(stop && stop.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

    this.selectedStopPoint = window.L.latLng(lat, lon);
    this.routeTargetStop = {
      id: String((stop && stop.id) || ""),
      name: String((stop && stop.name) || "Parada"),
    };

    this.drawRouteToSelectedStop(map, options);
  }

  async drawRouteToSelectedStop(map, options = {}) {
    const { fitBounds = true, showStatusOnError = false } = options;

    if (!this.selectedStopPoint) {
      if (showStatusOnError) {
        this.status.show("No hay parada seleccionada para trazar ruta", "err");
      }
      this.updateRoutePanels({
        distanceText: "-",
        durationApiText: "-",
        durationAverageText: "-",
      });
      return;
    }

    if (!this.userPoint) {
      this.addUserLocationMarker(map, {
        fitToInclude: false,
        focusOnUser: false,
        showStatusOnError,
        drawRouteToStop: true,
      });
      return;
    }

    try {
      this.status.show("Calculando ruta a pie...", "info");
      const route = await this.fetchRouteGeometry(
        this.userPoint,
        this.selectedStopPoint,
      );
      if (
        !route ||
        !Array.isArray(route.coordinates) ||
        !route.coordinates.length
      ) {
        throw new Error("Ruta vacia");
      }

      const latLngs = route.coordinates
        .map((coord) => {
          if (!Array.isArray(coord) || coord.length < 2) return null;
          const lon = Number(coord[0]);
          const lat = Number(coord[1]);
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
          return [lat, lon];
        })
        .filter(Boolean);

      if (!latLngs.length) {
        throw new Error("Coordenadas de ruta invalidas");
      }

      const routeMetrics = this.buildRouteMetrics(route);
      this.clearRouteLayer(map);
      this.routeLayer = window.L.polyline(latLngs, {
        color: "#f59e0b",
        weight: 5,
        opacity: 0.95,
      })
        .addTo(map)
        .bindPopup(this.buildRouteSummary(routeMetrics));

      if (fitBounds) {
        const routeBounds = this.routeLayer.getBounds();
        if (routeBounds && routeBounds.isValid()) {
          const userLatLng = this.userPoint;
          const targetLatLng = this.selectedStopPoint;
          if (userLatLng && targetLatLng) {
            routeBounds.extend(userLatLng);
            routeBounds.extend(targetLatLng);
          }

          map.fitBounds(routeBounds.pad(0.04), {
            maxZoom: 18,
            animate: false,
          });
        }
      }

      this.status.show(
        `Ruta a pie: ${routeMetrics.distanceText} · ${routeMetrics.durationApiText} (media ${routeMetrics.durationAverageText})`,
        "ok",
      );
      this.updateRoutePanels(routeMetrics);
    } catch (error) {
      console.warn("No se pudo calcular la ruta", error);
      this.updateRoutePanels({
        distanceText: "-",
        durationApiText: "-",
        durationAverageText: "-",
      });
      if (showStatusOnError) {
        this.status.show("No se pudo calcular la ruta a pie", "err");
      }
    }
  }

  async fetchRouteGeometry(fromPoint, toPoint) {
    if (this.routeRequestController) {
      this.routeRequestController.abort();
      this.routeRequestController = null;
    }

    const controller = new AbortController();
    this.routeRequestController = controller;

    const fromLon = Number(fromPoint.lng);
    const fromLat = Number(fromPoint.lat);
    const toLon = Number(toPoint.lng);
    const toLat = Number(toPoint.lat);

    // routed-foot usa red peatonal de OSM (aunque el segmento de perfil sea /driving/).
    const endpoint =
      "https://routing.openstreetmap.de/routed-foot/route/v1/driving/" +
      encodeURIComponent(`${fromLon},${fromLat}`) +
      ";" +
      encodeURIComponent(`${toLon},${toLat}`) +
      "?overview=full&geometries=geojson&alternatives=false&steps=false";

    const timeoutId = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(endpoint, {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = await response.json();
      const route =
        payload && Array.isArray(payload.routes) && payload.routes.length
          ? payload.routes[0]
          : null;
      if (
        !route ||
        !route.geometry ||
        !Array.isArray(route.geometry.coordinates)
      ) {
        throw new Error("Sin geometria de ruta");
      }

      return {
        coordinates: route.geometry.coordinates,
        distanceMeters: Number(route.distance),
        durationSeconds: Number(route.duration),
      };
    } finally {
      clearTimeout(timeoutId);
      if (this.routeRequestController === controller) {
        this.routeRequestController = null;
      }
    }
  }

  buildRouteMetrics(route) {
    const distanceMeters = Number(route && route.distanceMeters);
    const durationSeconds = Number(route && route.durationSeconds);

    // Estimacion media de marcha a pie: 5 km/h.
    const averageWalkingSpeedMps = 5000 / 3600;
    const averageDurationSeconds = Number.isFinite(distanceMeters)
      ? distanceMeters / averageWalkingSpeedMps
      : NaN;

    const distanceText = Number.isFinite(distanceMeters)
      ? distanceMeters >= 1000
        ? `${(distanceMeters / 1000).toFixed(2)} km`
        : `${Math.round(distanceMeters)} m`
      : "-";

    const durationApiText = this.formatMinutes(durationSeconds);
    const durationAverageText = this.formatMinutes(averageDurationSeconds);

    return {
      distanceText,
      durationApiText,
      durationAverageText,
    };
  }

  formatMinutes(seconds) {
    return Number.isFinite(seconds)
      ? `${Math.max(1, Math.round(seconds / 60))} min`
      : "-";
  }

  buildRouteSummary(routeMetrics) {
    const safeMetrics = routeMetrics || {};
    const distanceText = safeMetrics.distanceText || "-";
    const durationApiText = safeMetrics.durationApiText || "-";
    const durationAverageText = safeMetrics.durationAverageText || "-";

    return `Ruta a pie · ${distanceText} · ${durationApiText} (media ${durationAverageText})`;
  }

  buildRoutePanelText(routeMetrics) {
    const safeMetrics = routeMetrics || {};
    const distanceText = safeMetrics.distanceText || "-";
    const durationApiText = safeMetrics.durationApiText || "-";
    const durationAverageText = safeMetrics.durationAverageText || "-";
    const targetName = this.routeTargetStop
      ? String(this.routeTargetStop.name || "Parada")
      : "Parada";
    const targetId = this.routeTargetStop
      ? String(this.routeTargetStop.id || "")
      : "";
    const targetText = targetId ? `${targetName} (${targetId})` : targetName;
    return `Destino: ${targetText} · Distancia: ${distanceText} · Tiempo ruta: ${durationApiText} · Tiempo medio: ${durationAverageText}`;
  }

  updateRoutePanels(routeMetrics) {
    const text = this.buildRoutePanelText(routeMetrics);

    if (this.routeSummaryElementId) {
      const rowPanel = document.getElementById(this.routeSummaryElementId);
      if (rowPanel) {
        rowPanel.textContent = `Ruta a pie: ${text}`;
      }
    }

    if (this.mapRoutePanelElementId) {
      const mapPanel = document.getElementById(this.mapRoutePanelElementId);
      if (mapPanel) {
        mapPanel.textContent = text;
      }
    }
  }

  ensureMapRoutePanel(mapContainer, panelId) {
    if (!mapContainer || !panelId) return;

    let panel = document.getElementById(panelId);
    if (!panel) {
      panel = document.createElement("div");
      panel.id = panelId;
      panel.className =
        "pointer-events-none absolute bottom-2 left-2 right-2 z-[450] rounded-lg border border-white/15 bg-slate-900/80 px-3 py-2 text-xs text-slate-100 shadow";
      mapContainer.appendChild(panel);
    }

    panel.textContent = "Distancia: - · Tiempo ruta: - · Tiempo medio: -";
  }

  clearRouteLayer(map) {
    if (!this.routeLayer) return;
    const targetMap = map || this.currentMap;
    if (
      targetMap &&
      targetMap.hasLayer &&
      targetMap.hasLayer(this.routeLayer)
    ) {
      targetMap.removeLayer(this.routeLayer);
    }
    this.routeLayer = null;
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
    this.stopRealtimeLocationUpdates();
    this.realtimeLocationEnabled = false;

    if (this.currentMap && this.userMarker) {
      try {
        this.currentMap.removeLayer(this.userMarker);
      } catch (error) {
        // Ignore marker cleanup errors on destroyed maps.
      }
    }
    this.userMarker = null;

    this.topMenuControl = null;
    this.userPoint = null;
    this.selectedStopPoint = null;
    this.lineBounds = null;
    this.lastExpandedMapData = null;
    this.routeSummaryElementId = "";
    this.mapRoutePanelElementId = "";
    this.routeTargetStop = null;
    if (this.routeRequestController) {
      this.routeRequestController.abort();
      this.routeRequestController = null;
    }
    this.clearRouteLayer();
    if (this.mapResizeObserver) {
      this.mapResizeObserver.disconnect();
      this.mapResizeObserver = null;
    }
    this.mapContainerElement = null;
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
