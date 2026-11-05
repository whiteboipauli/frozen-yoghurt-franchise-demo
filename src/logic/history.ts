import type { Db, SaleDay, Store } from '../data/types'
import { legalHolidayOn } from '../data/holidays'
import { addDays, diffDays, parseISO, todayISO, weekdayIdx } from '../lib/date'
import { rainClass, wxFor, type WxDay } from './weather'
import { CITY_COORDS } from '../data/stores'

/* ---------- Kalender je Filiale ---------- */
export const storeOf = (db: Db, storeId: string): Store => db.stores.find((s) => s.id === storeId) ?? db.stores[0]
export const storeLoc = (db: Db, storeId: string) => db.settings.locations[storeId] ?? CITY_COORDS[storeOf(db, storeId).city] ?? { lat: 51.23, lon: 6.78 }
export const wxOn = (db: Db, storeId: string, date: string): WxDay | null => wxFor(storeLoc(db, storeId))?.[date] ?? null

/** Gesetzlicher Feiertag des Bundeslands der Filiale oder frei eingetragener Sondertag */
export function holidayOn(db: Db, storeId: string, date: string): { name: string; special: boolean } | undefined {
  const st = storeOf(db, storeId)
  const legal = legalHolidayOn(st.state, date)
  if (legal) return { name: legal, special: false }
  const sp = db.settings.specialDays.find((h) => h.date === date)
  return sp ? { name: sp.name, special: true } : undefined
}
export const schoolHolidayOn = (db: Db, storeId: string, date: string) => {
  const st = storeOf(db, storeId).state
  return db.settings.schoolHolidays.find((h) => h.state === st && date >= h.from && date <= h.to)
}

export type DayType = 'feiertag' | 'mo-do' | 'fr' | 'sa-so'
export const DAYTYPE_LABEL: Record<DayType, string> = { feiertag: 'Feiertag', 'mo-do': 'Mo–Do', fr: 'Freitag', 'sa-so': 'Wochenende' }
export function dayType(db: Db, storeId: string, date: string): DayType {
  if (holidayOn(db, storeId, date)) return 'feiertag'
  const w = weekdayIdx(date)
  return w <= 3 ? 'mo-do' : w === 4 ? 'fr' : 'sa-so'
}

/** Jahrestag (1–366) */
export const dayOfYear = (date: string) => {
  const d = parseISO(date)
  return Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86400000)
}
/** Abstand im Jahreslauf in Tagen (kreisförmig) */
export const seasonGap = (a: string, b: string) => {
  const g = Math.abs(dayOfYear(a) - dayOfYear(b))
  return Math.min(g, 365 - g)
}
export const isSummer = (date: string) => {
  const m = Number(date.slice(5, 7))
  return m >= 5 && m <= 9
}
/** Öffnungszeiten (Stunden, Ende exklusiv) an einem Tag */
export const openHours = (st: Store, date: string): { open: number; close: number } => ({ open: st.hours.open, close: isSummer(date) ? st.hours.summerClose : st.hours.close })

/* ---------- Umsatz und Stundenverlauf (gemeinsame Datenbasis) ---------- */
export function dayRevenue(db: Db, day: Pick<SaleDay, 'counts' | 'toppings'>): number {
  let r = 0
  for (const [id, n] of Object.entries(day.counts)) r += n * (db.recipes.find((x) => x.id === id)?.price ?? 0)
  for (const n of Object.values(day.toppings)) r += n * db.settings.toppingPrice
  return r
}
export const dayCups = (day: Pick<SaleDay, 'counts'>) => Object.values(day.counts).reduce((s, n) => s + n, 0)

const dayIndex = new WeakMap<Db, Map<string, SaleDay>>()
export function saleDayOf(db: Db, storeId: string, date: string): SaleDay | undefined {
  let m = dayIndex.get(db)
  if (!m) {
    m = new Map()
    for (const d of db.saleDays) m.set(`${d.storeId}|${d.date}`, d)
    dayIndex.set(db, m)
  }
  return m.get(`${storeId}|${date}`)
}

function hash01(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  h ^= h >>> 15
  h = Math.imul(h, 2246822507)
  h ^= h >>> 13
  return ((h >>> 0) % 100000) / 100000
}

/** Typischer Tagesverlauf (Gewicht je Stunde): Spitze am Nachmittag und frühen Abend; am Wochenende flacher und früher */
export function hourWeight(h: number, weekend: boolean, hot: boolean): number {
  const peak = weekend ? 15.5 : hot ? 17 : 16.5
  const width = weekend ? 3.6 : 3.1
  const base = Math.exp(-((h + 0.5 - peak) ** 2) / (2 * width * width))
  return 0.12 + base
}

