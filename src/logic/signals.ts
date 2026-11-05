import type { Db } from '../data/types'
import { addDays, diffDays, todayISO, weekdayIdx, WEEKDAYS } from '../lib/date'
import { fmtDayMonth } from '../lib/format'
import type { IconName } from '../icons'
import type { Level } from '../ui/signal'
import { LEVEL_RANK, worstLevel } from '../ui/signal'
import { expectedCups, forecastAll, holidayOn, reachTone } from './forecast'
import { dayStaffing, gapCount } from './staffing'
import { invoiceState } from './invoice'
import { todayState, type TodayTask } from './today'
import { absenceTasks } from './callouts'
import { inventoryState, MONTHS, monthLabel } from './inventory'
import { dueReportMonth } from './finance'

export type TaskGroup = 'jetzt' | 'woche' | 'spaeter'
export const GROUP_LABEL: Record<TaskGroup, string> = { jetzt: 'Jetzt', woche: 'Diese Woche', spaeter: 'Später' }
export const GROUP_LEVEL: Record<TaskGroup, Level> = { jetzt: 'rot', woche: 'bernstein', spaeter: 'info' }

export interface SigTask {
  key: string
  kind: string
  level: Level
  group: TaskGroup
  icon: IconName
  title: string
  text: string
  btn: string
  /** Ziel im Laden (relativ, z. B. „ware/artikel“) */
  to: string
  day?: string
  /** Menüpunkt, dem diese Aufgabe zugeordnet ist */
  nav: string
  n: number
  time?: { text: string; level?: Level; progress?: number }
  /** Öffnet ein Fenster statt einer Seite */
  modal?: string
}
export interface SigWarning {
  key: string
  level: Level
  trend: 'ab' | 'auf'
  icon?: IconName
  text: string
  when: string
  to: string
  day?: string
}

const dayWord = (d: string, today: string) => { const n = diffDays(d, today); return n === 0 ? 'heute' : n === 1 ? 'morgen' : WEEKDAYS[weekdayIdx(d)] }
const dayWordShort = (d: string, today: string) => { const n = diffDays(d, today); return n === 0 ? 'heute' : n === 1 ? 'morgen' : `am ${WEEKDAYS[weekdayIdx(d)]}` }
const inDays = (d: string, today: string) => { const n = diffDays(d, today); return n <= 0 ? 'heute' : n === 1 ? 'morgen' : `in ${n} Tagen` }

export interface StoreSignals {
  tasks: SigTask[]
  warnings: SigWarning[]
  level: Level
  counts: { rot: number; bernstein: number; normal: number }
  byGroup: Record<TaskGroup, SigTask[]>
  nav: Record<string, { level: Level; n: number }>
}

const cache = new WeakMap<Db, Map<string, StoreSignals>>()

