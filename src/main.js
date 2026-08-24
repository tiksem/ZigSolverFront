import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './styles/base.css'
import { initTheme } from './lib/theme'
import { initLocale } from './lib/i18n'

// Before mount, so the first paint is already in the remembered appearance and
// the remembered language — neither should be visible switching after load.
initTheme()
initLocale()

createApp(App).use(router).mount('#app')
