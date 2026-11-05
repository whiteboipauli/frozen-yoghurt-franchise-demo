import { brand } from '../brand'
import type { Article, Campaign, CentralOrder, Db, Delivery, Employee, Inventory, Invoice, KnowEntry, Order, Outflow, Post, Recipe, SaleDay, Settings } from './types'
import { defaultSchoolHolidays, legalHolidayOn } from './holidays'
import { CITY_COORDS, DEMO_STORE, DEMO_STORE_2, DEMO_STORE_3, DEMO_STORES, OWN_STORES, seedStores, STORE_CFG, TOUR_STORE } from './stores'
import { carrierFor, makeTracking } from '../logic/shipping'
import { defaultHr, hash01, seedHr } from './seedHr'
import { rainClass, syntheticWx, wxFor, type WxDay, type WxMap } from '../logic/weather'
import { tuneMango } from '../logic/tourprep'
import { addDays, diffDays, range, todayISO, weekdayIdx } from '../lib/date'
import { consumptionOfDay, lookup, packBase } from '../logic/consumption'
import { stockEnd, usedOn } from '../logic/stock'
import { monthEnd, prevMonth } from '../logic/inventory'
import { dayOfYear } from '../logic/history'
import { formatInvoiceNumber, makeInvoice } from '../logic/invoice'
import { goodsOf } from '../logic/finance'
import { feeFor, lastMonths, makeFeeInvoice, monthBounds, revCtx, revenueNet } from '../logic/fees'
import { candidatesForGap } from '../logic/staffplan'
import { dayStaffing } from '../logic/staffing'

export const DB_VERSION = 20
export const HISTORY_DAYS = 90
/** Verkaufshistorie: 13 Monate (inkl. Vorjahr) */
export const SALES_DAYS = 400

