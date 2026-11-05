import type { CostTargets, Db, MonthlyReport } from '../data/types'
import { addDays, todayISO } from '../lib/date'
import { monthBounds, revCtx, revenueNet } from './fees'
import { monthOf, nextMonth, prevMonth } from './inventory'
import type { Level } from '../ui/signal'

export type CostKey = 'staff' | 'rent' | 'goods' | 'other'
export const COST_KEYS: CostKey[] = ['staff', 'rent', 'goods', 'other']
export const COST_LABEL: Record<CostKey, string> = { staff: 'Personal', rent: 'Miete', goods: 'Warenkosten', other: 'Sonstige Nebenkosten' }
export const COST_SHORT: Record<CostKey, string> = { staff: 'Personal', rent: 'Miete', goods: 'Waren', other: 'Sonstiges' }
export const DEFAULT_TARGETS: CostTargets = { staff: 30, rent: 10, goods: 32, other: 6 }
/** Ampel-Regel für alle Kostenquoten (eine zentrale Stelle): bis zum Richtwert In Ordnung, bis 15 % über dem Richtwert (relativ) Bald, darüber Dringend */
export const COST_SOON = 1.15
/** Gemeldeter Monatsumsatz weicht vom Kassenumsatz ab: ab 2 % Bald, ab 5 % Dringend */
export const REPORT_SOON = 2
export const REPORT_URGENT = 5

export function costLevel(pct: number | null, target: number): Level {
  if (pct === null) return 'info'
  return pct <= target ? 'gruen' : pct <= target * COST_SOON ? 'bernstein' : 'rot'
}

const PACKAGING = new Set(['Becher', 'Zubehör'])

/** Wareneinsatz und Verpackung eines Zeitraums aus den Rechnungen des HQ nach Lieferdatum der Positionen (Becher und Zubehör = Verpackung, Rest = Ware) und den Lieferanten-Bestellungen (Toppings) */
export function goodsOf(db: Db, storeId: string, from: string, to: string): { goods: number; packaging: number } {
  const bySku = new Map(db.articles.filter((a) => a.sku).map((a) => [a.sku!, a]))
  let goods = 0, packaging = 0
  for (const inv of db.invoices) {
    if (inv.storeId !== storeId || inv.kind === 'gebuehr') continue
    for (const l of inv.lines) {
      if (l.serviceDate < from || l.serviceDate > to) continue
      const a = bySku.get(l.sku)
      if (a && PACKAGING.has(a.category)) packaging += l.net
      else goods += l.net
    }
  }
  const art = new Map(db.articles.map((a) => [a.id, a]))
  for (const o of db.orders) {
    if (o.storeId !== storeId || o.status !== 'geliefert' || !o.deliveredOn || o.deliveredOn < from || o.deliveredOn > to) continue
    for (const l of o.lines) {
      const a = art.get(l.articleId)
      if (!a) continue
      const v = l.packs * a.packPrice
      if (PACKAGING.has(a.category)) packaging += v
      else goods += v
    }
  }
  return { goods, packaging }
}

export const reportOf = (db: Pick<Db, 'monthlyReports'>, storeId: string, ym: string): MonthlyReport | undefined => db.monthlyReports.find((r) => r.storeId === storeId && r.ym === ym)

/** Welcher Monat ist zu melden? Ab dem 1. des Folgemonats der Vormonat, solange dafür noch nichts gemeldet ist */
export function dueReportMonth(db: Pick<Db, 'monthlyReports'>, storeId: string, today = todayISO()): string | null {
  const prev = prevMonth(monthOf(today))
  return reportOf(db, storeId, prev) ? null : prev
}

export interface Fin {
  revenue: number
  staff: number | null
  rent: number | null
  goods: number | null
  other: number | null
  /** Kosten sind aus dem Vormonat geschätzt, weil noch nichts gemeldet wurde */
  estimated: boolean
  /** für diesen Zeitraum liegt keine Meldung und keine Schätzung vor */
  missing: boolean
}

const lastDay = (ym: string, today: string) => { const [, to] = monthBounds(ym); return to >= today ? addDays(today, -1) : to }

