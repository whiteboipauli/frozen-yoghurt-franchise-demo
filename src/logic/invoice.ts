import type { Article, CentralOrder, Company, Db, Invoice, InvoiceLine, InvoiceState, InvoiceTax, Settings, Store } from '../data/types'
import { addDays, todayISO } from '../lib/date'

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const nfPack = new Intl.NumberFormat('de-DE')
export const packLabel = (a: Pick<Article, 'packSize' | 'unit'>) => `Karton à ${nfPack.format(a.packSize)} ${a.unit === 'kg' ? 'kg' : 'Stück'}`
export const packsOf = (l: { packs: number; confirmed?: number }) => l.confirmed ?? l.packs
export const VAT_NOTE = 'Steuersätze bitte mit Steuerberatung prüfen'

/** Nächste Rechnungsnummer aus dem einstellbaren Nummernkreis, z. B. „FY-2026-0001“ ({JJJJ} = Jahr des Rechnungsdatums) */
export function formatInvoiceNumber(cfg: Settings['invoiceNo'], date: string, n = cfg.next): string {
  return cfg.prefix.replace('{JJJJ}', date.slice(0, 4)) + String(n).padStart(cfg.pad, '0')
}

export function totalsOf(lines: Pick<InvoiceLine, 'net' | 'vatRate'>[]): { taxes: InvoiceTax[]; net: number; vat: number; gross: number } {
  const byRate = new Map<number, number>()
  for (const l of lines) byRate.set(l.vatRate, round2((byRate.get(l.vatRate) ?? 0) + l.net))
  const taxes: InvoiceTax[] = [...byRate.entries()].sort((a, b) => a[0] - b[0]).map(([rate, net]) => ({ rate, net, vat: round2((net * rate) / 100) }))
  const net = round2(taxes.reduce((s, t) => s + t.net, 0))
  const vat = round2(taxes.reduce((s, t) => s + t.vat, 0))
  return { taxes, net, vat, gross: round2(net + vat) }
}

/** Rechnungspositionen aus Lieferungen (bestätigte Mengen) */
export function linesFromOrders(articles: Article[], cos: CentralOrder[]): InvoiceLine[] {
  const out: InvoiceLine[] = []
  const sorted = [...cos].sort((a, b) => (a.shippedOn ?? a.createdOn).localeCompare(b.shippedOn ?? b.createdOn) || a.no.localeCompare(b.no))
  for (const co of sorted) {
    for (const l of co.lines) {
      const a = articles.find((x) => x.id === l.articleId)
      const q = packsOf(l)
      if (!a || q <= 0) continue
      out.push({ pos: out.length + 1, sku: a.sku ?? a.id, name: `${a.name} · ${packLabel(a)}`, qty: q, unit: 'Karton', unitNet: a.packPrice, vatRate: a.vatRate ?? 19, net: round2(q * a.packPrice), serviceDate: co.shippedOn ?? co.createdOn })
    }
  }
  return out
}

export interface MakeInvoice {
  id: string
  number: string
  date: string
  store: Store
  company: Company
  paymentDays: number
  articles: Article[]
  cos: CentralOrder[]
}
export function makeInvoice(m: MakeInvoice): Invoice {
  const lines = linesFromOrders(m.articles, m.cos)
  const dates = lines.map((l) => l.serviceDate).sort()
  const t = totalsOf(lines)
  return {
    id: m.id, number: m.number, type: 'rechnung', date: m.date, serviceFrom: dates[0] ?? m.date, serviceTo: dates[dates.length - 1] ?? m.date,
    dueDate: addDays(m.date, m.paymentDays), paymentDays: m.paymentDays, storeId: m.store.id, coIds: m.cos.map((c) => c.id),
    seller: { name: m.company.name, street: m.company.street, zipCity: m.company.zipCity, vatId: m.company.vatId, taxNumber: m.company.taxNumber, country: 'DE', iban: m.company.iban, bic: m.company.bic, bankName: m.company.bankName },
    buyer: { name: m.store.franchise.name, street: m.store.franchise.street, zipCity: m.store.franchise.zipCity, vatId: m.store.franchise.vatId, country: 'DE' },
    lines, ...t, currency: 'EUR',
  }
}

