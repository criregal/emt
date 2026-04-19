import { APP_CONFIG } from "./config.js";
import { BusApp } from "./app.js";

const app = new BusApp(APP_CONFIG);
app.init();

window.BusApp = {
  getLines: () => app.getLinesSnapshot(),
  fetchLinesFromWFS: () => app.fetchLinesFromWFS(),
  loadStopsForLine: (lineId) => app.loadStopsForLine(lineId),
  showMenu: () => app.setScreen("menu"),
  showLines: () => app.setScreen("lines"),
  showStops: () => app.setScreen("stops"),
};