function mulberry32(a: number) {
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const L1 = 'Fruchtwelt'
const L2 = 'Metro'
const L3 = 'Saucen & Mehr'
const L4 = 'Dessert-Zutaten Großhandel'

type TopSpec = [id: string, name: string, supplier: string, packKg: number, portionG: number, lead: number, price: number, weight: number]
const TOPPINGS: TopSpec[] = [
  ['erdbeeren', 'Erdbeeren', L1, 2, 30, 1, 14.9, 10],
  ['mango', 'Mango', L1, 2, 30, 1, 13.5, 9],
  ['blaubeeren', 'Blaubeeren', L1, 1, 25, 1, 9.5, 6],
  ['kiwi', 'Kiwi', L1, 2, 30, 1, 11.2, 5],
  ['himbeeren', 'Himbeeren', L1, 1, 25, 1, 10.9, 4],
  ['oreo', 'Oreo-Crumble', L2, 2, 20, 2, 14.5, 10],
  ['biscoff', 'Biscoff-Crumble', L2, 2, 20, 2, 21, 8],
  ['brownie', 'Brownie-Stücke', L2, 2, 25, 2, 17, 6],
  ['granola', 'Granola', L2, 3, 20, 2, 14, 5],
  ['kokos', 'Kokosflocken', L2, 2, 12, 2, 9.5, 4],
  ['mandeln', 'Mandeln', L2, 1, 12, 2, 11.5, 3],
  ['gummibaerchen', 'Gummibärchen', L2, 2, 20, 2, 9.9, 3],
  ['schokosauce', 'Schokoladensauce', L3, 2, 15, 2, 11.9, 9],
  ['karamellsauce', 'Karamellsauce', L3, 2, 15, 2, 12.5, 7],
  ['matchasauce', 'Matcha-Sauce', L3, 1, 15, 3, 21, 3],
  ['mochi', 'Mochi', L4, 1, 20, 3, 16, 6],
  ['boba', 'Popping Boba', L4, 2, 25, 3, 22, 5],
]

export function seedArticles(): Article[] {
  const y = (id: string, sku: string, name: string, category: string, unit: 'kg' | 'Stück', packSize: number, price: number, vat: number, portionGrams?: number): Article => ({
    id, sku, name, category, source: 'zentrale', supplier: 'Zentrale', unit, packSize, packPrice: price, vatRate: vat, available: true, leadTimeDays: ({ pulver: 2, 'becher-s': 2, 'becher-m': 2, 'becher-l': 2, deckel: 2 } as Record<string, number>)[id] ?? 3, portionGrams,
  })
  // Preise so kalibriert, dass Wareneinsatz (~27 %) und Verpackung (~3,7 %) vom Umsatz zu den Richtwerten des HQ passen
  const cal = (a: Article): Article => ({ ...a, packPrice: Math.round(a.packPrice * (a.category === 'Becher' || a.category === 'Zubehör' ? PACK_CAL : GOODS_CAL) * 100) / 100 })
  return ([
    y('pulver', `${brand.artikelPrefix}-1001`, 'Frozen-Yoghurt-Pulver', 'Yoghurt', 'kg', 10, 94, 7, 160),
    y('becher-s', `${brand.artikelPrefix}-2001`, 'Becher S', 'Becher', 'Stück', 50, 9.5, 19),
    y('becher-m', `${brand.artikelPrefix}-2002`, 'Becher M', 'Becher', 'Stück', 50, 11.5, 19),
    y('becher-l', `${brand.artikelPrefix}-2003`, 'Becher L', 'Becher', 'Stück', 50, 13.9, 19),
    y('loeffel', `${brand.artikelPrefix}-2010`, 'Löffel', 'Zubehör', 'Stück', 250, 7.9, 19),
    y('deckel', `${brand.artikelPrefix}-2020`, 'Deckel', 'Zubehör', 'Stück', 100, 6.9, 19),
    y('servietten', `${brand.artikelPrefix}-2030`, 'Servietten', 'Zubehör', 'Stück', 500, 8.5, 19),
    y('tragetasche', `${brand.artikelPrefix}-2040`, 'Tragetaschen', 'Zubehör', 'Stück', 100, 12.5, 19),
    ...TOPPINGS.map(([id, name, supplier, packKg, portionG, lead, price]) => ({
      id, name, category: 'Topping', source: 'extern' as const, supplier, unit: 'kg' as const, packSize: packKg, portionGrams: portionG, leadTimeDays: lead, packPrice: price,
    })),
  ] as Article[]).map(cal)
}
const GOODS_CAL = 0.84
const PACK_CAL = 0.6

export function seedRecipes(): Recipe[] {
  const size = (id: string, name: string, cup: string, g: number, price: number): Recipe => ({
    id, name, kind: 'size', cupId: cup, spoonId: 'loeffel', powderId: 'pulver', powderGrams: g, fixedToppings: [], extras: { deckel: 1, servietten: 1, tragetasche: 0.08 }, price,
  })
  return [
    size('froyo-s', 'Frozen Yoghurt S', 'becher-s', 110, 3.9),
    size('froyo-m', 'Frozen Yoghurt M', 'becher-m', 160, 5.5),
    size('froyo-l', 'Frozen Yoghurt L', 'becher-l', 220, 7.2),
  ]
}

const WD_FACTOR = [0.78, 0.8, 0.86, 0.96, 1.2, 1.5, 1.4]
/** Zusätzlicher unerklärter Schwund (Anteil der Lieferung) bei Bechern und Pulver, zusätzlich zur Pauschale. Nur die Demo-Filiale ist auffällig. */
function lossCfg(storeId: string) {
  if (storeId === DEMO_STORE) return { lossBase: 0.006, lossLate: 0.085 }
  return { lossBase: 0.0008 + hash01(storeId + 'lb') * 0.0012, lossLate: 0.0008 + hash01(storeId + 'll') * 0.002 }
}
/** Demo-Pauschalen in % (HQ kann sie in den Einstellungen ändern) */
export function defaultShrink(): Record<string, number> {
  const fruit = ['erdbeeren', 'mango', 'blaubeeren', 'kiwi', 'himbeeren']
  const sauce = ['schokosauce', 'karamellsauce', 'matchasauce']
  const out: Record<string, number> = { 'becher-s': 4, 'becher-m': 4, 'becher-l': 4, pulver: 3, loeffel: 5, deckel: 4, servietten: 6, tragetasche: 3 }
  for (const t of TOPPINGS) out[t[0]] = fruit.includes(t[0]) ? 8 : sauce.includes(t[0]) ? 4 : 3
  return out
}
const RAIN_FACTOR = { trocken: 1, leicht: 0.82, stark: 0.6 }
const SIZE_WEIGHTS: [string, number][] = [['froyo-s', 0.25], ['froyo-m', 0.45], ['froyo-l', 0.3]]
const TOPW = TOPPINGS.filter((t) => t[7] > 0)
const TOPW_SUM = TOPW.reduce((s, t) => s + t[7], 0)

/** Verkäufe mit deutschem Saison- und Wettermuster */
function genSales(storeId: string, state: Parameters<typeof legalHolidayOn>[0], days: string[], today: string, rnd: () => number, wxAt: (d: string) => WxDay | null, ferien: (d: string) => boolean): SaleDay[] {
  const base = STORE_CFG[storeId].base * 3
  const N = days.length
  return days.map((date, i) => {
    const trend = 0.93 + (i / N) * 0.07
    const season = 1 + 0.15 * Math.sin((2 * Math.PI * (dayOfYear(date) - 105)) / 365)
    const w = wxAt(date)
    const weather = w
      ? Math.min(1.4, Math.max(0.55, 0.6 + 0.027 * (w.tmax - 3))) * (0.85 + 0.03 * Math.min(14, w.sun)) * RAIN_FACTOR[rainClass(w.rain)] * (0.97 + rnd() * 0.06)
      : 0.9 + rnd() * 0.2
    const hol = legalHolidayOn(state, date) ? 1.25 : 1
    const fer = ferien(date) ? 1.1 : 1
    let total = base * WD_FACTOR[weekdayIdx(date)] * season * weather * hol * fer * trend * (0.94 + rnd() * 0.12)
    if (date === today) total *= 0.42
    total = Math.round(total)
    const counts: Record<string, number> = {}
    const shares = SIZE_WEIGHTS.map(([, s]) => s * (0.92 + rnd() * 0.16))
    const ss = shares.reduce((a, b) => a + b, 0)
    let left = total
    SIZE_WEIGHTS.forEach(([id], k) => {
      const c = k === 2 ? left : Math.round((total * shares[k]) / ss)
      left -= c
      counts[id] = Math.max(0, c)
    })
    const toppings: Record<string, number> = {}
    const portions = total * 1.9 * (0.92 + rnd() * 0.16)
    for (const t of TOPW) toppings[t[0]] = Math.round((portions * t[7]) / TOPW_SUM * (0.82 + rnd() * 0.36))
    return { storeId, date, counts, toppings }
  })
}

const SCHED: Record<string, number[]> = { [brand.lieferant]: [1, 4], [L3]: [1, 4], [L4]: [1, 4], [L1]: [0, 3], [L2]: [0, 3] }
const leadOfSupplier = (articles: Article[], sup: string) => Math.max(...articles.filter((a) => a.supplier === sup).map((a) => a.leadTimeDays))

export function buildSeed(wxByLoc?: Record<string, WxMap | null>): Db {
  const today = todayISO()
  const startDate = addDays(today, -HISTORY_DAYS)
  const shrink = defaultShrink()
  const articles = seedArticles()
  const recipes = seedRecipes()
  const stores = seedStores()
  const schoolHolidays = defaultSchoolHolidays()
  const lk = lookup({ articles, recipes })
  const saleDays: SaleDay[] = []
  const orders: Order[] = []
  const deliveries: Delivery[] = []
  const outflows: Outflow[] = []
  const openingStock: Db['openingStock'] = {}
  const snaps: Record<string, Record<string, Record<string, number>>> = {}
  const useAll: Record<string, Map<string, Record<string, number>>> = {}
  let oid = 1, did = 1, oidf = 1

  const locations = Object.fromEntries(stores.map((st) => [st.id, CITY_COORDS[st.city]]))
  const allDays = range(addDays(today, -SALES_DAYS), today)
  const synth = new Map<string, WxMap>()

  for (const store of stores) {
    const cfg = { ...STORE_CFG[store.id], ...lossCfg(store.id) }
    const rnd = mulberry32(cfg.seed)
    const loc = locations[store.id]
    const real = wxFor(loc)
    let syn = synth.get(`${loc.lat}`)
    if (!syn) synth.set(`${loc.lat}`, (syn = syntheticWx(loc.lat, allDays)))
    const wxAt = (d: string) => real?.[d] ?? syn![d] ?? null
    const ferien = (d: string) => schoolHolidays.some((h) => h.state === store.state && d >= h.from && d <= h.to)
    const warmFrom = addDays(startDate, -28)
    const histFrom = `${today.slice(0, 4)}-01-01`
    const all = genSales(store.id, store.state, allDays, today, rnd, wxAt, ferien)
    const byDate = new Map(all.map((d) => [d.date, d]))
    saleDays.push(...all)

    // Sonstige Abgänge: nur die Demo-Filiale ist auffällig
    const brk = new Map<string, Record<string, number>>()
    const addOut = (daysAgo: number, articleId: string, cartons: number, reason: Outflow['reason'], note: string) => {
      const a = articles.find((x) => x.id === articleId)!
      const date = addDays(today, -daysAgo)
      const qty = cartons * packBase(a)
      outflows.push({ id: `of${oidf++}`, storeId: store.id, articleId, date, qty, label: `${cartons} Karton${cartons > 1 ? 's' : ''}`, reason, note })
      const m = brk.get(date) ?? {}
      m[articleId] = (m[articleId] ?? 0) + qty
      brk.set(date, m)
    }
    if (store.id === DEMO_STORE) {
      addOut(9, 'becher-m', 4, 'an Dritte verkauft', 'Weitergabe an Stand auf dem Stadtfest')
      addOut(6, 'becher-l', 3, 'an Dritte verkauft', '')
      addOut(3, 'becher-l', 3, 'an Dritte verkauft', '')
    }
    if (store.id === DEMO_STORE_3) {
      addOut(12, 'pulver', 3, 'an Dritte verkauft', 'für Café in der Nachbarschaft')
      addOut(8, 'pulver', 3, 'an Dritte verkauft', '')
      addOut(5, 'loeffel', 4, 'Sonstiges', '')
      addOut(2, 'pulver', 2, 'an Dritte verkauft', '')
    }

    const lateFrom = addDays(today, -42)
    const realUse = new Map<string, Record<string, number>>()
    for (const d of range(histFrom < warmFrom ? histFrom : warmFrom, today)) {
      const c = { ...consumptionOfDay(byDate.get(d)!, lk) }
      const extra = d >= lateFrom ? cfg.lossLate : cfg.lossBase
      for (const [id, q] of Object.entries(c)) {
        const noExtra = !['becher-s', 'becher-m', 'becher-l', 'pulver'].includes(id)
        c[id] = q / (1 - shrink[id] / 100 - (noExtra ? 0 : id === 'pulver' ? extra : extra * 1.1)) * (0.996 + rnd() * 0.008)
      }
      for (const [id, q] of Object.entries(brk.get(d) ?? {})) c[id] = (c[id] ?? 0) + q
      realUse.set(d, c)
    }
    useAll[store.id] = realUse
    const avgOf = (id: string, asOf: string) => {
      const s = Array(7).fill(0)
      const n = Array(7).fill(0)
      for (let i = 1; i <= 28; i++) {
        const d = addDays(asOf, -i)
        const w = weekdayIdx(d)
        s[w] += realUse.get(d)?.[id] ?? 0
        n[w]++
      }
      return s.map((x, i) => (n[i] ? x / n[i] : 0))
    }

    const meanUse = (id: string) => { let t = 0, n = 0; for (const [d, c] of realUse) if (d >= warmFrom) { t += c[id] ?? 0; n++ } return t / n }
    const bufferOf = (id: string) => meanUse(id) * (2.5 + hash01(id + 'buf') * 4)
    const suppliers = [...new Set(articles.map((a) => a.supplier))]
    const stock: Record<string, number> = {}
    openingStock[store.id] = {}
    for (const a of articles) {
      const avg = avgOf(a.id, startDate)
      stock[a.id] = Math.round((avg.reduce((s, x) => s + x, 0) / 7) * 9)
      openingStock[store.id][a.id] = stock[a.id]
    }
    const open: Order[] = []
    snaps[store.id] = {}
    for (const d of range(startDate, today)) {
      for (const o of [...open]) {
        if (o.expectedOn !== d) continue
        o.status = 'geliefert'
        o.deliveredOn = d
        open.splice(open.indexOf(o), 1)
        for (const l of o.lines) {
          const a = articles.find((x) => x.id === l.articleId)!
          const qty = l.packs * packBase(a)
          stock[a.id] += qty
          deliveries.push({
            id: `d${did++}`, storeId: store.id, articleId: a.id, date: d, qty, orderId: o.id,
            bookedBy: a.source === 'zentrale' ? 'zentrale' : 'filiale',
            confirmed: a.source === 'extern' || d < addDays(today, -1),
          })
        }
      }
      const c = realUse.get(d)!
      for (const a of articles) stock[a.id] = Math.max(0, stock[a.id] - (c[a.id] ?? 0))
      snaps[store.id][d] = { ...stock }
      if (d === today) break
      // Bestellrhythmus je Lieferant (feste Bestelltage). Menge: so, dass der Bestand direkt vor der übernächsten Lieferung genau dem Puffer entspricht
      // (Demo: bekannte Verbräuche bis heute, danach Wochentag-Durchschnitt). So bleiben die Bestände gleichmäßig – ohne Verzerrung für die Warenabgleich.
      const triggered = new Map<string, { articleId: string; packs: number }[]>()
      for (const sup of suppliers) {
        if (!SCHED[sup].includes(weekdayIdx(d))) continue
        const lead = leadOfSupplier(articles, sup)
        let d2 = addDays(d, 1)
        while (!SCHED[sup].includes(weekdayIdx(d2))) d2 = addDays(d2, 1)
        const dA = addDays(d, lead), dA2 = addDays(d2, lead)
        for (const a of articles.filter((x) => x.supplier === sup)) {
          const avg = avgOf(a.id, addDays(d, 1))
          const use = (dd: string) => (dd <= today ? realUse.get(dd)?.[a.id] ?? 0 : avg[weekdayIdx(dd)])
          let proj = stock[a.id]
          for (const o of open) if (o.expectedOn <= dA) for (const l of o.lines) if (l.articleId === a.id) proj += l.packs * packBase(a)
          for (let dd = addDays(d, 1); dd < dA; dd = addDays(dd, 1)) proj -= use(dd)
          let between = 0
          for (let dd = dA; dd < dA2; dd = addDays(dd, 1)) between += use(dd)
          const q = between + bufferOf(a.id) - proj
          if (q <= 0) continue
          const packs = Math.max(1, Math.ceil(q / packBase(a)))
          const list = triggered.get(sup) ?? []
          list.push({ articleId: a.id, packs })
          triggered.set(sup, list)
        }
      }
      for (const [supplier, lines] of triggered) {
        const lead = leadOfSupplier(articles, supplier)
        const o: Order = { id: `o${oid++}`, storeId: store.id, supplier, status: 'bestellt', orderedOn: d, expectedOn: addDays(d, lead), lines }
        orders.push(o)
        open.push(o)
      }
    }
  }

  /* ---------- Bestellungen der Zentrale → Bestellungen beim HQ ---------- */
  const yoIds = new Set(orders.filter((o) => o.supplier === 'Zentrale').map((o) => o.id))
  const centralOrders: CentralOrder[] = []
  const coOf = new Map<string, CentralOrder>()
  for (const o of [...orders.filter((x) => yoIds.has(x.id))].sort((a, b) => a.orderedOn.localeCompare(b.orderedOn) || a.id.localeCompare(b.id))) {
    const dl = deliveries.filter((d) => d.orderId === o.id)
    const co: CentralOrder = {
      id: `co${centralOrders.length + 1}`, no: `B-${String(centralOrders.length + 1).padStart(4, '0')}`, storeId: o.storeId, createdOn: o.orderedOn, wishDate: o.expectedOn, note: '',
      lines: o.lines.map((l) => ({ articleId: l.articleId, packs: l.packs })), status: 'eingegangen',
    }
    if (o.status === 'bestellt') {
      co.status = o.orderedOn === today || hash01(o.storeId + 'e') < 0.4 ? 'eingegangen' : 'bestätigt'
      if (co.status === 'bestätigt') co.confirmedOn = o.orderedOn
    } else {
      co.confirmedOn = o.orderedOn
      co.shippedOn = o.deliveredOn
      const done = dl.every((d) => d.confirmed)
      co.status = done ? 'geliefert' : 'versendet'
      if (done) co.deliveredOn = o.deliveredOn
    }
    for (const d of dl) { d.coId = co.id; delete d.orderId }
    centralOrders.push(co)
    coOf.set(o.id, co)
  }
  const externOrders = orders.filter((o) => !yoIds.has(o.id))

  /* ---------- Rechnungen der letzten 3 Monate ---------- */
  const company = { name: brand.rechnungsAbsender, street: 'Musterstraße 12', zipCity: '40213 Düsseldorf', vatId: 'DE123456789', taxNumber: '103/5678/9012', iban: 'DE02 1203 0000 0000 2020 51', bic: 'BYLADEM1001', bankName: 'Demo-Bank Düsseldorf' }
  const paymentDays = 14
  const ym = today.slice(0, 7)
  const draft: { date: string; storeIdx: number; cos: CentralOrder[]; fee?: string }[] = []
  stores.forEach((st, si) => {
    const mine = centralOrders.filter((c) => c.storeId === st.id && (c.status === 'geliefert' || (c.status === 'versendet' && c.shippedOn && c.shippedOn.slice(0, 7) === ym)))
    const months = new Map<string, CentralOrder[]>()
    for (const c of mine) {
      const m = c.shippedOn!.slice(0, 7)
      if (m < ym) months.set(m, [...(months.get(m) ?? []), c])
      else draft.push({ date: c.shippedOn!, storeIdx: si, cos: [c] })
    }
    for (const [m, cos] of months) {
      const d = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 1)
      const dt = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
      draft.push({ date: dt, storeIdx: si, cos })
    }
  })
  // Franchise-Gebühren: die beiden Monate vor dem letzten vollständigen Monat sind bereits berechnet (der letzte wartet auf den Klick im HQ)
  const feePct = { license: 6, marketing: 2 }
  const fctx = { saleDays, recipes, toppingPrice: 0.6 }
  lastMonths(3, today).slice(1).forEach((m) => {
    const [, end] = monthBounds(m)
    stores.forEach((st, si) => { if (!st.own) draft.push({ date: addDays(end, 1), storeIdx: si, cos: [], fee: m }) })
  })
  draft.sort((a, b) => a.date.localeCompare(b.date) || a.storeIdx - b.storeIdx)
  const invoiceNo: Settings['invoiceNo'] = { prefix: `${brand.rechnungsPrefix}-{JJJJ}-`, next: 1, pad: 4 }
  const invoices: Invoice[] = []
  const overdueStores = new Set(['duisburg', 'luebeck', 'paderborn'])
  for (const dr of draft) {
    const st = stores[dr.storeIdx]
    const iid = `inv${invoices.length + 1}`
    const inv = dr.fee
      ? makeFeeInvoice({ id: iid, number: formatInvoiceNumber(invoiceNo, dr.date), date: dr.date, store: st, company, paymentDays, ym: dr.fee, fee: feeFor(fctx, feePct, st.id, dr.fee), pct: feePct })
      : makeInvoice({ id: iid, number: formatInvoiceNumber(invoiceNo, dr.date), date: dr.date, store: st, company, paymentDays, articles, cos: dr.cos })
    const stuck = overdueStores.has(st.id) && (dr.fee ? dr.fee === lastMonths(3, today)[1] : dr.cos.length > 1 && dr.date.slice(0, 7) === addDays(`${ym}-01`, -1).slice(0, 7))
    const pay = addDays(dr.date, 1 + Math.floor(hash01(inv.id + st.id) * 4))
    if (!stuck && pay <= today && (dr.date < addDays(today, -12) || hash01(inv.id + 'open') > 0.3)) inv.paidOn = pay
    invoices.push(inv)
    invoiceNo.next++
    for (const c of dr.cos) { if (c.status === 'geliefert') c.status = 'berechnet'; c.invoiceId = inv.id }
  }

  const rh = (k: string) => hash01(k)
  for (const c of centralOrders) {
    if (!c.shippedOn) continue
    c.carrier = carrierFor(c.id)
    c.trackingNo = makeTracking(c.carrier, c.id)
    c.etaDate = c.status === 'versendet' ? addDays(today, rh(c.id + 'eta') < 0.5 ? 0 : 1) : c.shippedOn
  }
  // Demo: eine Lieferung ist für den Flagship-Laden gerade unterwegs (Kachel „Wird gerade angeliefert“)
  {
    const id = `co${centralOrders.length + 1}`
    const lines = [{ articleId: 'deckel', packs: 2 }, { articleId: 'servietten', packs: 1 }, { articleId: 'tragetasche', packs: 1 }]
    const shipped = addDays(today, -1)
    centralOrders.push({
      id, no: `B-${String(centralOrders.length + 1).padStart(4, '0')}`, storeId: TOUR_STORE, createdOn: addDays(today, -3), wishDate: shipped, note: '', lines, status: 'versendet',
      confirmedOn: addDays(today, -2), shippedOn: shipped, carrier: 'DHL', trackingNo: makeTracking('DHL', id), etaDate: today,
    })
    {
      const co = centralOrders[centralOrders.length - 1]
      const st = stores.find((x) => x.id === TOUR_STORE)!
      const inv = makeInvoice({ id: `inv${invoices.length + 1}`, number: formatInvoiceNumber(invoiceNo, shipped), date: shipped, store: st, company, paymentDays, articles, cos: [co] })
      invoices.push(inv)
      invoiceNo.next++
      co.invoiceId = inv.id
    }
    for (const l of lines) deliveries.push({ id: `d${did++}`, storeId: TOUR_STORE, articleId: l.articleId, date: shipped, qty: l.packs * packBase(articles.find((a) => a.id === l.articleId)!), coId: id, bookedBy: 'zentrale', confirmed: false })
  }

  const base: Db = {
    version: DB_VERSION, seededOn: today, startDate,
    settings: {
      greenUntil: 2, yellowUntil: 4, bufferDays: 2, targetDays: 14, shrink, specialDays: [], schoolHolidays, locations, company, invoiceNo, paymentDays, toppingPrice: 0.6, hr: defaultHr(), fees: { license: 6, marketing: 2 }, costTargets: { staff: 30, rent: 10, goods: 32, other: 6 },
    },
    stores, articles, recipes, openingStock, saleDays, orders: externOrders, centralOrders, deliveries, invoices, outflows, inventories: [], requests: [], cases: [],
    employees: [], availability: [], absences: [], shifts: [], callouts: [], monthlyReports: [], reports: [], posts: seedPosts(today), campaigns: seedCampaigns(today), knowledge: seedKnowledge(),
  }

  // Monatsinventuren (Stichtag = letzter Tag des Monats) aller Läden von Dezember des Vorjahres bis zum letzten abgeschlossenen Monat.
  // Ab dem Start der Einzeldaten: gezählt = realer Bestand, Soll = rechnerischer Bestand inkl. früherer Korrekturen.
  // Davor (Januar bis Juli): verdichtete Monatswerte (Bestand, ein Wareneingang pro Monat und Artikel, Kosten) – ohne einzelne Rechnungen und Bestellungen.
  const yoArt = articles.filter((a) => a.source === 'zentrale').map((a) => a.id)
  const OVERDUE = new Set(['duisburg', 'luebeck', 'paderborn'])
  const curMonth = today.slice(0, 7)
  const year0 = +today.slice(0, 4)
  const monthEnds: string[] = [`${year0 - 1}-12-31`]
  for (let m = 1; `${year0}-${String(m).padStart(2, '0')}` < curMonth; m++) monthEnds.push(monthEnd(`${year0}-${String(m).padStart(2, '0')}`))
  const artOf = new Map(articles.map((a) => [a.id, a]))
  const catPack = (id: string) => { const c = artOf.get(id)!.category; return c === 'Becher' || c === 'Zubehör' }
  const condensed: Record<string, Record<string, { goods: number; packaging: number }>> = {}
  for (const st of stores) {
    const cum: Record<string, number> = {}
    const miss: Record<string, number> = {}
    const uses = useAll[st.id]
    const useBetween = (id: string, from: string, to: string) => { let t = 0; for (const d of range(from, to)) t += uses.get(d)?.[id] ?? 0; return t }
    let prevEnd = ''
    const prevCount: Record<string, number> = {}
    condensed[st.id] = {}
    for (const me of monthEnds) {
      const ym = me.slice(0, 7)
      const last = ym === prevMonth(curMonth)
      const pre = me < startDate
      if (!pre && last && (OVERDUE.has(st.id) || st.id === TOUR_STORE)) continue
      let date = me
      if (!pre && last && st.id !== DEMO_STORE_2 && rh(st.id + me) < 0.2) date = addDays(me, 1 + Math.floor(rh(st.id + 'd') * 2))
      if (date > today) continue
      if (pre) {
        const lines = yoArt.map((id) => {
          const raw = Math.round(openingStock[st.id][id] * (0.85 + rh(`${st.id}${me}${id}`) * 0.3))
          // Demo Carlstadt: zwei kleine (gelb) Abweichungen in zurückliegenden Monaten – längst erledigt
          const counted = st.id === TOUR_STORE && ((ym === `${year0}-05` && id === 'becher-l') || (ym === `${year0}-07` && id === 'deckel')) ? Math.round(raw * (id === 'deckel' ? 0.92 : 0.93)) : raw
          if (prevEnd) {
            const a = artOf.get(id)!
            const incoming = Math.max(0, Math.round(useBetween(id, addDays(prevEnd, 1), me) + counted - prevCount[id]))
            deliveries.push({ id: `d${did++}`, storeId: st.id, articleId: id, date: addDays(me, -15), qty: incoming, bookedBy: 'filiale', confirmed: true })
            void a
          }
          prevCount[id] = counted
          return { articleId: id, counted, expected: raw }
        })
        base.inventories.push({ id: `iv-${st.id}-${me}`, storeId: st.id, date: me, lines, kind: 'monat', period: ym })
        if (prevEnd) {
          const pc = { goods: 0, packaging: 0 }
          for (const a of articles) { const v = (useBetween(a.id, addDays(prevEnd, 1), me) / packBase(a)) * a.packPrice; if (catPack(a.id)) pc.packaging += v; else pc.goods += v }
          condensed[st.id][ym] = pc
        }
        prevEnd = me
        continue
      }
      if (prevEnd && prevEnd < startDate) {
        // Der erste Monat mit Einzeldaten beginnt vor dem Start der Einzeldaten: Wareneingang bis zum Start verdichtet nachtragen
        const gapEnd = addDays(startDate, -1)
        const pc = { goods: 0, packaging: 0 }
        for (const a of articles) { const v = (useBetween(a.id, addDays(prevEnd, 1), gapEnd) / packBase(a)) * a.packPrice; if (catPack(a.id)) pc.packaging += v; else pc.goods += v }
        condensed[st.id][prevEnd < startDate ? ym : ym] = pc
        for (const id of yoArt) {
          const incoming = Math.max(0, Math.round(openingStock[st.id][id] + useBetween(id, addDays(prevEnd, 1), gapEnd) - prevCount[id]))
          deliveries.push({ id: `d${did++}`, storeId: st.id, articleId: id, date: addDays(startDate, -4), qty: incoming, bookedBy: 'filiale', confirmed: true })
        }
      }
      const lines = yoArt.map((id) => {
        const real = Math.round(snaps[st.id][date]?.[id] ?? 0)
        let counted = real * (1 + (rh(`${st.id}${date}${id}`) - 0.5) * 0.02)
        const expected = Math.round(stockEnd(base, st.id, id, date) + (cum[id] ?? 0))
        // Demo-Auffälligkeit Beispielhausen: im Oktober wurde deutlich mehr verbraucht, als verkauft wurde – der gezählte Bestand liegt weit unter dem Soll (höchstens 55 % des Bestands fehlen)
        if (st.id === DEMO_STORE_2 && ['becher-s', 'becher-m', 'becher-l', 'pulver'].includes(id)) {
          const used = useBetween(id, addDays(prevEnd, 1), me)
          miss[id] = (miss[id] ?? 0) + used * (last ? 0.2 : 0)
          miss[id] = Math.min(miss[id], real * 0.55)
          counted = Math.max(0, real - miss[id])
        }
        counted = Math.max(0, Math.round(counted))
        // Demo Carlstadt: im September fehlen Servietten deutlich (rot) – erledigt, ohne Folgen für spätere Zählungen
        if (st.id === TOUR_STORE && ym === `${year0}-09` && id === 'servietten') return { articleId: id, counted: Math.round(expected * 0.8), expected }
        // Demo Carlstadt: außer den bewusst eingebauten Abweichungen passt alles genau
        if (st.id === TOUR_STORE) return { articleId: id, counted, expected: counted }
        cum[id] = (cum[id] ?? 0) + counted - expected
        return { articleId: id, counted, expected }
      })
      prevEnd = me
      base.inventories.push({ id: `iv-${st.id}-${date}`, storeId: st.id, date, lines, kind: 'monat', period: ym })
    }
    // Demo Carlstadt: Zwischenzählung vor zwei Tagen, ohne Auffälligkeiten (zeigt Spalte „Zwischen“ und den schraffierten Balken)
    if (st.id === TOUR_STORE && snaps[st.id][addDays(today, -2)]) {
      const zd = addDays(today, -2)
      base.inventories.push({
        id: `iv-${st.id}-${zd}-z`, storeId: st.id, date: zd, kind: 'sonder',
        lines: yoArt.map((id) => ({ articleId: id, counted: Math.round((snaps[st.id][zd][id] ?? 0) * (1 + (rh(`${zd}${id}z`) - 0.5) * 0.008)), expected: 0 })).map((l) => ({ ...l, expected: l.counted })),
      })
    }
  }

  // Monatszahlen, die die Läden selbst melden (Personal, Miete, Kassenumsatz) für Januar bis zum letzten Monat.
  // Quoten: Personal 25–33 %, Miete 5–10 %; bewusst auffällig sind nur wenige Läden. Oktober fehlt bei einigen Läden: dort erscheint die Aufgabe auf „Heute“.
  {
    const ctx = revCtx(base)
    const NO_OCT = new Set([TOUR_STORE])
    const STAFF_HIGH: Record<string, number> = { musterstadt: 40, beispielhausen: 36.5, bremen: 31.5, kiel: 32.5, 'muenster-koenigsstrasse': 31 }
    const REV_OFF: Record<string, number> = { 'hamburg-rathaus': 1.032, bielefeld: 0.96 }
    for (const st of stores) {
      const staffQ = STAFF_HIGH[st.id] ?? 26 + rh(st.id + 'sq') * 3.5
      const rentQ = 5.8 + rh(st.id + 'rq') * 3.5
      const otherQ = 4.2 + rh(st.id + 'oq') * 1.4
      for (const me of monthEnds.slice(1)) {
        const ym = me.slice(0, 7)
        const isLast = ym === prevMonth(curMonth)
        if (isLast && NO_OCT.has(st.id)) continue
        const [mf, mt] = monthBounds(ym)
        const rev = revenueNet(ctx, st.id, mf, mt)
        if (rev <= 0) continue
        const cons = condensed[st.id][ym]
        const off = isLast ? REV_OFF[st.id] ?? 1 + (rh(st.id + ym + 'k') - 0.5) * 0.008 : 1 + (rh(st.id + ym + 'k') - 0.5) * 0.008
        const sys = goodsOf(base, st.id, mf, mt)
        const goodsCost = Math.round((sys.goods + sys.packaging + (cons ? cons.goods + cons.packaging : 0)) * (0.99 + rh(st.id + ym + 'g') * 0.02))
        base.monthlyReports.push({
          id: `mr-${st.id}-${ym}`, storeId: st.id, ym,
          staffCost: Math.round(rev * (staffQ + (rh(st.id + ym) - 0.5) * 1.6)) / 100,
          rent: Math.round((rev * (rentQ + (rh(st.id + ym + 'r') - 0.5) * 0.5)) / 100 / 50) * 50,
          revenue: Math.round(rev * off), reportedOn: addDays(mt, 1 + Math.floor(rh(st.id + ym + 'r') * 3)),
          goodsCost, otherCost: Math.round(rev * (otherQ + (rh(st.id + ym + 'o') - 0.5) * 0.6)) / 100,
        })
      }
    }
  }
  // Meldungen von Läden an das HQ (Demo), dazu Bearbeitungsstände
  {
    const mk = (id: string, storeId: string, art: 'anfrage' | 'stoerung' | 'reklamation', text: string, ago: number) => base.reports.push({ id, storeId, art, text, createdOn: addDays(today, -ago) })
    mk('rp1', 'koeln-campus', 'stoerung', 'Die Softeismaschine kühlt seit gestern nicht mehr richtig. Techniker nötig.', 1)
    mk('rp2', 'hamburg-rathaus', 'anfrage', 'Wann kommt das Material für die Winter-Aktion? Wir würden gern früh planen.', 3)
    mk('rp3', 'bielefeld', 'reklamation', 'Lieferung unvollständig: 2 Kartons Becher M fehlen.', 2)
    mk('rp4', 'bremen', 'anfrage', 'Gibt es die Preisliste für Dezember schon?', 6)
    base.cases.push({ id: 'hamburg-rathaus|r-rp2', storeId: 'hamburg-rathaus', kind: 'r-rp2', status: 'in Klärung', notes: [{ date: addDays(today, -2), text: 'Rückmeldung an den Laden folgt.' }] })
    base.cases.push({ id: 'bremen|r-rp4', storeId: 'bremen', kind: 'r-rp4', status: 'geklärt', notes: [], resolution: 'Preisliste per Mitteilung verschickt.', resolvedOn: addDays(today, -4) })
  }
  // Demo-Lieferabweichungen (für die HQ-Kennzahlen)
  for (const [sid, note] of [['duisburg', 'Karton beschädigt angekommen'], ['kiel', 'Ein Karton Becher M fehlte'], ['kiel', 'Löffel: zu wenig geliefert']] as const) {
    const d = [...deliveries].reverse().find((x) => x.storeId === sid && x.bookedBy === 'zentrale' && x.confirmed && !x.deviation)
    if (d) d.deviation = note
  }
  const hr = seedHr(base, today)
  const withHr: Db = { ...base, ...hr }
  shapeGaps(withHr, TOUR_STORE, today)
  fixDemoGaps(withHr, today)
  return tuneMango(withHr, TOUR_STORE)
}

