import { useSyncExternalStore } from 'react'

export interface TourState {
  active: boolean
  welcome: boolean
  role: 'store' | 'hq'
  step: number
  final: boolean
  mangoBefore: number | null
  mangoAfter: number | null
}
let state: TourState = { active: false, welcome: false, role: 'store', step: 0, final: false, mangoBefore: null, mangoAfter: null }
const ls = new Set<() => void>()
export const tourState = {
  get: () => state,
  set(p: Partial<TourState>) {
    state = { ...state, ...p }
    ls.forEach((l) => l())
  },
}
export const useTour = () => useSyncExternalStore((l) => (ls.add(l), () => ls.delete(l)), () => state)
export const markWelcomed = () => {
  try {
    localStorage.setItem('fj-ww-welcomed', '1')
  } catch {
    /* ignorieren */
  }
}

/** Aktueller Wert aus dem Browser-Speicher (nicht nur beim App-Start gelesen) */
export const isWelcomed = () => { try { return !!localStorage.getItem('fj-ww-welcomed') } catch { return true } }

/** Dauerhafter Merker „Nicht mehr automatisch zeigen“ */
const OFF = 'fj-ww-welcome-off'
export const welcomeOff = () => { try { return !!localStorage.getItem(OFF) } catch { return false } }
export const setWelcomeOff = (on: boolean) => { try { if (on) localStorage.setItem(OFF, '1'); else localStorage.removeItem(OFF) } catch { /* ignorieren */ } }
