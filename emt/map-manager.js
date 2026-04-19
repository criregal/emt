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

    this.currentMap = map;
    setTimeout(() => {
      if (this.currentMap) this.currentMap.invalidateSize();
    }, 0);
  }

  destroy() {
    if (this.currentMap && typeof this.currentMap.remove === "function") {
      this.currentMap.remove();
    }
    this.currentMap = null;
  }
}
