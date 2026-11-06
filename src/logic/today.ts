import type { Db } from '../data/types'
import { addDays, todayISO } from '../lib/date'
import { fmtDayMonth } from '../lib/format'
import type { IconName } from '../icons'
import { dayCups, dayRevenue, saleDayOf } from './history'
import { expectedCups, forecastAll, reachTone, type Light } from './forecast'
import { inventoryState, monthLabel } from './inventory'
import { dayStaffing, gapCount, staffDay } from './staffing'
import { hash01 } from '../data/seedHr'
import { gapText } from './hr'
import { storeTips, type Tip } from './tips'
import { wxKind, type WxDay } from './weather'
import { orderList } from './orderlist'

/** Verkäufe des Tages: Becher, Umsatz und Größen nach Stückzahl (Bestseller zuerst) */
export interface SalesToday {
  cups: number
  revenue: number
  sizes: { id: string; label: string; n: number }[]
}
/** Typischer Tagesverlauf (Stunde 10–19): ruhiger Vormittag, Spitze am Mittag, kleines Tief am frühen Nachmittag, zweite Spitze am späten Nachmittag */
const PROFILE = [0.7, 0.85, 1.2, 1.35, 0.85, 0.8, 1.0, 1.25, 1.2, 0.9]
export interface HourPoint { hour: number; fc: number; dev: number; act: number; share: number }
/** Prognose und (Demo-)Verkäufe je Stunde: Prognose = Tagessumme × Tagesverlauf (sonnig = höhere Summe), Verkäufe folgen ihr mit leichter Abweichung (meist ±3 bis ±8 %, einzelne Stunden bis ±12 %) */
export function hourlyModel(db: Db, storeId: string, today = todayISO(), now = new Date()) {
  const sd = staffDay(db, storeId, today, today)
  const n = Math.max(1, sd.close - sd.open)
  const prof = Array.from({ length: n }, (_, i) => PROFILE[Math.min(PROFILE.length - 1, Math.round((i * (PROFILE.length - 1)) / Math.max(1, n - 1)))])
  const sum = prof.reduce((a, b) => a + b, 0)
  const bias = (0.03 + hash01(storeId + today + 'b') * 0.05) * (hash01(storeId + today + 's') < 0.5 ? -1 : 1)
  const frac = now.getHours() + now.getMinutes() / 60
  const hours: HourPoint[] = prof.map((w, i) => {
    const hour = sd.open + i
    const fc = (sd.cups * w) / sum
    const dev = Math.max(-0.12, Math.min(0.12, bias + (hash01(`${storeId}${today}${hour}`) - 0.5) * 0.1))
    const share = Math.max(0, Math.min(1, frac - hour))
    return { hour, fc, dev, act: fc * (1 + dev) * share, share }
  })
  const fcNow = hours.reduce((a, h) => a + h.fc * h.share, 0)
  const actNow = hours.reduce((a, h) => a + h.act, 0)
  return { hours, fcNow, actNow }
}
/** Prognose der Becher bis zur aktuellen Uhrzeit */
export const forecastSoFar = (db: Db, storeId: string, today = todayISO(), now = new Date()): number => hourlyModel(db, storeId, today, now).fcNow
/** Verkäufe von heute (Demo): folgen der Prognosekurve mit leichter Abweichung */
export function salesToday(db: Db, storeId: string, today = todayISO()): SalesToday {
  const day = saleDayOf(db, storeId, today)
  if (!day) return { cups: 0, revenue: 0, sizes: [] }
  const raw = dayCups(day)
  const cups = Math.round(hourlyModel(db, storeId, today).actNow)
  const k = raw > 0 ? cups / raw : 0
  if (k > 0) {
    const sizes = db.recipes.filter((r) => r.kind === 'size').map((r) => ({ id: r.id, label: r.id.slice(-1).toUpperCase(), n: Math.round((day.counts[r.id] ?? 0) * k) })).filter((s) => s.n > 0).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label))
    return { cups, revenue: dayRevenue(db, day) * k, sizes }
  }
  const sizes = db.recipes
    .filter((r) => r.kind === 'size')
    .map((r) => ({ id: r.id, label: r.id.slice(-1).toUpperCase(), n: day.counts[r.id] ?? 0 }))
    .filter((s) => s.n > 0)
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label))
  return { cups: dayCups(day), revenue: dayRevenue(db, day), sizes }
}

