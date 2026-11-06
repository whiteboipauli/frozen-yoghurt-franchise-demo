import type { Db, Employee, Shift } from '../data/types'
import { addDays, todayISO, WEEKDAYS, weekdayIdx } from '../lib/date'
import { fmtTime } from '../lib/format'
import type { Gap } from './hr'
import { candidatesForGap, type Candidate } from './staffplan'
import { availWindow, isAbsent, netOf, weekCap } from './hr'
import { openHours, storeOf } from './history'
import { weekStart } from './weekly'
import { dayStaffing, staffDay } from './staffing'
import { holidayOn } from './history'
import { rainClass } from './weather'

/** Eine vorgeschlagene Schicht innerhalb einer Lücke – mit Begründung in einfacher Sprache */
export interface Assignment {
  emp: Employee
  start: number
  end: number
  reason: string
  openHours: number
  warnings: string[]
}
export interface GapPlan {
  date: string
  gap: Gap
  /** Warum wird hier jemand gebraucht? Ein Satz. */
  why: string
  /** Vorschlag des Systems – ein Eintrag = volle Abdeckung, mehrere = Aufteilung */
  picks: Assignment[]
  split: boolean
  /** Zeiten, für die niemand ohne Warnung verfügbar ist */
  uncovered: { from: number; to: number }[]
  /** bis zu zwei weitere Personen ohne Warnung */
  alternatives: Assignment[]
  /** Personen mit Warnung (Überstunden, Minijob-Grenze, Ruhezeit …) – nur mit Bestätigung */
  warned: Assignment[]
  /** „Niemand verfügbar“ – dann steht hier ein Tipp */
  tip?: string
}

const nf = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 })
const first = (e: Employee) => e.name.split(' ')[0]
const range = (a: number, b: number) => `${fmtTime(a).replace(':00', '')}–${fmtTime(b).replace(':00', '')} Uhr`.replace(/\b0(\d)/g, '$1')
export const timeRange = range

/** „Samstag 26 °C und Sonne – 3 Personen nötig, 2 eingeplant“ */
export function gapWhy(db: Db, storeId: string, date: string, gap: Gap, today = todayISO(), shifts?: Shift[]): string {
  const sd = staffDay(db, storeId, date, today)
  const ds = dayStaffing(db, storeId, date, today, shifts)
  const need = ds.need[gap.from] ?? gap.missing
  const planned = Math.max(0, need - gap.missing)
  const parts: string[] = [WEEKDAYS[weekdayIdx(date)]]
  const w = sd.wx
  if (w) parts.push(`${Math.round(w.tmax)} °C${rainClass(w.rain) === 'trocken' && w.sun >= 6 ? ' und Sonne' : rainClass(w.rain) === 'stark' ? ' und Regen' : ''}`)
  const hol = holidayOn(db, storeId, date)
  let head = parts.join(' ')
  if (hol) head += `, ${hol.name}`
  else if (sd.ferien) head += ', Schulferien'
  else if (!w && weekdayIdx(date) >= 5) head += ' (Wochenende)'
  return `${head} – ${need} ${need === 1 ? 'Person' : 'Personen'} nötig, ${planned} eingeplant`
}

const monthWeekends = (db: Db, empId: string, date: string) =>
  db.shifts.filter((s) => s.empId === empId && s.date.slice(0, 7) === date.slice(0, 7) && weekdayIdx(s.date) >= 5).length

function reasonOf(c: Candidate): string {
  const e = c.emp
  const worked = Math.max(0, e.targetHours - c.openHours)
  const hours = e.targetHours > 0 ? `hat diesen Monat erst ${nf.format(Math.round(worked))} von ${nf.format(e.targetHours)} Stunden` : 'hat noch Stunden frei'
  return c.warnings.length ? `${first(e)}: verfügbar ${c.availText}, aber ${c.warnings[0]}` : `${first(e)}: verfügbar ${c.availText}, ${hours} – passt ohne Überstunden`
}
const asAssign = (c: Candidate): Assignment => ({ emp: c.emp, start: c.start, end: c.end, reason: reasonOf(c), openHours: c.openHours, warnings: c.warnings })

