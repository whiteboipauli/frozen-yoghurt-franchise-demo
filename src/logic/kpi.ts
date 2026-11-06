import type { Db } from '../data/types'
import { addDays, diffDays, range, todayISO, weekdayIdx } from '../lib/date'
import { hash01 } from '../data/seedHr'
import { packBase } from './consumption'
import { REV_VAT, dayCupsOf, dayGross, revCtx, revenueNet, saleDaysOf } from './fees'
import { netOf } from './hr'
import { openHours, storeOf, wxOn } from './history'
import { invoiceState, packsOf } from './invoice'
import { rainClass, syntheticWx, type WxDay, type WxMap } from './weather'
import { storeLoc } from './history'

/** Kennzahlen eines Ladens für das HQ (nur Zahlen, keine Personendaten) */
export interface Kpi {
  storeId: string
  revWeek: number
  revMonth: number
  cupsPerHour: number
  avgBon: number
  /** Wachstum zum Vorjahr in % (28 Tage) und wetterbereinigt (Ist gegenüber Prognose für vergleichbare Tage) */
  growth: number | null
  growthAdj: number | null
  lShare: number
  toppingsPerCup: number
  cogsPerCup: number
  staffQuote: number
  onTime: number | null
  deviations: number
  openInv: number
  overdueInv: number
  overdueSum: number
  flags: { key: string; text: string }[]
}

const WD_RAIN = { trocken: 1, leicht: 0.82, stark: 0.6 }
/** Wetterfaktor wie im Kaufverhalten: wärmer, sonniger, trocken = mehr Becher */
export function wxFactor(w: WxDay | null): number {
  if (!w) return 1
  return Math.min(1.4, Math.max(0.55, 0.6 + 0.027 * (w.tmax - 3))) * (0.85 + 0.03 * Math.min(14, w.sun)) * WD_RAIN[rainClass(w.rain)]
}

const synCache = new Map<string, WxMap>()
/** Wetter eines Tages: echt, sonst derselbe Klima-Ersatz wie bei den Demo-Verkäufen */
function wxAny(db: Db, storeId: string, date: string, today: string): WxDay | null {
  const w = wxOn(db, storeId, date)
  if (w) return w
  const loc = storeLoc(db, storeId)
  const k = `${loc.lat}|${today}`
  let m = synCache.get(k)
  if (!m) { m = syntheticWx(loc.lat, range(addDays(today, -400), today)); synCache.set(k, m) }
  return m[date] ?? null
}

const cache = new WeakMap<Db, Map<string, Kpi>>()
export function storeKpi(db: Db, storeId: string, today = todayISO()): Kpi {
  let m = cache.get(db)
  if (!m) cache.set(db, (m = new Map()))
  const hit = m.get(`${storeId}|${today}`)
  if (hit) return hit
  const k = compute(db, storeId, today)
  m.set(`${storeId}|${today}`, k)
  return k
}