export type TaskKey = 'gaps' | 'order' | 'delivery' | 'inventory' | 'hq'
export interface TodayTask {
  key: TaskKey
  tone: 'red' | 'yellow'
  icon: IconName
  title: string
  text: string
  btn: string
  /** Ziel im Laden (relativ zum Laden-Pfad, z. B. „ware/artikel“) */
  to: string
  /** Dienstplan-Lücke: dieser Tag wird im Team-Kalender hervorgehoben */
  day?: string
}
export interface TodayState {
  level: Light
  headline: string
  tasks: TodayTask[]
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Aufgaben des Tages (höchstens eine je Bereich = höchstens 5) und der ehrliche Status dazu */
export function todayState(db: Db, storeId: string, today = todayISO()): TodayState {
  const tasks: TodayTask[] = []

  // 1) Dienstplan-Lücken in den nächsten 7 Tagen
  const week = Array.from({ length: 7 }, (_, i) => dayStaffing(db, storeId, addDays(today, i), today))
  const gapDays = week.filter((d) => d.gaps.length)
  if (gapDays.length) {
    const n = gapCount(db, storeId, week.map((d) => d.date), today)
    tasks.push({
      key: 'gaps', tone: gapDays.some((d) => d.light === 'red') ? 'red' : 'yellow', icon: 'people',
      title: `Dienstplan: ${plural(n, 'Lücke', 'Lücken')} in den nächsten 7 Tagen`, text: gapText(gapDays[0].date, gapDays[0].gaps[0]), btn: 'Lücke schließen', to: 'team', day: gapDays[0].date,
    })
  }

  // 2) Bestellen: alle Artikel, die nicht grün sind und noch nicht bestellt wurden
  const need = forecastAll(db, storeId).filter((f) => reachTone(f) !== 'green' && !f.ordered)
  const open = orderList(db, storeId).filter((i) => i.status === 'offen')
  if (need.length || open.length) {
    const names = (need.length ? need.map((f) => f.article.name) : open.map((i) => i.article.name))
    const red = need.some((f) => reachTone(f) === 'red')
    const n = Math.max(need.length, open.length)
    tasks.push({
      key: 'order', tone: red ? 'red' : 'yellow', icon: 'cart',
      title: `${plural(n, 'Artikel', 'Artikel')} ${red ? 'jetzt ' : ''}bestellen`, text: names.slice(0, 3).join(', ') + (names.length > 3 ? ' …' : ''), btn: 'Zum Bestellen', to: 'ware/artikel',
    })
  }

  // 3) Lieferung bestätigen bzw. Topping-Lieferung abhaken
  const unconfirmed = db.deliveries.filter((d) => d.storeId === storeId && d.bookedBy === 'zentrale' && !d.confirmed && d.date <= today)
  const toppingDue = db.orders.filter((o) => o.storeId === storeId && o.supplier !== 'Headquarter' && o.status === 'bestellt' && o.expectedOn <= today)
  if (unconfirmed.length || toppingDue.length) {
    tasks.push({
      key: 'delivery', tone: 'yellow', icon: 'truck', title: 'Lieferung bestätigen',
      text: unconfirmed.length ? `${plural(unconfirmed.length, 'Position', 'Positionen')} vom Headquarter warten auf deine Bestätigung.` : `${toppingDue[0].supplier}: Die Ware sollte da sein.`, btn: 'Bestätigen', to: 'ware/bestellungen',
    })
  }

  // 4) Inventur
  const inv = inventoryState(db, storeId, today)
  if (inv.special || inv.status === 'offen' || inv.status === 'überfällig' || inv.reminder) {
    const red = !!inv.special || inv.status === 'überfällig'
    tasks.push({
      key: 'inventory', tone: red ? 'red' : 'yellow', icon: 'inventory',
      title: inv.special ? 'Sonder-Inventur vom HQ' : inv.status === 'überfällig' ? `Monatsinventur ${monthLabel(inv.period)} überfällig` : `Monatsinventur ${monthLabel(inv.period)}: jetzt zählen`,
      text: inv.special ? 'Das HQ bittet um eine zusätzliche Zählung.' : inv.status === 'überfällig' ? `Die Monatsinventur vom ${fmtDayMonth(inv.due)} fehlt. Bitte jetzt zählen.` : `Stichtag ist der ${fmtDayMonth(inv.due)}. Bitte die Artikel des Headquarters zählen.`, btn: 'Jetzt zählen', to: 'inventur',
    })
  }

  // 5) Neue Nachricht vom HQ
  const unread = db.posts.filter((p) => (p.to.length === 0 || p.to.includes(storeId)) && !p.readBy[storeId])
  if (unread.length) {
    const imp = unread.some((p) => p.important)
    tasks.push({ key: 'hq', tone: imp ? 'red' : 'yellow', icon: 'note', title: unread.length === 1 ? 'Neue Nachricht vom HQ' : `${unread.length} neue Nachrichten vom HQ`, text: unread[0].title, btn: 'Lesen', to: 'hq/pinnwand' })
  }

  // Sortierung: Dienstplan-Lücken zuerst, dann Rot vor Gelb, sonst in fester Reihenfolge
  const order: TaskKey[] = ['gaps', 'order', 'delivery', 'inventory', 'hq']
  tasks.sort((a, b) => (a.key === 'gaps' ? -1 : 0) - (b.key === 'gaps' ? -1 : 0) || Number(b.tone === 'red') - Number(a.tone === 'red') || order.indexOf(a.key) - order.indexOf(b.key))

  const level: Light = tasks.some((t) => t.tone === 'red') ? 'red' : tasks.length ? 'yellow' : 'green'
  const headline = tasks.length === 0 ? 'Alles erledigt' : tasks.length === 1 ? '1 Ding zu tun' : `${tasks.length} Dinge zu tun`
  return { level, headline, tasks }
}

/** Höchstens zwei Tipps aus den eigenen Daten */
export const todayTips = (db: Db, storeId: string, today = todayISO()): Tip[] => storeTips(db, storeId, today).slice(0, 2)

export interface WeekDay {
  date: string
  cups: number
  /** Fehlende Personen (größte Lücke des Tages), 0 = besetzt */
  missing: number
}
/** „Diese Woche“: erwartete Becher und Besetzung je Tag */
export function weekOverview(db: Db, storeId: string, today = todayISO()): WeekDay[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i)
    const d = dayStaffing(db, storeId, date, today)
    return { date, cups: Math.round(expectedCups(db, storeId, date, today) / 10) * 10, missing: d.gaps.reduce((m, g) => Math.max(m, g.missing), 0) }
  })
}

/** Wettersymbol zur erwarteten Becherzahl: viele Becher = Sonne, wenige = Wolke oder Regen, sonst das echte Wetter */
export function dayWxIcon(w: WxDay | null, cups: number, mean: number): IconName {
  if (mean > 0 && cups >= mean * 1.06) return 'wx-sun'
  const real: IconName = w ? wxKind(w).icon : 'wx-part'
  if (mean > 0 && cups <= mean * 0.94) return real === 'wx-sun' || real === 'wx-part' ? 'wx-cloud' : real
  return real === 'wx-sun' ? 'wx-part' : real
}
