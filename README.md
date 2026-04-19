# EMT Valencia Dashboard

Aplicacion web estatica (sin build step) para explorar lineas y paradas EMT Valencia, con visualizacion en mapa (Leaflet), rutas a pie y panel de llegadas SAE por parada.

## Estructura recomendada para publicar

- `index.html` -> entrada raiz para GitHub Pages (redirige a la app)
- `emt/emt.html` -> pagina canonica de la app
- `emt/emt.js` -> entrypoint JS
- `emt/app.js` -> orquestacion de estado y flujo
- `emt/services.js` -> capa de datos / red / parseo
- `emt/map-manager.js` -> logica de mapa Leaflet
- `emt/ui.js` -> render de tablas y UI
- `emt/emt.css` -> estilos complementarios
- `aa.json` -> dataset local de apoyo

## Publicacion en GitHub Pages

1. Sube el repositorio a GitHub.
2. En GitHub, entra en `Settings > Pages`.
3. En `Build and deployment`, selecciona:
   - Source: `Deploy from a branch`
   - Branch: `main` (o la rama que uses)
   - Folder: `/ (root)`
4. Guarda y espera el despliegue.
5. Abre la URL de Pages: cargara `index.html` y redirigira a `emt/emt.html`.

## Ejecucion local

Desde la raiz del repo:

```bash
python3 -m http.server 8000
```

Luego abre:

- `http://localhost:8000/emt/emt.html`

## Notas tecnicas

- La app depende de servicios externos EMT/WFS y puede sufrir CORS o indisponibilidad.
- Existen fallbacks por proxy/localStorage para mejorar resiliencia.
- El endpoint SAE puede devolver avisos de servicio en lugar de tiempos reales.
