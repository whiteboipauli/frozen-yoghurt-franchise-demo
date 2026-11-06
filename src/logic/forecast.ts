import type { Article, Db } from '../data/types'
import { addDays, diffDays, leadDays, todayISO, weekdayIdx, WEEKDAYS } from '../lib/date'
import { packBase } from './consumption'
import { packsOf } from './invoice'
import { stockNow, usedOn } from './stock'
import { rainClass, weatherVersion, wxKind, type WxDay } from './weather'
import { dayType, holidayOn, schoolHolidayOn, similarDays, wxOn, type DayType } from './history'

export type Light = 'green' | 'yellow' | 'red'
export const CUP_IDS = ['becher-s', 'becher-m', 'becher-l']
export const POWDER_ID = 'pulver'

export { dayType, holidayOn, wxOn }
export type { DayType }

/** Durchschnittsverbrauch je Wochentag (Mo=0) aus den letzten 4 Wochen bis gestern */
export function avgByWeekday(db: Db, storeId: string, articleId: string, today = todayISO()): number[] {
  const sums = Array(7).fill(0)
  const cnt = Array(7).fill(0)
  for (let i = 1; i <= 28; i++) {
    const d = addDays(today, -i)
    if (d < db.startDate) continue
    const w = weekdayIdx(d)
    sums[w] += usedOn(db, storeId, articleId, d)
    cnt[w]++
  }
  return sums.map((s, i) => (cnt[i] ? s / cnt[i] : 0))
}

/* ---------- Ähnliche Tage ---------- */
export interface DayPlan {
  date: string
  type: DayType
  wx: WxDay | null
  ferien: boolean
  /** Ähnliche vergangene Tage (null = zu wenige → Wochentag-Durchschnitt) */
  similar: string[] | null
}
const planCache = new WeakMap<Db, Map<string, DayPlan>>()

export function dayPlan(db: Db, storeId: string, date: string, today = todayISO()): DayPlan {
  let m = planCache.get(db)
  if (!m) planCache.set(db, (m = new Map()))
  const key = `${storeId}|${date}|${today}|${weatherVersion()}`
  const hit = m.get(key)
  if (hit) return hit
  const type = dayType(db, storeId, date)
  const wx = wxOn(db, storeId, date)
  const ferien = !!schoolHolidayOn(db, storeId, date)
  const res = similarDays(db, storeId, { date, wx, type, ferien }, today)
  const plan: DayPlan = { date, type, wx, ferien, similar: res.days.length >= 3 ? res.days : null }
  m.set(key, plan)
  return plan
}

const wdAvgCache = new WeakMap<Db, Map<string, number[]>>()
function wdAvg(db: Db, storeId: string, articleId: string, today: string) {
  let m = wdAvgCache.get(db)
  if (!m) wdAvgCache.set(db, (m = new Map()))
  const k = `${storeId}|${articleId}|${today}`
  let v = m.get(k)
  if (!v) m.set(k, (v = avgByWeekday(db, storeId, articleId, today)))
  return v
}

/** Erwarteter Verbrauch eines Artikels an einem Tag (inkl. Schwund-Pauschale) */
export function expectedUse(db: Db, storeId: string, articleId: string, date: string, today = todayISO()): number {
  const plan = dayPlan(db, storeId, date, today)
  const f = date > today ? campaignFactor(db, articleId, date) : 1
  if (plan.similar) {
    let s = 0
    for (const d of plan.similar) s += usedOn(db, storeId, articleId, d)
    return (s / plan.similar.length) * f
  }
  return wdAvg(db, storeId, articleId, today)[weekdayIdx(date)] * f
}
/** Mehrmenge durch Aktionen des HQ (Aktionskalender) an einem Tag */
export function campaignFactor(db: Pick<Db, 'campaigns'>, articleId: string, date: string): number {
  let f = 1
  for (const c of db.campaigns ?? []) if (date >= c.from && date <= c.to && c.articleIds.includes(articleId)) f *= 1 + c.extraPct / 100
  return f
}
export const expectedCups = (db: Db, storeId: string, date: string, today = todayISO()) =>
  CUP_IDS.reduce((s, id) => s + expectedUse(db, storeId, id, date, today), 0)

