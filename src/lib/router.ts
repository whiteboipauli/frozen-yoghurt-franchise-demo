import { useSyncExternalStore } from 'react'

const sub = (l: () => void) => {
  window.addEventListener('hashchange', l)
  return () => window.removeEventListener('hashchange', l)
}
export const useRoute = () => useSyncExternalStore(sub, () => window.location.hash.replace(/^#/, '') || '/')
export const go = (path: string) => {
  window.location.hash = path
}
