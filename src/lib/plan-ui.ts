import { useSyncExternalStore } from 'react'
import { todayISO } from './date'
import { weekStart } from '../logic/weekly'
import { diffDays } from './date'

export type PlanView = 'kalender' | 'tage' | 'matrix'
interface PlanState { view: PlanView; week: number; focus: string | null; /** gewünschte Ansicht der Dienstplan-Seite beim nächsten Öffnen */ pageView?: 'woche' | 'monat' | 'tag' }
/** Zustand des Dienstplans (Ansicht, angezeigte Woche, hervorgehobener Tag) – außerhalb der Seite, damit Übersicht und Tour ihn steuern können */
let state: PlanState = { view: 'kalender', week: 0, focus: null }
const ls = new Set<() => void>()
const set = (p: Partial<PlanState>) => { state = { ...state, ...p }; ls.forEach((l) => l()) }
export const planUi = {
  get: () => state,
  setView: (view: PlanView) => set({ view }),
  setWeek: (week: number) => set({ week: Math.max(0, Math.min(1, week)), focus: null }),
  /** Springt in den Kalender zu diesem Tag (richtige Woche, Tag hervorgehoben) */
  openDay: (date: string) => set({ view: 'kalender', week: Math.max(0, Math.min(1, Math.floor(diffDays(date, todayISO()) / 7))), focus: date }),
  clearFocus: () => set({ focus: null }),
  /** Dienstplan in der Tagesansicht von heute öffnen */
  openTagToday: () => set({ pageView: 'tag', week: 0, focus: null }),
  takePageView: () => { const v = state.pageView; if (v) state = { ...state, pageView: undefined }; return v },
}
export const usePlanUi = () => useSyncExternalStore((l) => (ls.add(l), () => ls.delete(l)), () => state)
