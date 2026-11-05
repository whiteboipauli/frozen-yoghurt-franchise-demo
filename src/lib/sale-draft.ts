import { useSyncExternalStore } from 'react'

/** Aktueller Verkaufsentwurf (Verkauf testen). Liegt außerhalb der Seite, damit die Tour ihn „für dich“ ausfüllen kann. */
export interface SaleDraft {
  recipeId: string
  toppings: Record<string, number>
}
const blank = (): SaleDraft => ({ recipeId: 'froyo-m', toppings: {} })
let state: SaleDraft = blank()
const ls = new Set<() => void>()
const emit = () => ls.forEach((l) => l())
export const saleDraft = {
  get: () => state,
  reset() { state = blank(); emit() },
  setRecipe(id: string, signature: boolean) { state = { recipeId: id, toppings: signature ? {} : state.toppings }; emit() },
  add(id: string) { state = { ...state, toppings: { ...state.toppings, [id]: Math.min(9, (state.toppings[id] ?? 0) + 1) } }; emit() },
  sub(id: string) {
    const n = (state.toppings[id] ?? 0) - 1
    const t = { ...state.toppings }
    if (n <= 0) delete t[id]
    else t[id] = n
    state = { ...state, toppings: t }; emit()
  },
}
export const useSaleDraft = () => useSyncExternalStore((l) => (ls.add(l), () => ls.delete(l)), () => state)
