import type { Company, Db, Invoice, InvoiceLine, Recipe, SaleDay, Store } from '../data/types'
import { addDays, todayISO } from '../lib/date'
import { formatInvoiceNumber, round2, totalsOf } from './invoice'

/** Umsatzsteuer auf den Verkauf (Außer-Haus-Satz); der Kassenumsatz ist brutto, Gebühren werden vom Netto berechnet */
export const REV_VAT = 1.07
export interface RevCtx { saleDays: SaleDay[]; recipes: Recipe[]; toppingPrice: number }
export const revCtx = (db: Pick<Db, 'saleDays' | 'recipes' | 'settings'>): RevCtx => ({ saleDays: db.saleDays, recipes: db.recipes, toppingPrice: db.settings.toppingPrice })

const idx = new WeakMap<SaleDay[], Map<string, SaleDay[]>>()
/** Verkaufstage eines Ladens (sortiert nach Datum, zwischengespeichert) */
export function saleDaysOf(days: SaleDay[], storeId: string): SaleDay[] {
  let m = idx.get(days)
  if (!m) {
    m = new Map()
    for (const d of days) { const l = m.get(d.storeId); if (l) l.push(d); else m.set(d.storeId, [d]) }
    for (const l of m.values()) l.sort((a, b) => a.date.localeCompare(b.date))
    idx.set(days, m)
  }
  return m.get(storeId) ?? []
}
export function dayGross(ctx: RevCtx, d: SaleDay): number {
  let s = 0
  for (const r of ctx.recipes) s += (d.counts[r.id] ?? 0) * r.price
  for (const n of Object.values(d.toppings)) s += n * ctx.toppingPrice
  return s
}
export const dayCupsOf = (d: SaleDay) => Object.values(d.counts).reduce((a, b) => a + b, 0)
/** Kassenumsatz netto im Zeitraum (inkl.) */
export function revenueNet(ctx: RevCtx, storeId: string, from: string, to: string): number {
  let g = 0
  for (const d of saleDaysOf(ctx.saleDays, storeId)) if (d.date >= from && d.date <= to) g += dayGross(ctx, d)
  return round2(g / REV_VAT)
}

export const monthBounds = (ym: string): [string, string] => {
  const from = `${ym}-01`
  const next = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 1)
  return [from, addDays(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`, -1)]
}
export const monthLabel = (ym: string) => new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' }).format(new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, 1))
/** Die letzten n vollständigen Monate, neuester zuerst */
export function lastMonths(n: number, today = todayISO()): string[] {
  const out: string[] = []
  let y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7))
  for (let i = 0; i < n; i++) {
    m--
    if (m === 0) { m = 12; y-- }
    out.push(`${y}-${String(m).padStart(2, '0')}`)
  }
  return out
}

export interface Fee { base: number; license: number; marketing: number; total: number }
export function feeFor(ctx: RevCtx, fees: { license: number; marketing: number }, storeId: string, ym: string): Fee {
  const [a, b] = monthBounds(ym)
  const base = revenueNet(ctx, storeId, a, b)
  const license = round2((base * fees.license) / 100)
  const marketing = round2((base * fees.marketing) / 100)
  return { base, license, marketing, total: round2(license + marketing) }
}
export const feeInvoiceOf = (db: Pick<Db, 'invoices'>, storeId: string, ym: string): Invoice | undefined =>
  db.invoices.find((i) => i.kind === 'gebuehr' && i.storeId === storeId && i.feeMonth === ym && i.type === 'rechnung' && !i.cancelledBy)

export interface MakeFee { id: string; number: string; date: string; store: Store; company: Company; paymentDays: number; ym: string; fee: Fee; pct: { license: number; marketing: number } }
const nf = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
/** Rechnung über Lizenzgebühr und Werbebeitrag (gleiche Pflichtangaben wie die Warenrechnung) */
export function makeFeeInvoice(m: MakeFee): Invoice {
  const [, end] = monthBounds(m.ym)
  const mk = (pos: number, sku: string, what: string, pct: number, net: number): InvoiceLine => ({
    pos, sku, name: `${what} ${new Intl.NumberFormat('de-DE').format(pct)} % auf Netto-Kassenumsatz ${monthLabel(m.ym)} (${nf.format(m.fee.base)} €)`, qty: 1, unit: 'pauschal', unitNet: net, vatRate: 19, net, serviceDate: end,
  })
  const lines = [mk(1, 'FR-LIZ', 'Lizenzgebühr', m.pct.license, m.fee.license), mk(2, 'FR-WERB', 'Werbebeitrag', m.pct.marketing, m.fee.marketing)]
  const t = totalsOf(lines)
  return {
    id: m.id, number: m.number, type: 'rechnung', kind: 'gebuehr', feeMonth: m.ym, date: m.date, serviceFrom: `${m.ym}-01`, serviceTo: end, dueDate: addDays(m.date, m.paymentDays), paymentDays: m.paymentDays,
    storeId: m.store.id, coIds: [],
    seller: { name: m.company.name, street: m.company.street, zipCity: m.company.zipCity, vatId: m.company.vatId, taxNumber: m.company.taxNumber, country: 'DE', iban: m.company.iban, bic: m.company.bic, bankName: m.company.bankName },
    buyer: { name: m.store.franchise.name, street: m.store.franchise.street, zipCity: m.store.franchise.zipCity, vatId: m.store.franchise.vatId, country: 'DE' },
    lines, ...t, currency: 'EUR',
  }
}
export { formatInvoiceNumber }