/** EINE Quelle für Heute, Menü-Abzeichen und Cockpit: alle Aufgaben und Vorausschau-Warnungen eines Ladens, mit Stufe und Zeit */
export function storeSignals(db: Db, storeId: string, today = todayISO()): StoreSignals {
  let m = cache.get(db)
  if (!m) cache.set(db, (m = new Map()))
  const ck = `${storeId}|${today}`
  const hit = m.get(ck)
  if (hit) return hit

  const base = todayState(db, storeId, today).tasks
  const tasks: SigTask[] = []
  const fc = forecastAll(db, storeId)

  // Ausfall (Krankmeldung) zuerst
  tasks.push(...absenceTasks(db, storeId, today))

  for (const t of base as TodayTask[]) {
    const common = { key: t.key, kind: t.key, icon: t.icon, title: t.title, text: t.text, btn: t.btn, to: t.to, day: t.day }
    if (t.key === 'gaps') {
      const d = t.day ?? today
      const near = diffDays(d, today) <= 1
      const gaps = gapCount(db, storeId, Array.from({ length: 7 }, (_, i) => addDays(today, i)), today)
      tasks.push({ ...common, icon: 'person-plus', level: 'rot', group: near ? 'jetzt' : 'woche', nav: 'team/dienstplan', n: gaps, time: { text: `Lücke ${dayWordShort(d, today)}` } })
    } else if (t.key === 'order') {
      const need = fc.filter((f) => reachTone(f) !== 'green' && !f.ordered).sort((a, b) => (a.reach ?? 99) - (b.reach ?? 99))
      const f = need[0]
      const red = t.tone === 'red'
      const left = f?.reach == null ? null : Math.floor(f.reach)
      tasks.push({ ...common, icon: 'paket', level: red ? 'rot' : 'bernstein', group: red ? 'jetzt' : 'woche', nav: 'ware/artikel', n: Math.max(1, need.length),
        time: f?.latestOrderDate ? { text: `bestellen bis ${dayWord(f.latestOrderDate, today) === 'heute' ? 'heute' : dayWord(f.latestOrderDate, today)}`, progress: left == null ? undefined : Math.max(0.05, Math.min(1, left / 7)) } : left != null ? { text: left <= 0 ? 'reicht nur noch heute' : `reicht noch ${left} Tage` } : undefined })
    } else if (t.key === 'delivery') {
      const old = db.deliveries.some((d) => d.storeId === storeId && d.bookedBy === 'zentrale' && !d.confirmed && d.date < today)
      tasks.push({ ...common, icon: 'lkw', level: 'bernstein', group: old ? 'jetzt' : 'woche', nav: 'ware/bestellungen', n: 1, time: { text: old ? 'seit gestern offen' : 'heute geliefert' } })
    } else if (t.key === 'inventory') {
      const over = t.tone === 'red'
      const inv = inventoryState(db, storeId, today)
      const due = t.text.match(/\d\d\.\d\d\./)?.[0]
      void due
      tasks.push({ ...common, icon: 'klemmbrett', level: over ? 'rot' : 'bernstein', group: over ? 'jetzt' : 'woche', nav: 'inventur', n: 1, time: { text: over ? 'überfällig' : diffDays(inv.due, today) <= 0 ? 'heute Stichtag' : `bis ${fmtDayMonth(inv.due)}`, progress: over ? 1 : Math.max(0.1, 1 - diffDays(inv.due, today) / 3) } })
    } else {
      const imp = t.tone === 'red'
      tasks.push({ ...common, icon: 'megafon', level: 'info', group: imp ? 'woche' : 'spaeter', nav: 'hq/pinnwand', n: db.posts.filter((p) => (p.to.length === 0 || p.to.includes(storeId)) && !p.readBy[storeId]).length, time: { text: 'neu' } })
    }
  }

  // überfällige Rechnungen
  const late = db.invoices.filter((i) => i.storeId === storeId && invoiceState(i, today) === 'überfällig')
  if (late.length) {
    tasks.push({ key: 'invoice-late', kind: 'invoice', level: 'rot', group: 'jetzt', icon: 'rechnung', title: late.length === 1 ? '1 Rechnung überfällig' : `${late.length} Rechnungen überfällig`, text: `Die Zahlungsfrist ist abgelaufen (${late[0].number}).`, btn: 'Rechnungen ansehen', to: 'ware/rechnungen', nav: 'ware/rechnungen', n: late.length, time: { text: `seit ${Math.max(1, diffDays(today, late[0].dueDate))} Tagen` } })
  }

  // Monatszahlen: ab dem 1. des Folgemonats, bis sie gemeldet sind
  const dueM = dueReportMonth(db, storeId, today)
  if (dueM) tasks.push({ key: 'monthly', kind: 'monthly', level: 'bernstein', group: 'woche', icon: 'euro', title: `Monatszahlen ${monthLabel(dueM)} melden`, text: 'Personalkosten, Miete und Monatsumsatz laut Kasse – drei Zahlen genügen.', btn: 'Zahlen melden', to: 'monatszahlen', nav: 'monatszahlen', n: 1, time: { text: `seit dem 1. ${MONTHS[+today.slice(5, 7) - 1]}` } })

  const rank = (t: SigTask) => ['jetzt', 'woche', 'spaeter'].indexOf(t.group) * 10 - LEVEL_RANK[t.level]
  tasks.sort((a, b) => rank(a) - rank(b))

  // Vorausschau
  const warnings: SigWarning[] = []
  for (const f of fc.filter((x) => x.reach !== null && x.reach <= 7 && !x.ordered).sort((a, b) => (a.reach ?? 99) - (b.reach ?? 99)).slice(0, 2)) {
    const days = Math.floor(f.reach as number)
    const until = addDays(today, days)
    warnings.push({ key: `reach-${f.article.id}`, level: days < 3 ? 'rot' : 'bernstein', trend: 'ab', icon: 'trend-ab', text: days <= 0 ? `${f.article.name} reicht nur noch heute` : `${f.article.name} reicht nur noch bis ${WEEKDAYS[weekdayIdx(until)]}`, when: days <= 0 ? 'heute' : `in ${days} Tagen`, to: 'ware/artikel' })
  }
  let gapW = 0
  for (let i = 1; i <= 7 && gapW < 2; i++) {
    const d = addDays(today, i)
    const s = dayStaffing(db, storeId, d, today)
    if (s.gaps.length) {
      const missing = s.gaps.reduce((mx, g) => Math.max(mx, g.missing), 0)
      warnings.push({ key: `gap-${d}`, level: 'bernstein', trend: 'ab', icon: 'person-plus', text: `${dayWord(d, today)} ${missing === 1 ? 'fehlt eine Person' : `fehlen ${missing} Personen`} bei ${Math.round(expectedCups(db, storeId, d, today))} erwarteten Bechern`, when: inDays(d, today), to: 'team/dienstplan', day: d })
      gapW++
    }
  }
  for (let i = 1; i <= 6; i++) {
    const d = addDays(today, i)
    const h = holidayOn(db, storeId, d)
    if (h) { warnings.push({ key: `hol-${d}`, level: 'info', trend: 'auf', icon: 'kalender-warnung', text: `${dayWord(d, today)} ${h.name}: mehr Becher erwartet`, when: inDays(d, today), to: 'team/dienstplan', day: d }); break }
  }

  const level = tasks.length ? worstLevel(tasks.map((t) => t.level)) : 'gruen'
  const counts = { rot: tasks.filter((t) => t.level === 'rot').length, bernstein: tasks.filter((t) => t.level === 'bernstein').length, normal: tasks.filter((t) => t.level === 'info').length }
  const byGroup = { jetzt: tasks.filter((t) => t.group === 'jetzt'), woche: tasks.filter((t) => t.group === 'woche'), spaeter: tasks.filter((t) => t.group === 'spaeter') }
  const nav: StoreSignals['nav'] = { heute: { level, n: tasks.length } }
  for (const t of tasks) {
    const cur = nav[t.nav]
    nav[t.nav] = cur ? { level: worstLevel([cur.level, t.level]), n: cur.n + t.n } : { level: t.level, n: t.n }
  }
  const res = { tasks, warnings, level, counts, byGroup, nav }
  m.set(ck, res)
  return res
}
