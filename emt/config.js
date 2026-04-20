export const APP_CONFIG = {
  wfsLinesUrl:
    "https://geoportal.emtvalencia.es/geoserver/wfs?service=wfs&version=1.1.0&request=GetFeature&outputFormat=json&srsName=EPSG:4326&typeName=emt:Lineas",
  wfsStopsUrl:
    "https://geoportal.emtvalencia.es/geoserver/wfs?service=wfs&version=1.1.0&request=GetFeature&outPutFormat=json&srsName=EPSG:4326&typeName=emt:Paradas",
  paradasUrlBase:
    "https://geoportal.emtvalencia.es/ciudadano/servicios/paradas_linea.php",
  arrivalsUrlBase:
    "https://geoportal.emtvalencia.es/EMT/mapfunctions/MapUtilsPetitions.php",
  paradasUsuario: "7gH8m45w7A",
  corsProxy: "https://api.allorigins.win/raw?url=",
  storageKey: "emt_lineas_v1",
  storageStopsKey: "emt_paradas",
  storageStopsNormalizedKey: "emt_paradas_normalizadas_v1",
  storageStopLinesIndexKey: "emt_paradas_lineas_index_v2",
  storageStopDirectionsIndexKey: "emt_paradas_sentidos_index_v3",
  firstRunFlagKey: "emt_first_run_done_v1",
  requestTimeoutMs: 10000,
  arrivalsRequestTimeoutMs: 9000,
  proxyTimeoutMs: 12000,
  stopLinesIndexConcurrency: 10,
  storageSettingsKey: "emt_settings_v1",
};
