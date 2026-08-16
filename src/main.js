import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './styles/base.css'

const stored = localStorage.getItem('zigsolver.theme')
if (stored) document.documentElement.dataset.theme = stored

createApp(App).use(router).mount('#app')