/** Demo Dienstplan: in der aktuellen Woche (ab heute) mindestens 5 Lücken, in der nächsten mindestens 4, verteilt auf verschiedene Tage (höchstens 2 Zeitfenster je Tag) */
function shapeGaps(db: Db, sid: string, today: string) {
  const wk = addDays(today, -weekdayIdx(today))
  const windows = (date: string, shifts = db.shifts) => dayStaffing(db, sid, date, today, shifts).gaps.length
  const dealWeek = (from: string, target: number) => {
    const days = Array.from({ length: 7 }, (_, i) => addDays(from, i)).filter((d) => d >= today)
    let total = days.reduce((n, d) => n + windows(d), 0)
    for (let round = 0; round < 2 && total < target; round++) {
      for (const d of days) {
        if (total >= target) break
        if (windows(d) > round) continue
        const mine = db.shifts.filter((s) => s.storeId === sid && s.date === d && s.status !== 'ausfall')
        for (const s of mine) {
          const rest = db.shifts.filter((x) => x.id !== s.id)
          if (windows(d, rest) > windows(d)) { db.shifts = rest; total++; break }
        }
      }
    }
  }
  dealWeek(wk, 5)
  dealWeek(addDays(wk, 7), 4)
}

/** Demo-Verfügbarkeiten: Jede Lücke der nächsten 14 Tage lässt sich mit mindestens einer Person ohne Warnung schließen (plus einige mit Warnung) */
function fixDemoGaps(db: Db, today: string) {
  const rank: Record<string, number> = { vollzeit: 0, teilzeit: 1, werkstudent: 2, minijob: 3 }
  for (const sid of [...OWN_STORES, ...DEMO_STORES]) {
    for (let i = 0; i < 14; i++) {
      const date = addDays(today, i)
      for (const g of dayStaffing(db, sid, date, today).gaps) {
        const full = (c: { warnings: string[]; start: number; end: number }) => !c.warnings.length && c.start <= g.from && c.end >= g.to
        const enough = () => candidatesForGap(db, sid, date, g, today).filter(full).length >= Math.max(3, g.missing + 2)
        if (enough()) continue
        const emps = db.employees.filter((e: Employee) => e.storeId === sid && e.active).sort((a, b) => (rank[a.contractId] ?? 9) - (rank[b.contractId] ?? 9))
        for (const e of emps) {
          if (enough()) break
          if (db.absences.some((a) => a.empId === e.id && date >= a.from && date <= a.to) || db.shifts.some((s) => s.empId === e.id && s.date === date)) continue
          const at = db.availability.findIndex((a) => a.empId === e.id && a.date === date)
          const old = at >= 0 ? db.availability[at] : null
          const set = (v: { empId: string; date: string; kind: 'ganztags' } | null) => {
            const k = db.availability.findIndex((a) => a.empId === e.id && a.date === date)
            if (k >= 0) db.availability.splice(k, 1)
            if (v) db.availability.push(v)
          }
          set({ empId: e.id, date, kind: 'ganztags' })
          if (!candidatesForGap(db, sid, date, g, today).some((c) => c.emp.id === e.id && full(c))) set(old as never)
        }
      }
    }
  }
}

