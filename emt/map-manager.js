export class LeafletMapManager {
  constructor(statusPresenter, escapeHtml) {
    this.status = statusPresenter;
    this.escapeHtml =
      typeof escapeHtml === "function"
        ? escapeHtml
        : (value) => String(value || "");
    this.currentMap = null;
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

    this.addUserLocationMarker(map, lat, lon);

    this.currentMap = map;
    setTimeout(() => {
      if (this.currentMap) this.currentMap.invalidateSize();
    }, 0);
  }

  addUserLocationMarker(map, stopLat, stopLon) {
    if (
      typeof navigator === "undefined" ||
      !navigator.geolocation ||
      typeof navigator.geolocation.getCurrentPosition !== "function"
    ) {
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!this.currentMap || this.currentMap !== map) return;

        const userLat = Number(position.coords.latitude);
        const userLon = Number(position.coords.longitude);
        if (!Number.isFinite(userLat) || !Number.isFinite(userLon)) return;

        const userMarker = window.L.circleMarker([userLat, userLon], {
          radius: 7,
          color: "#22d3ee",
          weight: 2,
          fillColor: "#0891b2",
          fillOpacity: 0.9,
        })
          .addTo(map)
          .bindPopup("Tu ubicación actual");

        const stopPoint = window.L.latLng(stopLat, stopLon);
        const userPoint = window.L.latLng(userLat, userLon);
        const bounds = window.L.latLngBounds([stopPoint, userPoint]);
        if (stopPoint.distanceTo(userPoint) > 30) {
          map.fitBounds(bounds.pad(0.25));
        }

        return userMarker;
      },
      (error) => {
        console.warn("No se pudo obtener la ubicación del usuario", error);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000,
      },
    );
  }

  destroy() {
    if (this.currentMap && typeof this.currentMap.remove === "function") {
      this.currentMap.remove();
    }
    this.currentMap = null;
  }
}