/** Umsatz (Summe der Tagesumsätze) und gemeldete Kosten eines Ladens für einen Monat. Ohne Meldung gelten die Quoten des letzten gemeldeten Monats (geschätzt). */
export function storeMonthFin(db: Db, storeId: string, ym: string, today = todayISO()): Fin {
  const ctx = revCtx(db)
  const [from] = monthBounds(ym)
  const to = lastDay(ym, today)
  const revenue = to >= from ? revenueNet(ctx, storeId, from, to) : 0
  const rep = reportOf(db, storeId, ym)
  if (rep) return { revenue, staff: rep.staffCost, rent: rep.rent, goods: rep.goodsCost, other: rep.otherCost, estimated: false, missing: false }
  let p = prevMonth(ym)
  for (let i = 0; i < 4; i++, p = prevMonth(p)) {
    const r = reportOf(db, storeId, p)
    if (!r) continue
    const [pf, pt] = monthBounds(p)
    const prevRev = revenueNet(ctx, storeId, pf, pt)
    if (prevRev <= 0) continue
    const k = revenue / prevRev
    return { revenue, staff: r.staffCost * k, rent: r.rent * k, goods: r.goodsCost * k, other: r.otherCost * k, estimated: true, missing: false }
  }
  return { revenue, staff: null, rent: null, goods: null, other: null, estimated: true, missing: true }
}

/** Summe mehrerer Läden bzw. Monate: Quoten nur über Läden/Monate, für die Kosten vorliegen */
export function sumFin(list: Fin[]): Fin & { quoteRevenue: number } {
  const known = list.filter((f) => !f.missing)
  const sum = (k: CostKey) => known.reduce((s, f) => s + (f[k] ?? 0), 0)
  return {
    revenue: list.reduce((s, f) => s + f.revenue, 0),
    staff: sum('staff'), rent: sum('rent'), goods: sum('goods'), other: sum('other'),
    estimated: list.some((f) => f.estimated && !f.missing),
    missing: known.length === 0,
    quoteRevenue: known.reduce((s, f) => s + f.revenue, 0),
  }
}
export type Quotes = Record<CostKey, number | null>
export function quotesOf(f: Fin & { quoteRevenue?: number }): Quotes {
  const base = f.quoteRevenue ?? f.revenue
  const q = (v: number | null) => (v === null || base <= 0 ? null : (v / base) * 100)
  return { staff: q(f.staff), rent: q(f.rent), goods: q(f.goods), other: q(f.other) }
}

/** Die abgeschlossenen Monate des Jahres (Januar bis zum letzten vollen Monat) */
export function monthsOfYear(db: Db, year: number, today = todayISO()): string[] {
  const out: string[] = []
  for (let m = 1; m <= 12; m++) {
    const ym = `${year}-${String(m).padStart(2, '0')}`
    if (ym >= monthOf(today)) continue
    out.push(ym)
  }
  return out
}
export const storeYearFin = (db: Db, storeId: string, year: number, today = todayISO()) => sumFin(monthsOfYear(db, year, today).map((ym) => storeMonthFin(db, storeId, ym, today)))

export const dayRevenueOf = (db: Db, storeId: string, date: string) => revenueNet(revCtx(db), storeId, date, date)
export { nextMonth }

/** Abweichung des gemeldeten Monatsumsatzes vom Kassenumsatz (Summe der Tagesumsätze) in Prozent; null ohne Meldung */
export function reportMismatch(db: Db, storeId: string, ym: string, today = todayISO()): number | null {
  const rep = reportOf(db, storeId, ym)
  if (!rep) return null
  const rev = storeMonthFin(db, storeId, ym, today).revenue
  return rev > 0 ? ((rep.revenue - rev) / rev) * 100 : null
}
export const mismatchLevel = (pct: number | null): Level => (pct === null || Math.abs(pct) <= REPORT_SOON ? 'gruen' : Math.abs(pct) <= REPORT_URGENT ? 'bernstein' : 'rot')

/** Der schwerste Hinweis eines Ladens (Stufe und kurzer Grund); null = nichts Auffälliges */
export function worstHint(f: Fin & { quoteRevenue?: number }, targets: CostTargets, mismatch: number | null): { level: Level; text: string } | null {
  const q = quotesOf(f)
  const cands: { level: Level; text: string; sev: number }[] = []
  for (const k of COST_KEYS) {
    const lv = costLevel(q[k], targets[k])
    if (lv === 'bernstein' || lv === 'rot') cands.push({ level: lv, text: `${COST_LABEL[k]} ${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(q[k]!)} % (Richtwert ${targets[k]} %)`, sev: (q[k]! / targets[k]) })
  }
  const ml = mismatchLevel(mismatch)
  if (ml !== 'gruen') cands.push({ level: ml, text: 'Meldung weicht vom Kassenumsatz ab', sev: ml === 'rot' ? 5 : 1.2 })
  cands.sort((a, b) => (a.level === b.level ? b.sev - a.sev : a.level === 'rot' ? -1 : 1))
  return cands[0] ?? null
}
