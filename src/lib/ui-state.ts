import { welcomeOff, tourState } from '../ui/tour-state'
import { useSyncExternalStore } from 'react'

export type Mode = 'filiale' | 'zentrale'
export type Theme = 'light' | 'dark'
/** Demo-Login: Laden (sieht nur sich selbst) oder HQ */
export type Session = { role: 'store'; storeId: string } | { role: 'hq' } | null
interface UiState {
  session: Session
  /** abgeleitet aus der Anmeldung */
  mode: Mode
  /** Laden, dessen Seiten gerade gezeigt werden (Laden-Login: immer der eigene; HQ: gewählter eigener Store) */
  storeId: string
  theme: Theme
}
const KEY = 'fj-ww-ui-v3'
const SKEY = 'fj-ww-session-v1'
const FIRST_OWN = 'duesseldorf-carlstadt'
let state: UiState = { session: null, mode: 'filiale', storeId: FIRST_OWN, theme: 'light' }
try {
  const raw = localStorage.getItem(KEY)
  if (raw) state = { ...state, theme: JSON.parse(raw).theme === 'dark' ? 'dark' : 'light' }
} catch {
  /* ignorieren */
}
/** Gespeicherte Anmeldungen mit entfernter Rolle werden verworfen */
const validSession = (s: unknown): Session => (s && typeof s === 'object' && ((s as { role?: string }).role === 'hq' || (s as { role?: string; storeId?: unknown }).role === 'store' && typeof (s as { storeId?: unknown }).storeId === 'string') ? (s as Session) : null)
const derive = (session: Session, storeId: string): Pick<UiState, 'session' | 'mode' | 'storeId'> =>
  session?.role === 'store' ? { session, mode: 'filiale', storeId: session.storeId } : session?.role === 'hq' ? { session, mode: 'zentrale', storeId } : { session: null, mode: 'filiale', storeId }
try {
  const raw = sessionStorage.getItem(SKEY)
  if (raw) state = { ...state, ...derive(validSession(JSON.parse(raw)), FIRST_OWN) }
} catch {
  /* ignorieren */
}
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ theme: state.theme }))
    if (state.session) sessionStorage.setItem(SKEY, JSON.stringify(state.session))
    else sessionStorage.removeItem(SKEY)
  } catch {
    /* ignorieren */
  }
}
/** Nur Darstellung: Theme bzw. (für das HQ) welcher eigene Store gezeigt wird. Ein Laden-Login kann den Laden nie wechseln. */
export function setUi(patch: Partial<Pick<UiState, 'theme' | 'storeId'>> & { session?: Session }) {
  let next = { ...state }
  if (patch.theme) next.theme = patch.theme
  if (patch.session !== undefined) next = { ...next, ...derive(patch.session, patch.session?.role === 'hq' ? next.storeId : FIRST_OWN) }
  if (patch.storeId && state.session?.role === 'hq') next.storeId = patch.storeId
  state = next
  persist()
  emit()
}
export const login = (session: Exclude<Session, null>) => {
  setUi({ session })
  tourState.set({ welcome: !welcomeOff() })
}
export const logout = () => setUi({ session: null })
export const useUi = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )

export const applyTheme = () => {
  document.documentElement.dataset.theme = 'light'
}
export const getUi = () => state
