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

      window.L.circleMarker([lat, lon], {
        radius: 5,
        color: "#f59e0b",
        weight: 1.5,
        fillColor: "#fbbf24",
        fillOpacity: 0.75,
      })
        .addTo(map)
        .bindPopup(
          `${this.escapeHtml(stop.name || "Parada")} (${this.escapeHtml(stop.id || "-")})`,
        );

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

  destroy() {
    this.topMenuControl = null;
    this.userPoint = null;
    this.selectedStopPoint = null;
    this.lineBounds = null;
    if (this.currentMap && typeof this.currentMap.remove === "function") {
      this.currentMap.remove();
    }
    this.currentMap = null;
  }
}