export interface HourRow {
  hour: number
  cups: number
  revenue: number
}
const hourCache = new WeakMap<Db, Map<string, HourRow[]>>()
/** Stundenverlauf eines (vergangenen) Tages aus der Tagessumme. Deterministisch, in Bechern und €. */
export function hourlyOf(db: Db, storeId: string, date: string): HourRow[] {
  let m = hourCache.get(db)
  if (!m) hourCache.set(db, (m = new Map()))
  const k = `${storeId}|${date}`
  const hit = m.get(k)
  if (hit) return hit
  const sd = saleDayOf(db, storeId, date)
  const st = storeOf(db, storeId)
  const { open, close } = openHours(st, date)
  const rows: HourRow[] = []
  if (sd) {
    const w = wxOn(db, storeId, date)
    const weekend = weekdayIdx(date) >= 5 || !!holidayOn(db, storeId, date)
    const ws: number[] = []
    for (let h = open; h < close; h++) ws.push(hourWeight(h, weekend, !!w && w.tmax >= 24) * (0.9 + 0.2 * hash01(`${storeId}${date}${h}`)))
    const tot = ws.reduce((a, b) => a + b, 0)
    const cups = dayCups(sd), rev = dayRevenue(db, sd)
    let left = cups
    ws.forEach((x, i) => {
      const c = i === ws.length - 1 ? left : Math.round((cups * x) / tot)
      left -= c
      rows.push({ hour: open + i, cups: Math.max(0, c), revenue: cups > 0 ? (rev * Math.max(0, c)) / cups : 0 })
    })
  }
  m.set(k, rows)
  return rows
}

/** Trendfaktor: Umsatzniveau der letzten 8 Wochen vs. gleicher Zeitraum im Vorjahr */
export function trendFactor(db: Db, storeId: string, today = todayISO()): number {
  let now = 0, prev = 0, n = 0
  for (let i = 1; i <= 56; i++) {
    const a = saleDayOf(db, storeId, addDays(today, -i))
    const b = saleDayOf(db, storeId, addDays(today, -i - 364))
    if (a && b) { now += dayRevenue(db, a); prev += dayRevenue(db, b); n++ }
  }
  if (n < 20 || prev <= 0) return 1
  return Math.min(1.4, Math.max(0.7, now / prev))
}

/* ---------- Ähnliche Tage (Umsatz-/Personalprognose) ---------- */
export interface SimilarQuery {
  date: string
  wx: WxDay | null
  type: DayType
  ferien: boolean
}
export interface SimilarResult {
  days: string[]
  /** Welche Kriterien am Ende galten */
  level: 'streng' | 'ohne Sonne' | 'weiter' | 'ohne Wetter' | 'nur Tagestyp'
}
/** Kriterien: Tagestyp, Temperatur ±2 °C, Regen/Regenstärke, Sonnenstunden, Jahreszeit, Ferien – mit schrittweiser Lockerung */
export function similarDays(db: Db, storeId: string, q: SimilarQuery, today = todayISO(), horizon = 400): SimilarResult {
  const pool: string[] = []
  for (let i = 1; i <= horizon; i++) {
    const d = addDays(today, -i)
    if (d === q.date || !saleDayOf(db, storeId, d)) continue
    if (dayType(db, storeId, d) !== q.type) continue
    pool.push(d)
  }
  const rc = (w: WxDay) => rainClass(w.rain)
  const tiers: { level: SimilarResult['level']; ok: (d: string) => boolean }[] = []
  const ferienOk = (d: string) => !!schoolHolidayOn(db, storeId, d) === q.ferien
  if (q.wx) {
    const w0 = q.wx
    const wx = (d: string) => wxOn(db, storeId, d)
    tiers.push({ level: 'streng', ok: (d) => { const w = wx(d); return !!w && seasonGap(d, q.date) <= 28 && Math.abs(w.tmax - w0.tmax) <= 2 && rc(w) === rc(w0) && Math.abs(w.sun - w0.sun) <= 2.5 && ferienOk(d) } })
    tiers.push({ level: 'ohne Sonne', ok: (d) => { const w = wx(d); return !!w && seasonGap(d, q.date) <= 28 && Math.abs(w.tmax - w0.tmax) <= 2 && rc(w) === rc(w0) && ferienOk(d) } })
    tiers.push({ level: 'weiter', ok: (d) => { const w = wx(d); return !!w && seasonGap(d, q.date) <= 42 && Math.abs(w.tmax - w0.tmax) <= 4 && (rc(w) === 'trocken') === (rc(w0) === 'trocken') } })
  }
  tiers.push({ level: 'ohne Wetter', ok: (d) => seasonGap(d, q.date) <= 28 && ferienOk(d) })
  tiers.push({ level: 'nur Tagestyp', ok: (d) => seasonGap(d, q.date) <= 45 })
  for (const t of tiers) {
    const days = pool.filter(t.ok)
    if (days.length >= 3) return { days, level: t.level }
  }
  return { days: pool.filter((d) => seasonGap(d, q.date) <= 60), level: 'nur Tagestyp' }
}
void diffDays
