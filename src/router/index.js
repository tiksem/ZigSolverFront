import { watch } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import ConnectView from '../views/ConnectView.vue'
import { locale, t } from '../lib/i18n'

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

/**
 * The document title, which under the macOS shell is the TAB's name.
 *
 * A tab bar with three tabs all called "ZigSolver" is a tab bar you have to
 * click through, so this is short and specific — "Table 5", not "Table 5 ·
 * ZigSolver". In a browser it is the window title and reads the same way.
 *
 * Re-applied on a language change as well as on a navigation: the tab is still
 * open when the language button is pressed, and a title left in the old
 * language would be the one thing on screen that did not follow.
 */
function applyTitle(route) {
  if (!route) return
  if (route.name === 'table') document.title = t('table.title', { index: route.params.index })
  else if (route.name === 'check') document.title = t('connect.checkLink')
  else document.title = t('connect.heading')
}

router.afterEach((to) => applyTitle(to))
watch(locale, () => applyTitle(router.currentRoute.value))

export default router
