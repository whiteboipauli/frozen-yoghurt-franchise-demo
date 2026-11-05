import type { Db } from '../data/types'
import { addDays, range, todayISO } from '../lib/date'
import { consumptionOfDay, lookup } from './consumption'

type ByArticleDate = Map<string, Map<string, number>>
interface StoreCalc {
  kasse: ByArticleDate // Verbrauch laut Kasse (ohne Schwund)
  outflow: ByArticleDate // eingetragene sonstige Abgänge
  deliveries: ByArticleDate // nur Lieferungen mit Datum ≤ heute
  corrections: ByArticleDate
  series: Map<string, Map<string, number>> // articleId → date → Bestand am Tagesende
}

const cache = new WeakMap<Db, Map<string, StoreCalc>>()

function put(m: ByArticleDate, a: string, d: string, q: number) {
  let inner = m.get(a)
  if (!inner) m.set(a, (inner = new Map()))
  inner.set(d, (inner.get(d) ?? 0) + q)
}

/** Schwund-Pauschale als Anteil (0–1) */
export const shrinkRate = (db: Db, articleId: string) => Math.min(0.5, Math.max(0, (db.settings.shrink[articleId] ?? 0) / 100))

export function storeCalc(db: Db, storeId: string): StoreCalc {
  let perStore = cache.get(db)
  if (!perStore) cache.set(db, (perStore = new Map()))
  const hit = perStore.get(storeId)
  if (hit) return hit
  const lk = lookup(db)
  const today = todayISO()
  const calc: StoreCalc = { kasse: new Map(), outflow: new Map(), deliveries: new Map(), corrections: new Map(), series: new Map() }
  for (const day of db.saleDays) {
    if (day.storeId !== storeId) continue
    for (const [aid, q] of Object.entries(consumptionOfDay(day, lk))) put(calc.kasse, aid, day.date, q)
  }
  for (const b of db.outflows) if (b.storeId === storeId) put(calc.outflow, b.articleId, b.date, b.qty)
  for (const d of db.deliveries) if (d.storeId === storeId && d.date <= today) put(calc.deliveries, d.articleId, d.date, d.qty)
  for (const inv of db.inventories) {
    if (inv.storeId !== storeId) continue
    for (const l of inv.lines) put(calc.corrections, l.articleId, inv.date, l.counted - l.expected)
  }
  perStore.set(storeId, calc)
  return calc
}

const get = (m: ByArticleDate, a: string, d: string) => m.get(a)?.get(d) ?? 0

export const kasseOn = (db: Db, storeId: string, articleId: string, date: string) => get(storeCalc(db, storeId).kasse, articleId, date)
export const outflowOn = (db: Db, storeId: string, articleId: string, date: string) => get(storeCalc(db, storeId).outflow, articleId, date)
export const deliveredOn = (db: Db, storeId: string, articleId: string, date: string) => get(storeCalc(db, storeId).deliveries, articleId, date)
/** Gesamtverbrauch = Kasse + Schwund-Pauschale + sonstige Abgänge. Pauschale: p von 100 gelieferten Stück gehen verloren → Kasse / (1 − p). */
export const usedOn = (db: Db, storeId: string, articleId: string, date: string) =>
  kasseOn(db, storeId, articleId, date) / (1 - shrinkRate(db, articleId)) + outflowOn(db, storeId, articleId, date)

/** Rechnerischer Bestand am Tagesende (Basiseinheit) */
export function stockEnd(db: Db, storeId: string, articleId: string, date: string): number {
  const calc = storeCalc(db, storeId)
  let s = calc.series.get(articleId)
  if (!s) {
    s = new Map()
    let cur = db.openingStock[storeId]?.[articleId] ?? 0
    for (const d of range(db.startDate, addDays(todayISO(), 0))) {
      cur += get(calc.deliveries, articleId, d) + get(calc.corrections, articleId, d) - usedOn(db, storeId, articleId, d)
      s.set(d, cur)
    }
    calc.series.set(articleId, s)
  }
  if (date < db.startDate) return db.openingStock[storeId]?.[articleId] ?? 0
  return s.get(date > todayISO() ? todayISO() : date) ?? 0
}
export const stockNow = (db: Db, storeId: string, articleId: string) => stockEnd(db, storeId, articleId, todayISO())