export interface DayExplain {
  date: string
  plan: DayPlan
  cups: number
  /** Abweichung zum normalen Wochentag in % (null = keine Besonderheit bekannt) */
  deltaPct: number | null
  text: string
}
export function explainDay(db: Db, storeId: string, date: string, today = todayISO()): DayExplain {
  const plan = dayPlan(db, storeId, date, today)
  const cups = expectedCups(db, storeId, date, today)
  const base = CUP_IDS.reduce((s, id) => s + wdAvg(db, storeId, id, today)[weekdayIdx(date)], 0)
  const deltaPct = plan.similar && base > 0 ? (cups / base - 1) * 100 : null
  const parts = [WEEKDAYS[weekdayIdx(date)]]
  const h = holidayOn(db, storeId, date)
  if (h) parts.push(h.name)
  else if (plan.ferien) parts.push('Schulferien')
  if (plan.wx) {
    const k = wxKind(plan.wx)
    parts.push(rainClass(plan.wx.rain) === 'trocken' ? 'trocken' : `${k.label} erwartet`)
  }
  let text = parts.join(', ')
  if (deltaPct !== null && Math.abs(deltaPct) >= 1) text += ` → ähnliche Tage: ${deltaPct > 0 ? '+' : '−'}${Math.abs(Math.round(deltaPct))} %`
  else if (plan.similar) text += ' → ähnliche Tage: wie üblich'
  else text += ' → zu wenig ähnliche Tage, es gilt der Wochentag-Durchschnitt'
  return { date, plan, cups, deltaPct, text }
}

/* ---------- Bestand & Prognose ---------- */
export interface Incoming {
  date: string
  qty: number
}
export function incomingFor(db: Db, storeId: string, articleId: string, today = todayISO()): Incoming[] {
  const a = db.articles.find((x) => x.id === articleId)
  if (!a) return []
  const out: Incoming[] = []
  for (const o of db.orders) {
    if (o.storeId !== storeId || o.status !== 'bestellt') continue
    for (const l of o.lines) if (l.articleId === articleId) out.push({ date: o.expectedOn < today ? today : o.expectedOn, qty: l.packs * packBase(a) })
  }
  // Bestellungen beim HQ, die noch nicht versendet sind
  for (const c of db.centralOrders) {
    if (c.storeId !== storeId || (c.status !== 'eingegangen' && c.status !== 'bestätigt')) continue
    for (const l of c.lines) if (l.articleId === articleId) out.push({ date: c.wishDate < today ? today : c.wishDate, qty: packsOf(l) * packBase(a) })
  }
  return out
}

export interface ArticleForecast {
  article: Article
  stock: number
  incomingQty: number
  /** Ø erwarteter Tagesverbrauch der nächsten 14 Tage */
  daily: number
  /** Tage bis leer (0 = heute), null = nicht innerhalb des Horizonts */
  daysLeft: number | null
  emptyDate: string | null
  /** Reichweite in Tagen ab heute (mit Nachkomma), null = über den Horizont */
  reach: number | null
  latestOrderDate: string | null
  light: Light
  /** offene Bestellung vorhanden */
  ordered: boolean
  suggestion: { packs: number; qty: number } | null
}

const HORIZON = 90

/** Tageweise Projektion des Bestands ab heute */
export function project(db: Db, storeId: string, articleId: string, days = HORIZON, today = todayISO()) {
  const inc = incomingFor(db, storeId, articleId, today)
  const consToday = usedOn(db, storeId, articleId, today)
  let s = stockNow(db, storeId, articleId) - Math.max(0, expectedUse(db, storeId, articleId, today, today) - consToday)
  const path: { date: string; stock: number; use: number }[] = []
  let emptyDate: string | null = null
  for (let i = 0; i <= days; i++) {
    const d = addDays(today, i)
    for (const x of inc) if (x.date === d) s += x.qty
    const use = i === 0 ? 0 : expectedUse(db, storeId, articleId, d, today)
    s -= use
    path.push({ date: d, stock: s, use })
    if (emptyDate === null && s <= 0) emptyDate = d
  }
  return { path, emptyDate }
}