/** Rangfolge: verfügbar (schon gefiltert) → keine Warnung → größte offene Stundenzahl → faire Wochenenden → Schichtleitung */
export function rankCandidates(db: Db, date: string, list: Candidate[], needLead: boolean): Candidate[] {
  const weekend = weekdayIdx(date) >= 5
  const lead = (c: Candidate) => (needLead && c.emp.quals.includes('Schichtleitung') ? 0 : 1)
  return [...list].sort((a, b) =>
    Number(a.warnings.length > 0) - Number(b.warnings.length > 0)
    || b.openHours - a.openHours
    || (weekend ? monthWeekends(db, a.emp.id, date) - monthWeekends(db, b.emp.id, date) : 0)
    || lead(a) - lead(b)
    || a.emp.name.localeCompare(b.emp.name, 'de'))
}

/** Vorschlag für eine Lücke: beste Person, sonst Aufteilung auf mehrere, sonst „Niemand verfügbar“ */
export function planGap(base: Db, storeId: string, date: string, gap: Gap, today = todayISO(), extra: Shift[] = []): GapPlan {
  const db: Db = extra.length ? { ...base, shifts: [...base.shifts, ...extra] } : base
  const why = gapWhy(base, storeId, date, gap, today, db.shifts)
  const hasLead = (w: Db, from: number, to: number) => w.shifts.some((s) => s.storeId === storeId && s.date === date && s.start < to && s.end > from && w.employees.find((e) => e.id === s.empId)?.quals.includes('Schichtleitung'))
  const picks: Assignment[] = []
  const uncovered: { from: number; to: number }[] = []
  let w = db
  for (let layer = 0; layer < Math.min(3, gap.missing); layer++) {
    let cursor = gap.from
    while (cursor < gap.to - 1e-9) {
      const cands = candidatesForGap(w, storeId, date, { from: cursor, to: gap.to, missing: 1 }, today).filter((c) => c.warnings.length === 0)
      const ranked = rankCandidates(w, date, cands.filter((c) => c.start <= cursor + 1e-9), !hasLead(w, gap.from, gap.to))
      const full = ranked.find((c) => c.end >= gap.to - 1e-9)
      const best = full ?? [...ranked].sort((a, b) => b.end - a.end)[0]
      if (!best) {
        // niemand ab „cursor“: nächste Möglichkeit suchen
        const later = cands.filter((c) => c.start > cursor).map((c) => c.start)
        const next = later.length ? Math.min(...later) : gap.to
        uncovered.push({ from: cursor, to: next })
        cursor = next
        continue
      }
      picks.push(asAssign(best))
      const shift: Shift = { id: `tmp-${picks.length}`, storeId, empId: best.emp.id, date, start: best.start, end: best.end, locked: false, why: '' }
      w = { ...w, shifts: [...w.shifts, shift] }
      cursor = best.end
    }
  }
  const all = candidatesForGap(db, storeId, date, gap, today)
  const taken = new Set(picks.map((p) => p.emp.id))
  const alternatives = rankCandidates(db, date, all.filter((c) => c.warnings.length === 0 && !taken.has(c.emp.id)), false).slice(0, 2).map(asAssign)
  const warned = all.filter((c) => c.warnings.length > 0).sort((a, b) => a.warnings.length - b.warnings.length || b.openHours - a.openHours).map(asAssign)
  const plan: GapPlan = { date, gap, why, picks: picks.sort((a, b) => a.start - b.start), split: picks.some((p) => picks.some((q) => q.emp.id !== p.emp.id && q.start === p.end)), uncovered, alternatives, warned }
  if (!picks.length || uncovered.length) plan.tip = 'Tipp: Frag bei deinem Team direkt nach oder verschiebe eine Schicht von einem überbesetzten Tag.'
  return plan
}

