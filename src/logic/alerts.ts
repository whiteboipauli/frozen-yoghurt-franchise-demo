import { useSyncExternalStore } from 'react'
import type { Db } from '../data/types'
import { todayISO } from '../lib/date'
import { byUrgency, forecastAll, type Light } from './forecast'
import { openCases } from './cases'
import { inventoryState } from './inventory'
import { dayStaffing } from './staffing'
import { validateShifts, gapText } from './hr'
import { addDays, diffDays, weekdayIdx, WEEKDAYS_SHORT } from '../lib/date'
import { reminders } from '../lib/reminders'

export interface Alert {
  key: string
  level: Light
  title: string
  text: string
  to: string
  storeId: string
  articleId?: string
}

const KEY = 'fj-ww-alerts'
interface Mem {
  day: string
  fired: Record<string, true>
  dismissed: Record<string, true>
}
let mem: Mem = { day: todayISO(), fired: {}, dismissed: {} }
try {
  const raw = localStorage.getItem(KEY)
  if (raw) mem = JSON.parse(raw)
} catch {
  /* ignorieren */
}
const ls = new Set<() => void>()
let snap = 0
const persist = () => {
  snap++
  try {
    localStorage.setItem(KEY, JSON.stringify(mem))
  } catch {
    /* ignorieren */
  }
  ls.forEach((l) => l())
}
const rollDay = () => {
  if (mem.day !== todayISO()) mem = { day: todayISO(), fired: {}, dismissed: {} }
}
export const useAlertMemory = () => useSyncExternalStore((l) => (ls.add(l), () => ls.delete(l)), () => snap)
export const alertMem = {
  wasFired(key: string) { rollDay(); return !!mem.fired[key] },
  markFired(key: string) { rollDay(); mem.fired[key] = true; persist() },
  dismiss(key: string) { rollDay(); mem.dismissed[key] = true; persist() },
  isDismissed(key: string) { rollDay(); return !!mem.dismissed[key] },
  reset() { mem = { day: todayISO(), fired: {}, dismissed: {} }; persist() },
}

const dayText = (n: number | null) => (n === null ? 'bald' : n <= 0 ? 'nur noch heute' : n === 1 ? 'noch 1 Tag' : `noch ${n} Tage`)

/** Personal: Lücken im Dienstplan (nächste 7 Tage) und Regelverstöße (Höchststunden, Minijob-Grenze, Ruhezeit …) */
export function staffAlerts(db: Db, storeId: string): Alert[] {
  const today = todayISO()
  const out: Alert[] = []
  for (let i = 0; i < 7 && reminders.isOn('gap'); i++) {
    const date = addDays(today, i)
    const d = dayStaffing(db, storeId, date, today)
    if (!d.gaps.length) continue
    out.push({
      key: `${today}|${storeId}|gap|${date}|${d.gaps.map((g) => `${g.from}-${g.to}x${g.missing}`).join(',')}`, level: d.light === 'red' ? 'red' : 'yellow',
      title: `Erinnerung: Dienstplan-Lücke am ${WEEKDAYS_SHORT[weekdayIdx(date)]}, ${date.slice(8, 10)}.${date.slice(5, 7)}.`, text: d.gaps.map((g) => gapText(date, g)).join(' · '), to: '/filiale/team', storeId,
    })
  }
  for (const v of validateShifts(db, storeId, today, addDays(today, 13)).filter((x) => x.kind !== 'verfuegbar')) {
    out.push({ key: `${today}|${storeId}|viol|${v.empId}|${v.kind}|${v.date}`, level: 'red', title: 'Dienstplan: Regel verletzt', text: v.text, to: '/filiale/team', storeId })
  }
  return out
}

/** Inventur: überfällig, vom HQ angeforderte Sonder-Inventur, Erinnerung */
export function inventoryAlerts(db: Db, storeId: string): Alert[] {
  const today = todayISO()
  const st = inventoryState(db, storeId, today)
  const out: Alert[] = []
  if (!reminders.isOn('inventory')) return out
  if (st.special) out.push({ key: `${st.special.id}`, level: 'red', title: 'Sonder-Inventur vom HQ angefordert', text: 'Bitte die Artikel der Zentrale jetzt zählen.', to: '/filiale/inventur', storeId })
  if (st.reminder) out.push({ key: `${st.reminder.id}`, level: 'yellow', title: 'Erinnerung vom HQ: Inventur', text: 'Die Monatsinventur ist noch offen.', to: '/filiale/inventur', storeId })
  if (st.status === 'überfällig') out.push({ key: `${today}|${storeId}|inv-late`, level: 'red', title: 'Erinnerung: Monatsinventur überfällig', text: 'Die Monatsinventur wurde bis zum 3. nicht gezählt. Bitte jetzt zählen.', to: '/filiale/inventur', storeId })
  return out
}