export function forecastArticle(db: Db, storeId: string, a: Article, today = todayISO()): ArticleForecast {
  const { emptyDate, path } = project(db, storeId, a.id, HORIZON, today)
  let reach: number | null = null
  if (emptyDate) {
    const i = path.findIndex((p) => p.date === emptyDate)
    reach = i <= 0 ? 0.4 : i + Math.min(0.99, Math.max(0, path[i - 1].stock / Math.max(1e-9, path[i].use)))
  }
  let sum14 = 0
  for (let i = 0; i < 14; i++) sum14 += expectedUse(db, storeId, a.id, addDays(today, i), today)
  const daily = sum14 / 14
  const stock = stockNow(db, storeId, a.id)
  const inc = incomingFor(db, storeId, a.id, today)
  const incomingQty = inc.reduce((s, x) => s + x.qty, 0)
  const { bufferDays, targetDays } = db.settings
  const daysLeft = emptyDate ? diffDays(emptyDate, today) : null
  const lead = leadDays(today, a.leadTimeDays)
  const latestOrderDate = emptyDate ? addDays(emptyDate, -lead - bufferDays) : null
  let light: Light = 'green'
  if (daily > 0 && emptyDate && latestOrderDate) {
    if (stock <= 0 || daysLeft! < lead) light = 'red'
    else if (latestOrderDate <= today) light = 'yellow'
  }
  let suggestion: ArticleForecast['suggestion'] = null
  if (latestOrderDate && latestOrderDate <= addDays(today, 3) && daily > 0) {
    let untilDelivery = Math.max(0, expectedUse(db, storeId, a.id, today, today) - usedOn(db, storeId, a.id, today))
    for (let i = 1; i <= lead; i++) untilDelivery += expectedUse(db, storeId, a.id, addDays(today, i), today)
    const need = untilDelivery + targetDays * daily - (Math.max(0, stock) + incomingQty)
    const packs = Math.max(1, Math.ceil(need / packBase(a)))
    if (need > 0) suggestion = { packs, qty: packs * packBase(a) }
  }
  return { article: a, stock, incomingQty, daily, daysLeft, emptyDate, reach, latestOrderDate, light, ordered: inc.length > 0, suggestion }
}

const fcCache = new WeakMap<Db, Map<string, ArticleForecast[]>>()
export function forecastAll(db: Db, storeId: string): ArticleForecast[] {
  let m = fcCache.get(db)
  if (!m) fcCache.set(db, (m = new Map()))
  const k = `${storeId}|${todayISO()}|${weatherVersion()}`
  let v = m.get(k)
  if (!v) m.set(k, (v = db.articles.map((a) => forecastArticle(db, storeId, a))))
  return v
}

export const LIGHT_RANK: Record<Light, number> = { red: 0, yellow: 1, green: 2 }
export const byUrgency = (a: ArticleForecast, b: ArticleForecast) =>
  LIGHT_RANK[a.light] - LIGHT_RANK[b.light] || (a.daysLeft ?? 999) - (b.daysLeft ?? 999)

/** Prognose Becher je Tag (für Kurven) */
export function cupSeries(db: Db, storeId: string, back = 14, ahead = 14, today = todayISO()) {
  const out: { date: string; value: number; future: boolean; explain: DayExplain }[] = []
  for (let i = -back; i <= ahead; i++) {
    const date = addDays(today, i)
    const future = i >= 0
    const real = CUP_IDS.reduce((s, id) => s + usedOn(db, storeId, id, date), 0)
    const explain = explainDay(db, storeId, date, today)
    out.push({ date, value: future ? explain.cups : real, future, explain })
  }
  return out
}

/** Ampel nach Reichweite (Füllstand, Balken): unter 3 Tagen rot, unter 7 gelb, sonst grün */
export const reachTone = (f: Pick<ArticleForecast, 'reach' | 'light'>): Light =>
  f.light === 'red' || (f.reach !== null && f.reach < 3) ? 'red' : f.light === 'yellow' || (f.reach !== null && f.reach < 7) ? 'yellow' : 'green'
/** Füllstand in % passend zur Reichweite (14 Tage und mehr = voll, fast leer = fast leer) */
export const reachPct = (f: Pick<ArticleForecast, 'reach'>, full = 14) => (f.reach === null ? 100 : Math.max(4, Math.min(100, (f.reach / full) * 100)))
/** Sortierung nach frühestem Leer-Datum (mit Nachkomma), ohne Leer-Datum zuletzt */
export const byReach = (a: Pick<ArticleForecast, 'reach' | 'article'>, b: Pick<ArticleForecast, 'reach' | 'article'>) => (a.reach ?? 1e9) - (b.reach ?? 1e9) || a.article.name.localeCompare(b.article.name, 'de')
