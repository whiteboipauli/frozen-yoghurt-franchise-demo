import type { Db, Employee, Shift } from '../data/types'
import { addDays, todayISO, weekdayIdx, WEEKDAYS_SHORT } from '../lib/date'
import { availWindow, gapText, hourAccount, isAbsent, netOf, validateShifts, weekCap, type Gap } from './hr'
import { openHours, storeOf } from './history'
import { dayStaffing, staffDay } from './staffing'
import { weekStart } from './weekly'

export type DayState = 'ok' | 'gap' | 'over' | 'closed'
export interface DayLine {
  date: string
  state: DayState
  /** einfache Sprache: „Alles besetzt“ / „Sa 15–19 Uhr: 2 Personen fehlen“ */
  text: string
  gaps: Gap[]
  missingHours: number
  overHours: number
}

/** Eine Zeile je Tag: eindeutiger Status in einfacher Sprache */
export function dayLine(db: Db, storeId: string, date: string, today = todayISO()): DayLine {
  const d = dayStaffing(db, storeId, date, today)
  if (d.gaps.length) {
    const shown = d.gaps.slice(0, 2).map((g) => gapText(date, g)).join(' · ')
    return { date, state: 'gap', text: shown + (d.gaps.length > 2 ? ` · +${d.gaps.length - 2} weitere` : ''), gaps: d.gaps, missingHours: d.missingHours, overHours: d.overHours }
  }
  if (d.overHours >= 3) return { date, state: 'over', text: `Alles besetzt, aber ${Math.round(d.overHours)} Personen-Stunden zu viel eingeplant`, gaps: [], missingHours: 0, overHours: d.overHours }
  return { date, state: 'ok', text: 'Alles besetzt', gaps: [], missingHours: 0, overHours: d.overHours }
}
/** Nächste Tage; Tage mit Lücke stehen ganz oben (nach Datum), danach die übrigen */
export function planLines(db: Db, storeId: string, days = 14, today = todayISO()): DayLine[] {
  const all = Array.from({ length: days }, (_, i) => dayLine(db, storeId, addDays(today, i), today))
  const rank: Record<DayState, number> = { gap: 0, over: 1, ok: 2, closed: 3 }
  return all.map((l, i) => ({ l, i })).sort((a, b) => rank[a.l.state] - rank[b.l.state] || a.i - b.i).map((x) => x.l)
}

export interface Candidate {
  emp: Employee
  /** vorgeschlagene Schicht innerhalb der Lücke */
  start: number
  end: number
  /** noch offene Stunden im Monat (Soll − gearbeitet/geplant) */
  openHours: number
  availText: string
  warnings: string[]
}
const first = (e: Employee) => e.name.split(' ')[0]
const key = (v: { kind: string; date: string; empId: string }) => `${v.empId}|${v.kind}|${v.kind === 'woche' ? weekStart(v.date) : v.kind === 'minijob' ? v.date.slice(0, 7) : v.date}`
const round05 = (n: number) => Math.round(n * 2) / 2

/** Warnungen, die durch eine zusätzliche Schicht neu entstehen würden */
export function warningsFor(db: Db, storeId: string, e: Employee, shift: Shift): string[] {
  const from = addDays(shift.date, -31), to = addDays(shift.date, 31)
  const before = new Set(validateShifts(db, storeId, from, to).filter((v) => v.empId === e.id).map(key))
  const after = validateShifts({ ...db, shifts: [...db.shifts, shift] }, storeId, from, to).filter((v) => v.empId === e.id && v.kind !== 'verfuegbar')
  const out: string[] = []
  const hr = db.settings.hr
  for (const v of after) {
    if (before.has(key(v))) continue
    if (v.kind === 'woche') {
      const wk = weekStart(shift.date)
      const total = [...db.shifts, shift].filter((s) => s.empId === e.id && s.date >= wk && s.date <= addDays(wk, 6)).reduce((a, s) => a + netOf(hr, e, s), 0)
      const over = Math.max(0.5, round05(total - weekCap(hr, e, shift.date)))
      out.push(`${first(e)} käme damit auf ${new Intl.NumberFormat('de-DE').format(over)} Überstunde${over === 1 ? '' : 'n'}`)
    } else if (v.kind === 'minijob') out.push(`${first(e)} würde die Minijob-Grenze überschreiten`)
    else if (v.kind === 'ruhezeit') out.push('Ruhezeit zu kurz')
    else if (v.kind === 'tag') out.push(`${first(e)} würde mehr als erlaubt an einem Tag arbeiten`)
    else if (v.kind === 'ueberlappung') out.push('überschneidet sich mit einer anderen Schicht')
  }
  return [...new Set(out)]
}

/** Passende Mitarbeitende für eine Lücke (laut Verfügbarkeit), Personen ohne Warnung zuerst */
export function candidatesForGap(db: Db, storeId: string, date: string, gap: Gap, today = todayISO()): Candidate[] {
  const st = storeOf(db, storeId)
  const { open, close } = openHours(st, date)
  const out: Candidate[] = []
  for (const e of db.employees.filter((x) => x.storeId === storeId && x.active)) {
    if (isAbsent(db.absences, e.id, date)) continue
    let w = availWindow(db.availability.find((a) => a.empId === e.id && a.date === date), open, close)
    if (w && e.under18) w = [w[0], Math.min(w[1], db.settings.hr.under18.latestEnd)]
    if (!w) continue
    const start = Math.max(gap.from, w[0]), end = Math.min(gap.to, w[1])
    if (end - start < 1) continue
    if (db.shifts.some((s) => s.empId === e.id && s.date === date && s.start < end && s.end > start)) continue
    const acc = hourAccount(db, e, today)
    const load = acc.gearbeitet + db.shifts.filter((s) => s.empId === e.id && s.date >= today && s.date.slice(0, 7) === today.slice(0, 7)).reduce((a, s) => a + netOf(db.settings.hr, e, s), 0)
    const shift: Shift = { id: 'tmp', storeId, empId: e.id, date, start, end, locked: true, why: '' }
    out.push({ emp: e, start, end, openHours: Math.max(0, e.targetHours - load), availText: `${w[0]}–${w[1]} Uhr`, warnings: warningsFor(db, storeId, e, shift) })
  }
  return out.sort((a, b) => Number(a.warnings.length > 0) - Number(b.warnings.length > 0) || b.openHours - a.openHours || a.emp.name.localeCompare(b.emp.name, 'de'))
}
export const dayOfWeekShort = (d: string) => WEEKDAYS_SHORT[weekdayIdx(d)]
void staffDay
