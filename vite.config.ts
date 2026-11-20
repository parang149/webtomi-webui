import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import ui from '@nuxt/ui/vite'
import { version } from './package.json'

// Server API version this WEBUI is written for; the server refuses bundles it cannot serve.
const WEBUI_API = 2
const webuiManifest = { name: 'webui-manifest', generateBundle() { this.emitFile({ type: 'asset', fileName: 'webui.json', source: JSON.stringify({ version, api: WEBUI_API }) }) } }

export default defineConfig({
  plugins: [vue(), webuiManifest, ui({
    router: false,
    colorMode: false,
    autoImport: { dts: 'src/auto-imports.d.ts' },
    components: { dts: 'src/components.d.ts' },
    ui: { colors: { primary: 'emerald', neutral: 'zinc', doujinshi: 'rose', manga: 'fuchsia', artistcg: 'cyan', gamecg: 'indigo', anime: 'green', female: 'pink', male: 'blue', ehDoujinshi: 'red', ehManga: 'orange', ehArtistcg: 'yellow', ehGamecg: 'green', ehWestern: 'lime', ehNonh: 'cyan', ehImageset: 'blue', ehCosplay: 'purple', ehAsianporn: 'pink' } },
    theme: {
      defaultVariants: { size: 'lg' },
      // Work-type and tag tones from the original app, mapped to Tailwind palettes.
      colors: ['primary', 'success', 'error', 'doujinshi', 'manga', 'artistcg', 'gamecg', 'anime', 'female', 'male', 'ehDoujinshi', 'ehManga', 'ehArtistcg', 'ehGamecg', 'ehWestern', 'ehNonh', 'ehImageset', 'ehCosplay', 'ehAsianporn'],
    },
    // Bundle every icon so the browser never calls the public Iconify API.
    icon: { clientBundle: { scan: true, icons: ['lucide:layout-grid', 'lucide:list', 'lucide:circle-alert', 'lucide:circle-check', 'lucide:chevron-down', 'lucide:search', 'lucide:loader-circle','lucide:arrow-left','lucide:arrow-right','lucide:arrow-down','lucide:x','lucide:chevron-left','lucide:chevron-right','lucide:minus','lucide:plus','lucide:book-open','lucide:refresh-cw','lucide:folder-sync','lucide:chevrons-left','lucide:chevrons-right','lucide:ellipsis','lucide:arrow-down-wide-narrow','lucide:arrow-up-narrow-wide','lucide:download','lucide:pause'] } },
  })],
  define: { __APP_VERSION__: JSON.stringify(version) },
  server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:8080' } },
})
