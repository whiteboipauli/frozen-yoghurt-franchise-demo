import { useSyncExternalStore } from 'react'

/** Von Hand auf die Bestellliste gesetzte Artikel (z. B. aus dem Bestand: „Jetzt bestellen“) – je Laden Artikel → Packungen */
let state: Record<string, Record<string, number>> = {}
const ls = new Set<() => void>()
const emit = () => ls.forEach((l) => l())
export const manualList = {
  get: (storeId: string) => state[storeId] ?? {},
  add(storeId: string, articleId: string, packs: number) { state = { ...state, [storeId]: { ...(state[storeId] ?? {}), [articleId]: Math.max(1, Math.round(packs)) } }; emit() },
  remove(storeId: string, articleId: string) { const m = { ...(state[storeId] ?? {}) }; delete m[articleId]; state = { ...state, [storeId]: m }; emit() },
  reset() { state = {}; emit() },
}
export const useManualList = (storeId: string) => useSyncExternalStore((l) => (ls.add(l), () => ls.delete(l)), () => state[storeId] ?? EMPTY)
const EMPTY: Record<string, number> = {}
