# webtomi-webui

Browser front end (WEBUI) for a self-hosted gallery server. Vue 3 + Nuxt UI.

- Each push to `main` builds the WEBUI and publishes `webui-v<version>.zip` with a `.sha256` file as a GitHub release (version from `package.json`).
- The server checks the latest release from Settings › About and installs it on request; Docker images also carry a built-in copy.
- `webui.json` in the bundle names the WEBUI version and the server API version it needs.

Licensed under MIT (see `LICENSE`), based on code by lanyeeee.

WEBUI 0.2.4 requires server 0.5.4 (API 2) for Reddit online links, saved-media deletion and independent latest-list refresh. Update the server first.

WEBUI 0.2.5 requires server 0.5.6 (API 3) for per-item metadata refresh and persisted failed-download retries. Update the server first.
