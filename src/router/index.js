import { createRouter, createWebHashHistory } from 'vue-router'
import ConnectView from '../views/ConnectView.vue'

// Hash history: the built app is a static bundle dropped into whatever
// directory the Kotlin server serves, with no rewrite rules to configure.
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'connect', component: ConnectView },
    {
      path: '/table/:index',
      name: 'table',
      component: () => import('../views/TableView.vue'),
      props: (route) => ({ index: Number(route.params.index) }),
    },
    { path: '/check', name: 'check', component: () => import('../views/CheckView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior: () => ({ top: 0 }),
})

export default router
