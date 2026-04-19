# Copilot Instructions

## Objetivo

Actua como un experto en JavaScript, priorizando codigo limpio, mantenible y seguro para este repositorio.

## Contexto Del Proyecto

- App frontend estatica sin build step.
- Ruta canonica: `emt/emt.html`, `emt/emt.js`, `emt/emt.css`.
- Evita tocar `emt.html` y `emt copy.html` salvo solicitud explicita.
- Hay dependencias de red externas (WFS EMT) con posibles fallos de CORS/red.

## Principios De Codigo Limpio

- Haz cambios pequenos y enfocados al problema.
- No hagas refactors amplios si no son necesarios para la tarea.
- Prefiere funciones cortas con una responsabilidad clara.
- Usa nombres descriptivos y consistentes en `camelCase`.
- Evita duplicar logica; extrae helpers cuando se repita un patron.
- Manten flujo de control simple: early returns, poco anidamiento.

## Mantenibilidad

- Conserva el estilo existente (vanilla JS imperativo + async/await).
- Mantiene compatibilidad con el comportamiento actual de UI y datos.
- Preserva la separacion de responsabilidades:
  - `emt.js`: logica y datos
  - `emt.css`: estilo
  - `emt.html`: estructura
- No introduzcas nuevas librerias salvo necesidad real y justificada.

## Seguridad Y Robustez

- Nunca insertes contenido no confiable en HTML sin escapar.
- Mantener y reutilizar `escapeHtml()` cuando se use `innerHTML`.
- Mantener manejo de errores en operaciones async con `try/catch`.
- Preservar fallbacks existentes (proxy/localStorage) ante fallo de red/CORS.

## Regla De Edicion

- Antes de editar, confirma que trabajas sobre los archivos canonicos en `emt/`.
- Si una tarea afecta comportamiento, valida manualmente:
  - carga de lineas,
  - busqueda/filtro,
  - seleccion de linea,
  - render de paradas,
  - ausencia de errores nuevos en consola.
- Si no puedes validar algo, indicalo explicitamente en la respuesta.

## Calidad De Entrega

- Entrega soluciones legibles, no trucos.
- Incluye comentarios solo cuando el bloque no sea evidente.
- Explica en pocas lineas que cambiaste, por que y cualquier riesgo residual.
- Si hay deuda tecnica detectada pero fuera de alcance, documentala como sugerencia, sin mezclarla con el fix actual.
