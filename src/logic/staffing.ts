import type { Db, Shift } from '../data/types'
import { addDays, todayISO, weekdayIdx, WEEKDAYS } from '../lib/date'
import { coverage, gapsOf, gapText, type Gap, type Need } from './hr'
import { dayType, DAYTYPE_LABEL, holidayOn, hourlyOf, openHours, saleDayOf, schoolHolidayOn, similarDays, storeOf, trendFactor, wxOn, dayCups, dayRevenue, type DayType } from './history'
import { rainClass, wxKind, type WxDay } from './weather'

export interface HourForecast {
  hour: number
  cups: number
  revenue: number
  staff: number
}
export interface StaffDay {
  date: string
  type: DayType
  holiday?: string
  ferien: boolean
  wx: WxDay | null
  /** Wetter lag nicht vor → ohne Wetter gerechnet */
  noWeather: boolean
  cups: number
  revenue: number
  hours: HourForecast[]
  need: Need
  open: number
  close: number
  peak: number
  similarCount: number
  level: string
  /** Abweichung zum üblichen Tag gleichen Typs in der Jahreszeit */
  deltaPct: number | null
  explain: string
}

const cache = new WeakMap<Db, Map<string, StaffDay>>()
const num = (n: number) => new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(n)

/** Personalbedarf eines Tages: Umsatzprognose nach ähnlichen Tagen (Vorjahr + letzte Wochen) × Trendfaktor */
export function staffDay(db: Db, storeId: string, date: string, today = todayISO()): StaffDay {
  let m = cache.get(db)
  if (!m) cache.set(db, (m = new Map()))
  const key = `${storeId}|${date}|${today}`
  const hit = m.get(key)
  if (hit) return hit
  const st = storeOf(db, storeId)
  const type = dayType(db, storeId, date)
  const hol = holidayOn(db, storeId, date)
  const ferien = !!schoolHolidayOn(db, storeId, date)
  const wx = wxOn(db, storeId, date)
  const { open, close } = openHours(st, date)
  const res = similarDays(db, storeId, { date, wx, type, ferien }, today)
  const trend = trendFactor(db, storeId, today)
  const nH = close - open
  const cups = Array(nH).fill(0), rev = Array(nH).fill(0)
  let n = 0
  for (const d of res.days) {
    // Tage älter als ~12 Wochen liegen auf Vorjahresniveau → Trendfaktor; neuere sind schon aktuell
    const f = d < addDays(today, -84) ? trend : 1
    const rows = hourlyOf(db, storeId, d)
    if (!rows.length) continue
    // Öffnungszeiten können abweichen (Sommer/Winter): nach Stunde der Uhr zuordnen
    for (const r of rows) {
      const i = r.hour - open
      if (i >= 0 && i < nH) { cups[i] += r.cups * f; rev[i] += r.revenue * f }
    }
    n++
  }
  if (n > 0) for (let i = 0; i < nH; i++) { cups[i] /= n; rev[i] /= n }
  const hours: HourForecast[] = cups.map((c, i) => ({ hour: open + i, cups: c, revenue: rev[i], staff: Math.max(st.minStaff, Math.ceil(c / Math.max(1, st.cupsPerStaffHour) - 1e-9)) }))
  const need: Need = Object.fromEntries(hours.map((h) => [h.hour, h.staff]))
  const total = cups.reduce((a, b) => a + b, 0)
  // Vergleichswert: üblicher Tag gleichen Typs in der Jahreszeit (ohne Wetter)
  const base = similarDays(db, storeId, { date, wx: null, type, ferien: false }, today)
  let baseSum = 0, baseN = 0
  for (const d of base.days) { const sd = saleDayOf(db, storeId, d); if (sd) { baseSum += dayCups(sd) * (d < addDays(today, -84) ? trend : 1); baseN++ } }
  const deltaPct = baseN > 0 && baseSum > 0 && n > 0 ? (total / (baseSum / baseN) - 1) * 100 : null
  const wd = WEEKDAYS[weekdayIdx(date)]
  const parts: string[] = [hol ? hol.name : wd]
  if (ferien && !hol) parts.push('Schulferien')
  if (wx) parts.push(`${Math.round(wx.tmax)} °C`, rainClass(wx.rain) === 'trocken' ? (wx.sun >= 6 ? 'Sonne' : 'trocken') : wxKind(wx).label)
  let explain = parts.join(', ')
  if (deltaPct !== null) explain += ` → ähnliche ${wx ? 'Tage' : 'Vorjahrestage'}: ${Math.abs(deltaPct) < 1 ? 'wie üblich' : `${deltaPct > 0 ? '+' : '−'}${num(Math.abs(deltaPct))} %`}`
  if (!wx) explain += ' (ohne Wetter gerechnet)'
  const out: StaffDay = {
    date, type, holiday: hol?.name, ferien, wx, noWeather: !wx, cups: total, revenue: rev.reduce((a, b) => a + b, 0), hours, need, open, close,
    peak: Math.max(0, ...hours.map((h) => h.staff)), similarCount: n, level: res.level, deltaPct, explain,
  }
  m.set(key, out)
  return out
}
export const staffDays = (db: Db, storeId: string, days = 14, today = todayISO()) => Array.from({ length: days }, (_, i) => staffDay(db, storeId, addDays(today, i), today))
export { DAYTYPE_LABEL }

/* ---------- Plan vs. Bedarf ---------- */
export interface DayStaffing {
  date: string
  open: number
  close: number
  need: Need
  cov: number[]
  gaps: Gap[]
  /** Besetzung als Ampel */
  light: 'green' | 'yellow' | 'red'
  missingHours: number
  overHours: number
}
export function dayStaffing(db: Db, storeId: string, date: string, today = todayISO(), shifts?: Shift[]): DayStaffing {
  const sd = staffDay(db, storeId, date, today)
  const list = (shifts ?? db.shifts).filter((s) => s.storeId === storeId && s.date === date && db.employees.find((e) => e.id === s.empId)?.active !== false && s.status !== 'ausfall')
  const cov = coverage(list, sd.open, sd.close)
  const gaps = gapsOf(sd.need, cov, sd.open)
  const missingHours = gaps.reduce((s, g) => s + (g.to - g.from) * g.missing, 0)
  const overHours = cov.reduce((s, c, i) => s + Math.max(0, c - (sd.need[sd.open + i] ?? 0)), 0)
  const tooMany = gaps.length === 0 && overHours > 0
  void tooMany
  const light = missingHours === 0 ? 'green' : missingHours <= 3 ? 'yellow' : 'red'
  return { date, open: sd.open, close: sd.close, need: sd.need, cov, gaps, light, missingHours, overHours }
}
export const gapLines = (db: Db, storeId: string, from: string, days: number, today = todayISO()): { date: string; text: string; light: 'yellow' | 'red' }[] => {
  const out: { date: string; text: string; light: 'yellow' | 'red' }[] = []
  for (let i = 0; i < days; i++) {
    const d = dayStaffing(db, storeId, addDays(from, i), today)
    for (const g of d.gaps) out.push({ date: d.date, text: gapText(d.date, g), light: d.light === 'red' ? 'red' : 'yellow' })
  }
  return out
}
void dayRevenue

/** Die einzige Zählung von Lücken: ein Zeitfenster an einem Tag = 1 Lücke (egal, wie viele Personen fehlen); vergangene Tage zählen nicht */
export const gapCount = (db: Db, storeId: string, dates: string[], today = todayISO()): number =>
  dates.filter((d) => d >= today).reduce((n, d) => n + dayStaffing(db, storeId, d, today).gaps.length, 0)
