import type { Db } from '../data/types'
import { addDays, deliveryOn, todayISO } from '../lib/date'
import { packBase } from './consumption'
import { expectedUse, incomingFor } from './forecast'
import { stockNow } from './stock'

export interface StockSim {
  /** je Tag ab heute (60 Tage): reicht der Bestand für den Verbrauch des Tages? */
  covered: boolean[]
  /** erster Tag ohne Deckung (0 = heute; 60 = innerhalb von 60 Tagen nie) */
  firstGap: number
}

/** Eine Berechnung für alle Anzeigen: Bestand heute, Prognose-Verbrauch je Tag, Lieferung nach Lieferzeit (neue Menge) und bereits Bestelltes */
export function stockSim(db: Db, storeId: string, articleId: string, packs: number, today = todayISO()): StockSim {
  const a = db.articles.find((x) => x.id === articleId)!
  const arrive = new Map<string, number>()
  for (const i of incomingFor(db, storeId, articleId, today)) arrive.set(i.date, (arrive.get(i.date) ?? 0) + i.qty)
  if (packs > 0) { const d = deliveryOn(today, a.leadTimeDays); arrive.set(d, (arrive.get(d) ?? 0) + packs * packBase(a)) }
  let stock = Math.max(0, stockNow(db, storeId, articleId))
  const covered: boolean[] = []
  for (let i = 0; i < 60; i++) {
    const d = addDays(today, i)
    stock += arrive.get(d) ?? 0
    const use = expectedUse(db, storeId, articleId, d, today)
    if (stock >= use) { stock -= use; covered.push(true) } else { stock = 0; covered.push(false) }
  }
  const g = covered.indexOf(false)
  return { covered, firstGap: g < 0 ? 60 : g }
}
/** Kurztext „reicht noch …“ aus derselben Berechnung */
export const reichtText = (firstGap: number) => (firstGap <= 0 ? 'heute leer' : firstGap >= 14 ? 'reicht über 14 Tage' : `reicht noch ${firstGap} Tag${firstGap === 1 ? '' : 'e'}`)
