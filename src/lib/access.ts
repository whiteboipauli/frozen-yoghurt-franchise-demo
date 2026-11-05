import type { Db, Store } from '../data/types'
import type { Session } from './ui-state'

/** Rechte: Laden sieht nur sich selbst; HQ sieht eigene Stores komplett, Franchise-Läden nur zur Kontrolle. */
export type Level = 'none' | 'control' | 'full'

export function levelFor(session: Session, store: Pick<Store, 'id' | 'own'>): Level {
  if (!session) return 'none'
  if (session.role === 'store') return session.storeId === store.id ? 'full' : 'none'
  return store.own ? 'full' : 'control'
}
export const canOpenStore = (session: Session, db: Pick<Db, 'stores'>, storeId: string) => {
  const s = db.stores.find((x) => x.id === storeId)
  return !!s && levelFor(session, s) !== 'none'
}
/** Was das HQ bei Franchise-Läden sehen darf (Kontrolldaten). Toppings, eigene Lieferanten und Personal gehören nicht dazu. */
export const hqMayView = (articleSource: 'zentrale' | 'extern') => articleSource === 'zentrale'
