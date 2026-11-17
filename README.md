# webtomi-webui

Browser front end (WEBUI) for a self-hosted gallery server. Vue 3 + Nuxt UI.

- Each push to `main` builds the WEBUI and publishes `webui-v<version>.zip` with a `.sha256` file as a GitHub release (version from `package.json`).
- The server checks the latest release from Settings › About and installs it on request; Docker images also carry a built-in copy.
- `webui.json` in the bundle names the WEBUI version and the server API version it needs.

Licensed under MIT (see `LICENSE`), based on code by lanyeeee.
