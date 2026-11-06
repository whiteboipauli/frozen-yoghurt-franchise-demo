import { leadDays, todayISO } from '../lib/date'
import type { Article } from '../data/types'
import { packBase } from './consumption'
import type { ArticleForecast, Light } from './forecast'

export type Zone = 'wenig' | 'optimal' | 'viel'
export const ZONE_LABEL: Record<Zone, string> = { wenig: 'zu wenig', optimal: 'optimal', viel: 'zu viel' }
export const FRESH = ['erdbeeren', 'mango', 'blaubeeren', 'kiwi', 'himbeeren']

/** Gruppen für die Bestandsansicht */
export type StockGroup = 'alle' | 'becher' | 'pulver' | 'toppings'
export const GROUP_LABEL: Record<StockGroup, string> = { alle: 'Alle', becher: 'Becher & Zubehör', pulver: 'Frozen-Yoghurt-Pulver', toppings: 'Toppings' }
export const groupOf = (a: Pick<Article, 'id' | 'source' | 'category'>): Exclude<StockGroup, 'alle'> =>
  a.source === 'extern' ? 'toppings' : a.id === 'pulver' || a.category === 'Yoghurt' ? 'pulver' : 'becher'

export interface OrderPlan {
  /** Packungen, damit es bis zur nächsten Lieferung reicht (darunter: zu wenig) */
  min: number
  /** Vorschlag des Systems */
  opt: number
  /** darüber: zu viel */
  upper: number
  /** Ende des Reglers */
  max: number
  baseDays: number | null
  perPackDays: number | null
  reachDays: (packs: number) => number | null
  zone: (packs: number) => Zone
  warn: string
}

/** Bestellmenge mit Bereichen: zu wenig / optimal (Vorschlag) / zu viel – Reichweiten rechnen mit dem Ø Tagesverbrauch der nächsten 14 Tage */
export function orderPlan(f: ArticleForecast, targetDays: number): OrderPlan {
  const a = f.article
  const pb = packBase(a)
  const has = f.daily > 0
  const baseDays = has ? (Math.max(0, f.stock) + f.incomingQty) / f.daily : null
  const perPackDays = has ? pb / f.daily : null
  const need = (days: number) => (has ? Math.max(0, Math.ceil((days * f.daily - (Math.max(0, f.stock) + f.incomingQty)) / pb - 1e-9)) : 0)
  // „nächste Lieferung“ = Lieferzeit + eine Woche Bestellrhythmus
  const min = Math.max(1, need(leadDays(todayISO(), a.leadTimeDays) + 7))
  const opt = Math.max(min, f.suggestion?.packs ?? need(targetDays), 1)
  const upper = Math.max(opt, Math.ceil(opt * 1.3))
  const max = Math.max(upper + 2, Math.ceil(opt * 2.2), 6)
  const reachDays = (p: number) => (baseDays === null || perPackDays === null ? null : baseDays + p * perPackDays)
  const zone = (p: number): Zone => (p < min ? 'wenig' : p > upper ? 'viel' : 'optimal')
  const warn = FRESH.includes(a.id) ? 'Ware könnte vor dem Verbrauch schlecht werden.' : a.category === 'Becher' || a.category === 'Zubehör' ? 'Bindet unnötig Lagerplatz.' : 'Bindet unnötig Lagerplatz und Geld.'
  return { min, opt, upper, max, baseDays, perPackDays, reachDays, zone, warn }
}

export const ZONE_COLOR: Record<Zone, string> = { wenig: 'var(--bad)', optimal: 'var(--ok)', viel: 'var(--warn)' }
export const LIGHT_ORDER: Record<Light, number> = { red: 0, yellow: 1, green: 2 }
