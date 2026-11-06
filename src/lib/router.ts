import { useSyncExternalStore } from 'react'

const sub = (l: () => void) => {
  window.addEventListener('hashchange', l)
  return () => window.removeEventListener('hashchange', l)
}
export const useRoute = () => useSyncExternalStore(sub, () => window.location.hash.replace(/^#/, '') || '/')
export const go = (path: string) => {
  window.location.hash = path
}

/* App-Verlauf: merkt sich die besuchten Seiten, damit „Zurück“ dorthin führt, woher man kam */
const here = () => window.location.hash.replace(/^#/, '') || '/'
const trail: string[] = [here()]
window.addEventListener('hashchange', () => {
  const r = here()
  if (trail.length > 1 && trail[trail.length - 2] === r) trail.pop()
  else if (trail[trail.length - 1] !== r) trail.push(r)
})
/** Gibt es eine vorherige App-Seite (ohne die Anmeldeseite)? */
export const canGoBack = () => trail.length > 1 && trail[trail.length - 2] !== '/'
/** Zurück zur vorherigen App-Seite, sonst zur übergeordneten Liste */
export const goBack = (fallback: string) => (canGoBack() ? window.history.back() : go(fallback))