export const newShiftId = () => `sh${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
/** Aus dem Vorschlag echte Schichten machen */
export function shiftsOf(storeId: string, date: string, picks: Assignment[], note = 'Vorschlag übernommen'): Shift[] {
  return picks.map((p) => ({ id: newShiftId(), storeId, empId: p.emp.id, date, start: p.start, end: p.end, locked: true, why: `${note}: ${p.reason}` }))
}

/** Stunden einer Person in der Woche des Datums (ohne Ausfälle) */
export const weekHours = (db: Db, e: Employee, date: string) => {
  const wk = weekStart(date)
  return db.shifts.filter((s) => s.empId === e.id && s.date >= wk && s.date <= addDays(wk, 6) && s.status !== 'ausfall').reduce((a, s) => a + netOf(db.settings.hr, e, s), 0)
}

/** Einfacher Vorschlag für eine Lücke: nur Personen, die die ganze Lücke wirklich übernehmen können (verfügbar, nicht krank, nicht schon in der Schicht, Ruhezeit, Wochenstunden ok), die beste zuerst */
export function suggestFor(base: Db, storeId: string, date: string, gap: Gap, today = todayISO(), extra: Shift[] = []): Assignment[] {
  const db: Db = extra.length ? { ...base, shifts: [...base.shifts, ...extra] } : base
  const cands = candidatesForGap(db, storeId, date, { from: gap.from, to: gap.to, missing: 1 }, today)
    .filter((c) => !c.warnings.length && c.start <= gap.from + 1e-9 && c.end >= gap.to - 1e-9)
  return rankCandidates(db, date, cands, false).map((c) => ({
    emp: c.emp, start: gap.from, end: gap.to, openHours: c.openHours, warnings: [],
    reason: `${nf.format(Math.round(weekHours(db, c.emp, date) * 10) / 10)} Std. diese Woche`,
  }))
}

export interface AutoFill {
  shifts: Shift[]
  /** je vorgeschlagener Schicht: Tag, Person, Begründung */
  items: { shift: Shift; emp: Employee; reason: string }[]
  /** Lücken, für die sich nichts vorschlagen ließ */
  unresolved: { date: string; gap: Gap }[]
}
/** „Alle Lücken automatisch füllen“: jede Lücke mit dem besten Vorschlag (dieselben Regeln wie im Einzel-Pop-up), Tag für Tag */
export function planAllGaps(db: Db, storeId: string, dates: string[], today = todayISO()): AutoFill {
  let extra: Shift[] = []
  const out: AutoFill = { shifts: [], items: [], unresolved: [] }
  for (const date of [...dates].sort()) {
    if (date < today) continue
    for (let guard = 0; guard < 12; guard++) {
      const gaps = dayStaffing(db, storeId, date, today, [...db.shifts, ...extra]).gaps
      const g = gaps.find((x) => !out.unresolved.some((u) => u.date === date && u.gap.from === x.from && u.gap.to === x.to))
      if (!g) break
      const pick = suggestFor(db, storeId, date, g, today, extra)[0]
      if (!pick) { out.unresolved.push({ date, gap: g }); continue }
      const made = shiftsOf(storeId, date, [pick], 'Automatisch zugeteilt')
      made.forEach((sh) => { out.shifts.push(sh); out.items.push({ shift: sh, emp: pick.emp, reason: pick.reason }) })
      extra = [...extra, ...made]
    }
  }
  return out
}
void addDays

/** Auswahl im Pop-up „Lücke schließen“: nicht wählbar nur bei Überschneidung, Krankheit/Abwesenheit oder freiem Tag; alles andere ist wählbar (mit Hinweisen in Worten) */
export interface GapChoice { emp: Employee; ok: boolean; blocked?: string; hints: string[]; weekH: number }
export function gapChoices(db: Db, storeId: string, date: string, gap: Gap, today = todayISO()): GapChoice[] {
  const { open, close } = openHours(storeOf(db, storeId), date)
  const hr = (a: number, b: number) => `${fmtTime(a).replace(':00', '').replace(/^0/, '')}–${fmtTime(b).replace(':00', '').replace(/^0/, '')}`
  return db.employees.filter((e) => e.storeId === storeId && e.active).map((e) => {
    const mine = db.shifts.filter((s) => s.empId === e.id && s.date === date && s.status !== 'ausfall')
    const clash = mine.find((s) => s.start < gap.to && s.end > gap.from)
    const abs = isAbsent(db.absences, e.id, date)
    const w = abs ? null : availWindow(db.availability.find((a) => a.empId === e.id && a.date === date), open, close)
    const weekH = weekHours(db, e, date)
    const hints: string[] = []
    let blocked: string | undefined
    if (abs) blocked = abs.type === 'Krank' ? 'krank' : 'frei'
    else if (clash) blocked = `schon eingeplant ${hr(clash.start, clash.end)}`
    else if (!w) blocked = 'an dem Tag frei'
    else {
      const other = mine.filter((s) => !(s.start < gap.to && s.end > gap.from))
      if (other.length) hints.push(`hat Schicht ${other.map((s) => hr(s.start, s.end)).join(', ')}`)
      if (w[0] > gap.from || w[1] < gap.to) hints.push(`laut Verfügbarkeit nur ${hr(w[0], w[1])} Uhr`)
      if (weekH + (gap.to - gap.from) > weekCap(db.settings.hr, e, date) + 1e-9) hints.push('schon viele Stunden diese Woche')
    }
    return { emp: e, ok: !blocked, blocked, hints, weekH }
  })
}
