import './index.css'
import { createApp } from 'vue'
import ui from '@nuxt/ui/vue-plugin'
import AuthGate from './AuthGate.vue'

createApp(AuthGate).use(ui).mount('#app')
