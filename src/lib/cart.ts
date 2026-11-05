import { useSyncExternalStore } from 'react'

/** Warenkorb „Bei der Zentrale bestellen“. Liegt außerhalb der Seite, damit die Bestellliste und die Tour ihn befüllen können. */
export interface CartState {
  storeId: string
  lines: Record<string, number>
  wish: string
  note: string
  /** zuletzt abgesendete Bestellung (zeigt die Auftragsbestätigung im Vordergrund) */
  justSent: string
  /** Warenkorb-Fenster (von rechts) ist geöffnet */
  open: boolean
}
const blank = (): CartState => ({ storeId: '', lines: {}, wish: '', note: '', justSent: '', open: false })
let state: CartState = blank()
const ls = new Set<() => void>()
const emit = () => ls.forEach((l) => l())
export const cart = {
  get: () => state,
  reset() { state = blank(); emit() },
  /** Warenkorb gehört zu einer Filiale; beim Wechsel wird er geleert */
  bind(storeId: string) { if (state.storeId !== storeId) { state = { ...blank(), storeId }; emit() } },
  set(articleId: string, packs: number) {
    const lines = { ...state.lines }
    if (packs <= 0) delete lines[articleId]
    else lines[articleId] = Math.min(999, Math.round(packs))
    state = { ...state, lines }
    emit()
  },
  add(articleId: string, d = 1) { cart.set(articleId, (state.lines[articleId] ?? 0) + d) },
  /** Vorgeschlagene Mengen übernehmen (ersetzt die Menge je Artikel) */
  fill(storeId: string, items: { articleId: string; packs: number }[]) {
    state = { ...(state.storeId === storeId ? state : blank()), storeId, lines: { ...(state.storeId === storeId ? state.lines : {}) } }
    for (const i of items) state.lines[i.articleId] = i.packs
    emit()
  },
  setWish(wish: string) { state = { ...state, wish }; emit() },
  setNote(note: string) { state = { ...state, note }; emit() },
  setOpen(open: boolean) { state = { ...state, open }; emit() },
  setSent(justSent: string) { state = { ...state, justSent }; emit() },
}
export const useCart = () => useSyncExternalStore((l) => (ls.add(l), () => ls.delete(l)), () => state)