/** Stornorechnung (Gutschrift) mit Bezug auf die Originalrechnung: gleiche Positionen mit negativen Mengen */
export function makeStorno(orig: Invoice, id: string, number: string, date: string, reason: string): Invoice {
  const lines = orig.lines.map((l) => ({ ...l, qty: -l.qty, net: -l.net }))
  const t = totalsOf(lines)
  return { ...orig, id, number, type: 'storno', date, dueDate: date, paidOn: undefined, cancelledBy: undefined, lines, ...t, refId: orig.id, refNumber: orig.number, reason, coIds: [] }
}

export function invoiceState(inv: Invoice, today = todayISO()): InvoiceState {
  if (inv.type === 'storno') return 'Gutschrift'
  if (inv.cancelledBy) return 'storniert'
  if (inv.paidOn) return 'bezahlt'
  return inv.dueDate < today ? 'überfällig' : 'offen'
}
export const isOpenInvoice = (inv: Invoice, today = todayISO()) => ['offen', 'überfällig'].includes(invoiceState(inv, today))

export interface InvoiceSums { open: number; overdue: number; monthNet: number; monthGross: number }
/** Summen: offen (inkl. überfällig), überfällig, Rechnungsumsatz im Monat (Storno mindert den Umsatz) */
export function invoiceSums(invoices: Invoice[], today = todayISO()): InvoiceSums {
  let open = 0, overdue = 0, monthNet = 0, monthGross = 0
  const ym = today.slice(0, 7)
  for (const i of invoices) {
    const s = invoiceState(i, today)
    if (s === 'offen' || s === 'überfällig') open += i.gross
    if (s === 'überfällig') overdue += i.gross
    if (i.date.slice(0, 7) === ym) { monthNet += i.net; monthGross += i.gross }
  }
  return { open: round2(open), overdue: round2(overdue), monthNet: round2(monthNet), monthGross: round2(monthGross) }
}

export const nextCoNo = (db: Pick<Db, 'centralOrders'>) => `B-${String(db.centralOrders.reduce((m, c) => Math.max(m, Number(c.no.slice(2)) || 0), 0) + 1).padStart(4, '0')}`

/** EN 16931 (Kernmodell der E-Rechnung) – Felder als Business Terms (BT). Nur Datenstruktur, keine XML-Erzeugung. */
export function toEn16931(inv: Invoice) {
  return {
    BT1_invoiceNumber: inv.number,
    BT2_issueDate: inv.date,
    BT3_typeCode: inv.type === 'storno' ? '381' : '380', // 380 Handelsrechnung, 381 Gutschrift
    BT5_currency: inv.currency,
    BT9_dueDate: inv.dueDate,
    BT73_periodStart: inv.serviceFrom,
    BT74_periodEnd: inv.serviceTo,
    BG3_precedingInvoice: inv.refNumber ? { BT25_number: inv.refNumber } : undefined,
    BG4_seller: { BT27_name: inv.seller.name, BT35_street: inv.seller.street, BT37_cityZip: inv.seller.zipCity, BT40_country: inv.seller.country, BT31_vatId: inv.seller.vatId, BT32_taxNumber: inv.seller.taxNumber },
    BG7_buyer: { BT44_name: inv.buyer.name, BT50_street: inv.buyer.street, BT52_cityZip: inv.buyer.zipCity, BT55_country: inv.buyer.country, BT48_vatId: inv.buyer.vatId },
    BG16_payment: { BT81_meansCode: '58', BT84_iban: inv.seller.iban, BT86_bic: inv.seller.bic, BT20_terms: `Zahlbar innerhalb von ${inv.paymentDays} Tagen netto` },
    BG22_totals: { BT106_lineNetSum: inv.net, BT109_netTotal: inv.net, BT110_vatTotal: inv.vat, BT112_gross: inv.gross, BT115_payable: inv.gross },
    BG23_vatBreakdown: inv.taxes.map((t) => ({ BT116_taxable: t.net, BT117_vat: t.vat, BT118_category: 'S', BT119_rate: t.rate })),
    BG25_lines: inv.lines.map((l) => ({ BT126_id: l.pos, BT129_qty: l.qty, BT130_unit: 'C62', BT131_net: l.net, BT146_price: l.unitNet, BT153_name: l.name, BT155_sku: l.sku, BT151_vatCategory: 'S', BT152_vatRate: l.vatRate, BT134_serviceDate: l.serviceDate })),
  }
}
