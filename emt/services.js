export class StorageService {
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

export class HttpClient {
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

export class EMTApi {
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

        const coordsFromGeometry = this.extractCoordinatesFromFeature(feature);
        const lonFromProps = this.parseCoordinate(
          this.pickFromNormalizedMap(normalizedMap, [
            "xlong",
            "longitud",
            "long",
            "lon",
            "lng",
          ]),
        );
        const latFromProps = this.parseCoordinate(
          this.pickFromNormalizedMap(normalizedMap, ["ylat", "latitud", "lat"]),
        );

        const lon =
          coordsFromGeometry && coordsFromGeometry.lon !== null
            ? coordsFromGeometry.lon
            : lonFromProps;
        const lat =
          coordsFromGeometry && coordsFromGeometry.lat !== null
            ? coordsFromGeometry.lat
            : latFromProps;

        return {
          id: String(stopId),
          name: String(stopName),
          line: normalizedLine,
          lat,
          lon,
        };
      })
      .filter((stop) => stop.name || stop.id);
  }

  extractCoordinatesFromFeature(feature) {
    const geometry = feature && feature.geometry ? feature.geometry : null;
    const coords =
      geometry && Array.isArray(geometry.coordinates)
        ? geometry.coordinates
        : null;
    if (!coords || coords.length < 2) {
      return { lat: null, lon: null };
    }

    const lon = this.parseCoordinate(coords[0]);
    const lat = this.parseCoordinate(coords[1]);
    return { lat, lon };
  }

  parseCoordinate(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
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
}
