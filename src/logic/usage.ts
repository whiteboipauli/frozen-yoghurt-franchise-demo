import type { Db } from '../data/types'
import { addDays, range, todayISO } from '../lib/date'
import { CUP_IDS, POWDER_ID } from './forecast'
import { fromBase } from './consumption'
import { INV_GREEN, INV_YELLOW, inventoryOfPeriod, monthEnd, monthOf, prevMonth } from './inventory'
import { usedOn } from './stock'
import type { Level } from '../ui/signal'

/** Verbrauch = Anfangsbestand + Wareneingang − Endbestand (aus den Monatsinventuren, Pulver in kg, Becher in Stück) */
export interface Usage {
  articleId: string
  ym: string
  /** Zeitraum (Anfangsbestand gilt am Ende des Vortags von `from`) */
  from: string
  to: string
  start: number
  incoming: number
  end: number
  used: number
  /** erwarteter Verbrauch aus den Verkäufen (Kasse, Schwund-Pauschale und gemeldete Abgänge) */
  expected: number
  /** Abweichung in Prozent: positiv = mehr verbraucht als erwartet */
  pct: number | null
  /** der Monat beginnt erst mit dem Datenbestand (kein voller Monat) */
  partial: boolean
}

/** Bestand, Wareneingang und Verbrauch eines Monats; null, wenn Anfangs- oder Endzählung fehlt */
export function usageOfMonth(db: Db, storeId: string, articleId: string, ym: string): Usage | null {
  const art = db.articles.find((a) => a.id === articleId)
  if (!art) return null
  const endInv = inventoryOfPeriod(db, storeId, ym)
  const endLine = endInv?.lines.find((l) => l.articleId === articleId)
  if (!endInv || !endLine) return null
  const startInv = inventoryOfPeriod(db, storeId, prevMonth(ym))
  const startLine = startInv?.lines.find((l) => l.articleId === articleId)
  let from: string, startBase: number, partial = false
  if (startInv && startLine) { from = addDays(startInv.date, 1); startBase = startLine.counted }
  else if (monthOf(db.startDate) === ym) { from = db.startDate; startBase = db.openingStock[storeId]?.[articleId] ?? 0; partial = true }
  else return null
  const to = endInv.date
  let incoming = 0, expected = 0
  for (const d of db.deliveries) if (d.storeId === storeId && d.articleId === articleId && d.date >= from && d.date <= to && d.date <= todayISO()) incoming += d.qty
  for (const d of range(from, to)) expected += usedOn(db, storeId, articleId, d)
  const used = startBase + incoming - endLine.counted
  const f = (n: number) => cartons(art, fromBase(art, n))
  return { articleId, ym, from, to, start: f(startBase), incoming: f(incoming), end: f(endLine.counted), used: f(used), expected: f(expected), pct: expected > 0 ? ((used - expected) / expected) * 100 : null, partial }
}

/** Signal für die Abweichung: bis 5 % In Ordnung, bis 10 % Bald, darüber Dringend */
export const usageLevel = (pct: number | null): Level => (pct === null ? 'info' : Math.abs(pct) <= INV_GREEN ? 'gruen' : Math.abs(pct) <= INV_YELLOW ? 'bernstein' : 'rot')

/** Die letzten abgeschlossenen Monate (neuester zuletzt) */
export function lastMonths(n = 6, today = todayISO()): string[] {
  const out: string[] = []
  let ym = prevMonth(monthOf(today))
  for (let i = 0; i < n; i++) { out.unshift(ym); ym = prevMonth(ym) }
  return out
}

/** Pulver zählt in Kartons (kg je Karton steht im Artikelstamm) */
export const cartons = (a: { unit: string; source?: string; packSize?: number }, kg: number) => (a.unit === 'kg' && a.source === 'zentrale' && a.packSize ? kg / a.packSize : kg)
export const USAGE_ARTICLES = [POWDER_ID, ...CUP_IDS]
/** Gruppen für die Anzeige: Pulver, Becher S/M/L */
export const USAGE_GROUPS: { id: string; label: string; unit: string; ids: string[] }[] = [
  { id: 'pulver', label: 'Frozen-Yoghurt-Pulver', unit: 'Kartons', ids: [POWDER_ID] },
  { id: 'becher-s', label: 'Becher S', unit: 'Stück', ids: ['becher-s'] },
  { id: 'becher-m', label: 'Becher M', unit: 'Stück', ids: ['becher-m'] },
  { id: 'becher-l', label: 'Becher L', unit: 'Stück', ids: ['becher-l'] },
]

export interface UsageSum { used: number; expected: number; pct: number | null; months: number; partial: boolean }
const sumOf = (list: (Usage | null)[]): UsageSum => {
  const u = list.filter((x): x is Usage => !!x)
  const used = u.reduce((s, x) => s + x.used, 0), expected = u.reduce((s, x) => s + x.expected, 0)
  return { used, expected, pct: expected > 0 ? ((used - expected) / expected) * 100 : null, months: u.length, partial: u.some((x) => x.partial) }
}
/** Verbrauch einer Gruppe (z. B. Pulver) in einem Monat */
export const usageGroupMonth = (db: Db, storeId: string, ids: string[], ym: string) => sumOf(ids.map((id) => usageOfMonth(db, storeId, id, ym)))
/** Verbrauch einer Gruppe seit Januar des Jahres (alle vorhandenen Monate) */
export function usageGroupYear(db: Db, storeId: string, ids: string[], year: number, today = todayISO()) {
  const list: (Usage | null)[] = []
  for (let m = 1; m <= 12; m++) {
    const ym = `${year}-${String(m).padStart(2, '0')}`
    if (ym >= monthOf(today)) break
    for (const id of ids) list.push(usageOfMonth(db, storeId, id, ym))
  }
  return sumOf(list)
}
export { monthEnd }

/** Zwischenzählung (Sonder-Inventur) im laufenden Monat: Verbrauch seit der letzten Monatsinventur bis zu diesem Datum, je Artikel */
export function usageInterim(db: Db, storeId: string, ids: string[], today = todayISO()): { until: string; used: Record<string, number>; expected: Record<string, number> } | null {
  const mine = db.inventories.filter((i) => i.storeId === storeId)
  const monthly = mine.filter((i) => i.kind !== 'sonder').sort((a, b) => b.date.localeCompare(a.date))[0]
  const sonder = mine.filter((i) => i.kind === 'sonder' && monthly && i.date > monthly.date && i.date <= today).sort((a, b) => b.date.localeCompare(a.date))[0]
  if (!monthly || !sonder) return null
  const used: Record<string, number> = {}, expected: Record<string, number> = {}
  for (const id of ids) {
    const art = db.articles.find((a) => a.id === id)
    const s = monthly.lines.find((l) => l.articleId === id), e = sonder.lines.find((l) => l.articleId === id)
    if (!art || !s || !e) continue
    let incoming = 0, exp = 0
    for (const d of db.deliveries) if (d.storeId === storeId && d.articleId === id && d.date > monthly.date && d.date <= sonder.date) incoming += d.qty
    for (const d of range(addDays(monthly.date, 1), sonder.date)) exp += usedOn(db, storeId, id, d)
    used[id] = cartons(art, fromBase(art, s.counted + incoming - e.counted))
    expected[id] = cartons(art, fromBase(art, exp))
  }
  return Object.keys(used).length ? { until: sonder.date, used, expected } : null
}
