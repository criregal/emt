# AGENTS.md

## Scope

- This repository is a static frontend app for exploring EMT Valencia bus lines and stops.
- Primary implementation lives in `emt/`.

## Canonical Files

- `emt/emt.html`: main entry page (modular version).
- `emt/emt.js`: app logic and data flow.
- `emt/emt.css`: visual styles and responsive layout.
- `aa.json`: sample GeoJSON dataset used for local fallback/testing.

## Non-Canonical / Cleanup Candidatess

- `emt.html`: monolithic variant (inline CSS/JS).
- `emt copy.html`: duplicate of monolithic variant.
- `emt/EmtClient.js`: currently unused stub.

Prefer making feature changes in the modular path (`emt/emt.html`, `emt/emt.js`, `emt/emt.css`) unless the task explicitly targets legacy files.

## Run And Verify

- No build step, no package manager scripts.
- Local run options:
  - `python3 -m http.server 8000` from repo root, then open `http://localhost:8000/emt/emt.html`.
  - Or open `emt/emt.html` directly in browser for quick checks.
- Validation is manual in browser DevTools (Console + Network + localStorage).

## External Data And Reliability Notes

- App fetches bus lines/stops from EMT GeoServer/WFS endpoints.
- Network/CORS failures are expected in some environments.
- Existing behavior includes fallback paths (proxy and/or local storage). Preserve these unless a task requests otherwise.

## Code Conventions

- JavaScript style is framework-free, imperative DOM updates, async/await, camelCase.
- Keep `escapeHtml()` protections when writing HTML strings into the DOM.
- CSS uses custom properties and responsive grid/flex patterns; keep existing variable naming.
- Avoid broad refactors; apply minimal, targeted edits.

## Safe Change Workflow For Agents

1. Confirm which HTML variant the user wants touched (modular vs monolithic).
2. Implement smallest viable change in modular files by default.
3. Manually test in browser:
   - load lines,
   - search/filter,
   - select a line,
   - verify stops rendering,
   - verify no new console errors.
4. If behavior depends on remote API, test fallback scenario (offline or blocked request) and confirm app remains usable.

## Common Pitfalls

- Editing `emt.html` (root) when the user is actually using `emt/emt.html`.
- Removing fallback logic and breaking resilience under CORS/network issues.
- Introducing unescaped HTML into rendered lists.
- Assuming `EmtClient.js` is integrated when it is currently not wired in.

## Suggested Next Customizations

- Add `/.github/instructions/frontend.instructions.md` for UI/UX and accessibility-specific guardrails.
- Add `/.github/instructions/data-fetch.instructions.md` for WFS/CORS/fallback handling patterns.
- Add a skill for "manual-browser-regression-check" to standardize pre-delivery validation steps.