function compute(db: Db, storeId: string, today: string): Kpi {
  const ctx = revCtx(db)
  const st = storeOf(db, storeId)
  const days = saleDaysOf(db.saleDays, storeId)
  const last = (n: number) => days.filter((d) => d.date >= addDays(today, -n) && d.date < today) // ohne den heutigen (unvollständigen) Tag
  const w7 = last(7), w28 = last(28)
  const revWeek = revenueNet(ctx, storeId, addDays(today, -7), addDays(today, -1))
  const revMonth = revenueNet(ctx, storeId, addDays(today, -30), addDays(today, -1))
  const cups7 = w7.reduce((s, d) => s + dayCupsOf(d), 0)
  const hours7 = range(addDays(today, -7), addDays(today, -1)).reduce((s, d) => { const o = openHours(st, d); return s + (o.close - o.open) }, 0)
  const cups28 = w28.reduce((s, d) => s + dayCupsOf(d), 0)
  const gross28 = w28.reduce((s, d) => s + dayGross(ctx, d), 0)
  const cupsPerBon = 1.35 + hash01(storeId + 'bon') * 0.5
  // Vorjahr: gleiche Wochentage (364 Tage zurück)
  const prev = days.filter((d) => d.date >= addDays(today, -28 - 364) && d.date < addDays(today, -364))
  const cupsPrev = prev.reduce((s, d) => s + dayCupsOf(d), 0)
  const growth = cupsPrev > 0 ? (cups28 / cupsPrev - 1) * 100 : null
  let expected = 0
  for (const d of prev) expected += dayCupsOf(d) * (wxFactor(wxAny(db, storeId, addDays(d.date, 364), today)) / wxFactor(wxAny(db, storeId, d.date, today)))
  const growthAdj = expected > 0 ? (cups28 / expected - 1) * 100 : null
  const lCups = w28.reduce((s, d) => s + (d.counts['froyo-l'] ?? 0), 0)
  const tops = w28.reduce((s, d) => s + Object.values(d.toppings).reduce((a, b) => a + b, 0), 0)

  // Wareneinsatz: vom Headquarter bezogene Ware zu HQ-Preisen ÷ verkaufte Becher (56 Tage glättet die Lieferrhythmen)
  const from56 = addDays(today, -56)
  const price = new Map(db.articles.map((a) => [a.id, a]))
  let goods = 0
  for (const d of db.deliveries) {
    if (d.storeId !== storeId || d.date < from56 || d.date >= today) continue
    const a = price.get(d.articleId)
    if (a?.source === 'zentrale') goods += (d.qty / packBase(a)) * a.packPrice
  }
  const cups56 = days.filter((d) => d.date >= from56 && d.date < today).reduce((s, d) => s + dayCupsOf(d), 0)

  // Personalkosten-Quote (nur Prozent vom Netto-Umsatz)
  const hr = db.settings.hr
  const emp = new Map(db.employees.filter((e) => e.storeId === storeId).map((e) => [e.id, e]))
  let wages = 0
  for (const s of db.shifts) {
    if (s.storeId !== storeId || s.date < addDays(today, -28) || s.date >= today) continue
    const e = emp.get(s.empId)
    if (e) wages += netOf(hr, e, s) * e.wage
  }
  const rev28 = gross28 / REV_VAT

  // Lieferservice des HQ: Pünktlichkeit (geliefert vs. Wunschtermin); Verzögerungen in der Demo aus dem Laden abgeleitet
  const cos = db.centralOrders.filter((c) => c.storeId === storeId && c.shippedOn && c.shippedOn >= addDays(today, -90))
  const lateRate = 0.02 + hash01(storeId + 'late') ** 3 * 0.45
  const late = cos.filter((c) => hash01(c.id + 'l') < lateRate || (c.deliveredOn ?? c.shippedOn!) > c.wishDate).length
  const onTime = cos.length ? ((cos.length - late) / cos.length) * 100 : null
  const deviations = db.deliveries.filter((d) => d.storeId === storeId && d.deviation && d.date >= addDays(today, -90)).length
  void packsOf

  const inv = db.invoices.filter((i) => i.storeId === storeId && i.type === 'rechnung')
  const openI = inv.filter((i) => ['offen', 'überfällig'].includes(invoiceState(i, today)))
  const overI = openI.filter((i) => invoiceState(i, today) === 'überfällig')
  const k: Kpi = {
    storeId, revWeek, revMonth, cupsPerHour: hours7 ? cups7 / hours7 : 0, avgBon: cups28 ? gross28 / (cups28 / cupsPerBon) : 0, growth, growthAdj,
    lShare: cups28 ? (lCups / cups28) * 100 : 0, toppingsPerCup: cups28 ? tops / cups28 : 0, cogsPerCup: cups56 ? goods / cups56 : 0,
    staffQuote: rev28 > 0 ? (wages / rev28) * 100 : 0, onTime, deviations, openInv: openI.length, overdueInv: overI.length, overdueSum: overI.reduce((s, i) => s + i.gross, 0), flags: [],
  }
  if (k.deviations >= 2) k.flags.push({ key: 'dev', text: `${k.deviations} gemeldete Lieferabweichungen` })
  if (k.overdueInv >= 1 && !storeOf(db, storeId).own) k.flags.push({ key: 'pay', text: `${k.overdueInv} überfällige Rechnung${k.overdueInv > 1 ? 'en' : ''}` })
  if (k.growthAdj !== null && k.growthAdj < -8) k.flags.push({ key: 'growth', text: `wetterbereinigt ${Math.round(k.growthAdj)} % gegenüber Prognose` })
  return k
}
void diffDays; void weekdayIdx
