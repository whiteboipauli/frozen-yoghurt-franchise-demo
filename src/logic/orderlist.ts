import type { Article, Db } from '../data/types'
import { todayISO } from '../lib/date'
import { packBase } from './consumption'
import { packsOf } from './invoice'
import { byUrgency, forecastAll, type Light } from './forecast'

export type ItemStatus = 'offen' | 'bestellt' | 'geliefert'
export interface OrderItem {
  key: string
  article: Article
  packs: number
  qty: number
  supplier: string
  latestOrderDate: string | null
  light: Light
  status: ItemStatus
  orderId?: string
  /** Tage, die der vorhandene Bestand (inkl. Zulauf) noch reicht, und Tage je bestellter Packung – für „reicht dann bis …“ */
  baseDays?: number
  perPackDays?: number
  reach?: number | null
}
/** Reichweite in Tagen nach Lieferung von `packs` Packungen */
export const reachAfter = (i: Pick<OrderItem, 'baseDays' | 'perPackDays'>, packs: number) => (i.baseDays === undefined || !i.perPackDays ? null : i.baseDays + packs * i.perPackDays)

const days = (f: { daily: number; stock: number; incomingQty: number; article: Article }) => (f.daily > 0 ? { baseDays: (Math.max(0, f.stock) + f.incomingQty) / f.daily, perPackDays: packBase(f.article) / f.daily } : {})

/** Bestellliste: automatisch aus der Prognose, plus heute bestellte/gelieferte Positionen */
export function orderList(db: Db, storeId: string, extra: Record<string, number> = {}): OrderItem[] {
  const today = todayISO()
  const open: OrderItem[] = forecastAll(db, storeId)
    .filter((f) => f.suggestion && !f.ordered)
    .sort(byUrgency)
    .map((f) => ({ key: `o|${f.article.id}`, article: f.article, packs: f.suggestion!.packs, qty: f.suggestion!.qty, supplier: f.article.supplier, latestOrderDate: f.latestOrderDate, light: f.light, status: 'offen' as const, ...days(f), reach: f.reach }))
  const fc = forecastAll(db, storeId)
  for (const [id, packs] of Object.entries(extra)) {
    const f = fc.find((x) => x.article.id === id)
    if (!f || f.ordered || open.some((o) => o.article.id === id)) continue
    open.push({ key: `m|${id}`, article: f.article, packs, qty: packs * packBase(f.article), supplier: f.article.supplier, latestOrderDate: f.latestOrderDate, light: f.light, status: 'offen', ...days(f), reach: f.reach })
  }
  const done: OrderItem[] = []
  for (const o of db.orders) {
    if (o.storeId !== storeId || (o.orderedOn !== today && o.deliveredOn !== today)) continue
    for (const l of o.lines) {
      const a = db.articles.find((x) => x.id === l.articleId)
      if (!a) continue
      done.push({ key: `d|${o.id}|${a.id}`, article: a, packs: l.packs, qty: l.packs * packBase(a), supplier: o.supplier === 'Headquarter' ? 'Headquarter' : a.supplier, latestOrderDate: null, light: 'green', status: o.status === 'geliefert' ? 'geliefert' : 'bestellt', orderId: o.id })
    }
  }
  for (const c of db.centralOrders) {
    if (c.storeId !== storeId || (c.createdOn !== today && c.shippedOn !== today && c.deliveredOn !== today)) continue
    for (const l of c.lines) {
      const a = db.articles.find((x) => x.id === l.articleId)
      if (!a) continue
      done.push({ key: `c|${c.id}|${a.id}`, article: a, packs: packsOf(l), qty: packsOf(l) * packBase(a), supplier: 'Headquarter', latestOrderDate: null, light: 'green', status: c.status === 'eingegangen' || c.status === 'bestätigt' || c.status === 'versendet' ? 'bestellt' : 'geliefert', orderId: c.id })
    }
  }
  return [...open, ...done]
}