/** Ungelesene Nachrichten vom HQ (verschwinden mit „Gelesen“) */
export function postAlerts(db: Db, storeId: string): Alert[] {
  if (!reminders.isOn('hq')) return []
  return db.posts.filter((p) => (p.to.length === 0 || p.to.includes(storeId)) && !p.readBy[storeId]).map((p) => ({
    key: `post|${p.id}|${storeId}`, level: p.important ? 'red' : 'yellow', title: `Neu vom HQ: ${p.title}`, text: p.text.length > 90 ? `${p.text.slice(0, 90)} …` : p.text, to: '/filiale/hq/pinnwand', storeId,
  } as Alert))
}

/** Erinnerung: Lieferung angekommen (bestätigen) */
export function deliveryAlerts(db: Db, storeId: string): Alert[] {
  if (!reminders.isOn('delivery')) return []
  const today = todayISO()
  const list = db.deliveries.filter((d) => d.storeId === storeId && d.bookedBy === 'zentrale' && !d.confirmed && d.date <= today)
  if (!list.length) return []
  return [{ key: `${today}|${storeId}|delivery`, level: 'yellow', title: 'Erinnerung: Lieferung angekommen', text: 'Bitte den Empfang der Lieferung von der Zentrale bestätigen.', to: '/filiale/ware/bestellungen', storeId }]
}

/** Erinnerung: Bis morgen bestellen (spätester Bestelltag ist heute oder morgen) */
export function orderTomorrowAlerts(db: Db, storeId: string): Alert[] {
  if (!reminders.isOn('order')) return []
  const today = todayISO()
  return forecastAll(db, storeId).filter((f) => !f.ordered && f.latestOrderDate && diffDays(f.latestOrderDate, today) >= 0 && diffDays(f.latestOrderDate, today) <= 1)
    .map((f) => ({ key: `${today}|${storeId}|tomorrow|${f.article.id}`, level: 'yellow' as Light, title: `Erinnerung: ${f.article.name} bis morgen bestellen`, text: 'Danach reicht es nicht mehr bis zur nächsten Lieferung.', to: '/filiale/ware/artikel', storeId }))
}

/** Aktuelle Alarme eines Ladens (Artikel gelb/rot, Inventur, Personal) */
export function storeAlerts(db: Db, storeId: string): Alert[] {
  const today = todayISO()
  return [...forecastAll(db, storeId)
    .filter((f) => f.light !== 'green' && !f.ordered)
    .sort(byUrgency)
    .map((f) => ({
      key: `${today}|${storeId}|art|${f.article.id}`,
      level: f.light,
      title: f.light === 'red' ? `${f.article.name}: Lieferung käme zu spät` : `${f.article.name} reicht ${dayText(f.daysLeft)}`,
      text: f.light === 'red' ? 'Jetzt bestellen – sonst ist die Ware leer, bevor sie ankommt.' : 'Jetzt bestellen.',
      to: '/filiale/ware/artikel',
      storeId,
      articleId: f.article.id,
    })), ...orderTomorrowAlerts(db, storeId), ...deliveryAlerts(db, storeId), ...inventoryAlerts(db, storeId), ...staffAlerts(db, storeId), ...postAlerts(db, storeId)]
}

/** Alarme des HQ: offene Meldungen (Warenabgleich, Inventur-Differenzen, auffällige Abgänge, überfällige Inventuren) */
export function centralAlerts(db: Db): Alert[] {
  const today = todayISO()
  return openCases(db, today).filter((c) => c.status === 'offen').map((c) => ({
    key: `${today}|${c.id}`, level: c.level, title: `${db.stores.find((s) => s.id === c.storeId)?.name}: ${c.title}`, text: c.text, to: `/zentrale/fall/${c.storeId}/${c.kind}`, storeId: c.storeId,
  }))
}

let rebase = false
/** Nächste Auswertung nur als Ausgangslage merken (kein Toast), z. B. beim Start/Ende der Tour */
export const requestRebase = () => { rebase = true }
export const takeRebase = () => { const r = rebase; rebase = false; return r }

export const alertToastText = (a: Alert) => (a.articleId ? (a.level === 'red' ? `${a.title} – jetzt bestellen!` : `${a.title} – jetzt bestellen`) : a.title)