function seedPosts(today: string): Post[] {
  return [
    { id: 'po1', title: 'Winter-Special startet am 1. Dezember', text: 'Ab 1. Dezember gibt es unser Winter-Special mit neuem Crumble. Bitte plant rechtzeitig Biscoff und Becher L ein – die Bestellvorschläge berücksichtigen die Aktion schon.', important: true, createdOn: addDays(today, -2), to: [], readBy: { duisburg: addDays(today, -1) } },
    { id: 'po2', title: 'Neue Portionsgrößen-Karte im Handbuch', text: 'Die aktualisierte Karte zu Portionsgrößen und Toppings liegt im Handbuch. Bitte kurz mit dem Team durchgehen.', important: false, createdOn: addDays(today, -6), to: [], readBy: { [TOUR_STORE]: addDays(today, -5), kiel: addDays(today, -3) } },
    { id: 'po3', title: 'Erinnerung: Monatsinventur', text: 'Bitte zählt die Artikel der Zentrale am letzten Tag des Monats (ab dem drittletzten Tag möglich) – blind, ohne Vorgabe. Danke!', important: false, createdOn: addDays(today, -1), to: [TOUR_STORE, 'koeln-campus', 'hamburg-rathaus', 'musterstadt'], readBy: {} },
  ]
}
function seedCampaigns(today: string): Campaign[] {
  const y = Number(today.slice(0, 4))
  const dec1 = today <= `${y}-12-24` ? `${y}-12-01` : `${y + 1}-12-01`
  const end = `${dec1.slice(0, 4)}-12-24`
  return [
    { id: 'ca1', title: 'Winter-Special mit neuem Crumble', text: 'Neue Sorte „Winter-Crumble“ mit Biscoff und Oreo, dazu die große Becher-Größe im Fokus.', from: dec1, to: end, articleIds: ['biscoff', 'oreo', 'becher-l'], extraPct: 25, social: 'Der Winter schmeckt nach Crunch! ❄️ Unser neues Winter-Special mit Biscoff-Crumble – ab 1. Dezember bei der Zentrale. #zentrale #frozenyoghurt' },
    { id: 'ca2', title: 'Mango-Wochen', text: 'Zwei Wochen lang Mango im Fokus – frisch, fruchtig, farbenfroh.', from: addDays(today, 9), to: addDays(today, 22), articleIds: ['mango', 'becher-m'], extraPct: 30, social: 'Zwei Wochen Mango-Glück 🥭 Jetzt Becher mit extra Mango bei der Zentrale. #zentrale #mango' },
    { id: 'ca3', title: 'Black-Week: Gratis-Topping', text: 'Zum Becher L gibt es ein Topping gratis – das lockt mehr große Becher.', from: addDays(today, 18), to: addDays(today, 24), articleIds: ['becher-l', 'loeffel', 'schokosauce'], extraPct: 20, social: 'Black Week bei der Zentrale 🖤 Zum Becher L ein Topping gratis. Nur eine Woche! #zentrale #blackweek' },
  ]
}
function seedKnowledge(): KnowEntry[] {
  return [
    { id: 'kn1', category: 'Portionsgrößen & Standards', title: 'Portionsgrößen S, M, L', text: 'Platzhalter: S = 110 g, M = 160 g, L = 220 g Yoghurt. Hier folgt später ein Foto der Soll-Füllhöhe.', media: 'pdf' },
    { id: 'kn2', category: 'Portionsgrößen & Standards', title: 'Topping-Löffel richtig portionieren', text: 'Platzhalter: Ein Löffel Topping entspricht einer Portion. Hier folgt später ein kurzes Video.', media: 'video' },
    { id: 'kn3', category: 'Schulung für neue Mitarbeitende', title: 'Erster Arbeitstag – Checkliste', text: 'Platzhalter: Hygiene, Kasse, Maschine reinigen, Becher und Toppings auffüllen.', media: 'pdf' },
    { id: 'kn4', category: 'Schulung für neue Mitarbeitende', title: 'Maschine reinigen (Video)', text: 'Platzhalter für ein Schulungsvideo zur täglichen Reinigung.', media: 'video' },
    { id: 'kn5', category: 'Dokumente & Preislisten', title: 'Preisliste Verkauf (Empfehlung)', text: 'Platzhalter: empfohlene Verkaufspreise für S, M, L und Toppings.', media: 'pdf' },
    { id: 'kn6', category: 'Dokumente & Preislisten', title: 'Franchisehandbuch', text: 'Platzhalter: Das Handbuch liegt hier später als PDF zum Download.', media: 'pdf' },
  ]
}
