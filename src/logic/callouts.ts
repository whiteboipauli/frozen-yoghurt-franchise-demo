import type { Callout, Db, Employee, Shift } from '../data/types'
import { addDays, diffDays, todayISO, WEEKDAYS, weekdayIdx } from '../lib/date'
import { fmtTime } from '../lib/format'
import { valueOn, maxMonthHours, netOf } from './hr'
import { candidatesForGap } from './staffplan'
import { dayStaffing } from './staffing'
import type { SigTask } from './signals'

/* ===== Krankmeldung / Ausfall ===== */
export const nowStamp = () => new Date().toISOString()
const hhmm = (h: number) => fmtTime(h).replace(':00', '').replace(/^0/, '')
export const range = (a: number, b: number) => `${hhmm(a)}–${hhmm(b)} Uhr`

/** Pure Änderung: Krankmeldung anlegen. Betroffene Schichten (ab heute) bekommen den Status „Ausfall“ (nicht gelöscht). */
export function reportSick(db: Db, p: { storeId: string; empId: string; from: string; to: string; eau: Callout['eau']; note: string; via: Callout['via']; id: string; at?: string }): Db {
  const hit = db.shifts.filter((s) => s.empId === p.empId && s.date >= p.from && s.date <= p.to && s.status !== 'ausfall')
  const callout: Callout = { id: p.id, storeId: p.storeId, empId: p.empId, reportedAt: p.at ?? nowStamp(), via: p.via, from: p.from, to: p.to, eau: p.eau, note: p.note, shiftIds: hit.map((s) => s.id), requests: [], covered: {}, left: [] }
  const ids = new Set(hit.map((s) => s.id))
  return {
    ...db,
    shifts: db.shifts.map((s) => (ids.has(s.id) ? { ...s, status: 'ausfall' as const, calloutId: p.id } : s)),
    absences: [...db.absences, { id: `kr-${p.id}`, empId: p.empId, from: p.from, to: p.to, type: 'Krank', note: p.note }],
    callouts: [...(db.callouts ?? []), callout],
  }
}
const upd = (db: Db, id: string, fn: (c: Callout) => Callout): Db => ({ ...db, callouts: (db.callouts ?? []).map((c) => (c.id === id ? fn(c) : c)) })

export const requestCover = (db: Db, calloutId: string, shiftId: string, empId: string, reqId: string, start?: number, end?: number): Db =>
  upd(db, calloutId, (c) => ({ ...c, requests: [...c.requests.filter((r) => !(r.shiftId === shiftId && r.empId === empId)), { id: reqId, shiftId, empId, status: 'angefragt', at: nowStamp(), start, end }] }))

/** Zusage: neue Schicht für die Person, der Ausfall ist für diese Schicht geschlossen. Absage: Anfrage wird abgesagt. */
export function answerCover(db: Db, calloutId: string, reqId: string, answer: 'zugesagt' | 'abgesagt', newId: string): Db {
  const c = (db.callouts ?? []).find((x) => x.id === calloutId)
  const req = c?.requests.find((r) => r.id === reqId)
  const orig = db.shifts.find((s) => s.id === req?.shiftId)
  if (!c || !req || !orig) return db
  if (answer === 'abgesagt') return upd(db, calloutId, (x) => ({ ...x, requests: x.requests.map((r) => (r.id === reqId ? { ...r, status: 'abgesagt' } : r)) }))
  const ns: Shift = { id: newId, storeId: orig.storeId, empId: req.empId, date: orig.date, start: req.start ?? orig.start, end: req.end ?? orig.end, locked: true, why: `Ersatz für ${db.employees.find((e) => e.id === orig.empId)?.name ?? 'Ausfall'} (zugesagt)` }
  const next = upd(db, calloutId, (x) => ({ ...x, requests: x.requests.map((r) => (r.id === reqId ? { ...r, status: 'zugesagt' } : r.shiftId === req.shiftId && r.status === 'angefragt' ? { ...r, status: 'abgesagt' } : r)), covered: { ...x.covered, [orig.id]: ns.id } }))
  return { ...next, shifts: [...next.shifts, ns] }
}
export const leaveOpen = (db: Db, calloutId: string, shiftId: string): Db => upd(db, calloutId, (c) => ({ ...c, left: [...new Set([...c.left, shiftId])] }))
export const setEau = (db: Db, calloutId: string, eau: Callout['eau']): Db => upd(db, calloutId, (c) => ({ ...c, eau }))

/** Schichten eines Ausfalls, die noch niemand übernommen hat (und nicht bewusst offen bleiben) und für die im Dienstplan wirklich noch eine Lücke besteht */
export function openShifts(db: Db, c: Callout, today = todayISO()): Shift[] {
  return c.shiftIds.map((id) => db.shifts.find((s) => s.id === id)).filter((s): s is Shift => !!s && s.date >= today && !c.covered[s.id] && !c.left.includes(s.id)
    && dayStaffing(db, s.storeId, s.date, today).gaps.some((g) => g.from < s.end && g.to > s.start)).sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start)
}
/** Grund einer Lücke: Krankmeldung(en), deren Ausfall-Schicht das Zeitfenster berührt – sonst nichts */
export function gapReason(db: Db, storeId: string, date: string, gap: { from: number; to: number }): string | null {
  const names = new Set<string>()
  for (const c of (db.callouts ?? []).filter((x) => x.storeId === storeId)) {
    for (const id of c.shiftIds) {
      const s = db.shifts.find((x) => x.id === id)
      if (s && s.date === date && s.status === 'ausfall' && !c.covered[s.id] && s.start < gap.to && s.end > gap.from) names.add(db.employees.find((e) => e.id === c.empId)?.name ?? 'Mitarbeiter/in')
    }
  }
  return names.size ? `Krankmeldung ${[...names].join(', ')}` : null
}
/** Offene Lücken, die durch eine Krankmeldung entstanden sind (je Zeitfenster eine) */
export interface SickGap { key: string; calloutId: string; empName: string; date: string; gap: { from: number; to: number; missing: number } }
export function sickGaps(db: Db, storeId: string, today = todayISO()): SickGap[] {
  const out: SickGap[] = []
  for (const c of calloutsOf(db, storeId)) {
    const name = db.employees.find((e) => e.id === c.empId)?.name ?? 'Mitarbeiter/in'
    for (const s of openShifts(db, c, today)) {
      for (const g of dayStaffing(db, storeId, s.date, today).gaps) {
        if (g.from < s.end && g.to > s.start && !out.some((o) => o.calloutId === c.id && o.date === s.date && o.gap.from === g.from)) out.push({ key: `${c.id}|${s.date}|${g.from}`, calloutId: c.id, empName: name, date: s.date, gap: g })
      }
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.gap.from - b.gap.from)
}
/** Krankmeldungen für heute (für das Login-Pop-up): mit Lückenfenster, offen/geschlossen und wer die Lücke geschlossen hat */
export interface SickToday { key: string; empName: string; date: string; from: number; to: number; missing: number; open: boolean; closedBy: string[] }
export function sickToday(db: Db, storeId: string, today = todayISO()): SickToday[] {
  const out: SickToday[] = []
  for (const c of calloutsOf(db, storeId)) {
    const sh = c.shiftIds.map((id) => db.shifts.find((s) => s.id === id)).filter((s): s is Shift => !!s && s.date === today && s.status === 'ausfall')
    if (!sh.length) continue
    const from = Math.min(...sh.map((s) => s.start)), to = Math.max(...sh.map((s) => s.end))
    const gap = sickGaps(db, storeId, today).find((k) => k.calloutId === c.id && k.date === today)
    const by = db.shifts.filter((s) => s.storeId === storeId && s.date === today && s.status !== 'ausfall' && s.why !== 'Demo-Dienstplan' && s.start < to && s.end > from).map((s) => db.employees.find((e) => e.id === s.empId)?.name).filter((n): n is string => !!n)
    out.push({ key: `${c.id}|${today}`, empName: db.employees.find((e) => e.id === c.empId)?.name ?? 'Mitarbeiter/in', date: today, from, to, missing: gap?.gap.missing ?? 1, open: !!gap, closedBy: [...new Set(by)] })
  }
  return out
}
/** „heute“ bzw. „am Di 10.11.“ */
export const dayWord = (date: string, today = todayISO()) => (date === today ? 'heute' : `am ${WEEKDAYS[weekdayIdx(date)].slice(0, 2)} ${date.slice(8, 10)}.${date.slice(5, 7)}.`)
export const missingWord = (n: number) => (n === 1 ? '1 Person' : `${n} Personen`)
export const calloutsOf = (db: Db, storeId: string) => (db.callouts ?? []).filter((c) => c.storeId === storeId)
export const isClosed = (db: Db, c: Callout, today = todayISO()) => openShifts(db, c, today).length === 0
/** Offene Ausfälle des Ladens (mit mindestens einer unbesetzten Schicht) */
export const openCallouts = (db: Db, storeId: string, today = todayISO()) => calloutsOf(db, storeId).filter((c) => !isClosed(db, c, today))
/** Ausfälle, die heute geschlossen wurden (für das grüne Signal) */
export const closedCallouts = (db: Db, storeId: string, today = todayISO()) => calloutsOf(db, storeId).filter((c) => isClosed(db, c, today) && c.shiftIds.length > 0)

/** Countdown „Schicht beginnt in 3 Std“ */
export function countdownText(s: Shift, now = new Date(), today = todayISO()): { text: string; level: 'rot' | 'bernstein' } {
  const d = diffDays(s.date, today)
  if (d > 0) return { text: d === 1 ? `Schicht beginnt morgen um ${hhmm(s.start)} Uhr` : `Schicht am ${WEEKDAYS[weekdayIdx(s.date)]}`, level: d === 1 ? 'rot' : 'bernstein' }
  const mins = Math.round(s.start * 60 - (now.getHours() * 60 + now.getMinutes()))
  if (mins <= 0) return { text: 'Schicht hat schon begonnen', level: 'rot' }
  const h = Math.floor(mins / 60), m = mins % 60
  return { text: h > 0 ? `Schicht beginnt in ${h} Std${m ? ` ${m} Min` : ''}` : `Schicht beginnt in ${m} Min`, level: 'rot' }
}

export function absenceTasks(db: Db, storeId: string, today: string): SigTask[] {
  const out: SigTask[] = []
  for (const c of openCallouts(db, storeId, today)) {
    const e = db.employees.find((x) => x.id === c.empId)
    const open = openShifts(db, c, today)
    const first = open[0]
    const near = diffDays(first.date, today) <= 1
    const cd = countdownText(first, new Date(), today)
    out.push({ key: `absence-${c.id}`, kind: 'absence', level: near ? 'rot' : 'bernstein', group: near ? 'jetzt' : 'woche', icon: 'person-ausfall', title: `Ausfall: ${e?.name ?? 'Mitarbeiter/in'}`, text: `${open.length === 1 ? '1 Schicht' : `${open.length} Schichten`} ohne Ersatz · ${first.date === today ? 'heute' : WEEKDAYS[weekdayIdx(first.date)]} ${range(first.start, first.end)}`, btn: 'Ersatz finden', to: 'heute', nav: 'team/dienstplan', n: open.length, time: { text: cd.text, level: cd.level }, modal: `callout:${c.id}` })
  }
  return out
}

/** Wer fällt an diesem Tag aus (Name), sonst null */
export function absentOn(db: Db, storeId: string, date: string): string | null {
  for (const c of calloutsOf(db, storeId)) {
    const s = c.shiftIds.map((id) => db.shifts.find((x) => x.id === id)).find((x) => x && x.date === date && !c.covered[x.id] && !c.left.includes(x.id))
    if (s) return db.employees.find((e) => e.id === c.empId)?.name.split(' ')[0] ?? 'Ausfall'
  }
  return null
}

/* ===== Ersatzvorschläge ===== */
export interface Suggestion { emp: Employee; start: number; end: number; hours: number; of: number; reason: string; warnings: string[]; full: boolean; rank: number }
const nf = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 })
const eur = (n: number) => `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(n)} €`

/** Rangliste: nur Leute, die können, nicht eingeplant sind, die Ruhezeit einhalten (Warnungen leer) und unter der Minijob-Grenze bleiben */
export function suggestionsFor(db: Db, shift: Shift, today = todayISO()): { ranked: Suggestion[]; warned: Suggestion[] } {
  const from = shift.start, to = shift.end
  const base = candidatesForGap(db, shift.storeId, shift.date, { from, to, missing: 1 }, today)
  const tag = diffDays(shift.date, today) === 0 ? 'heute' : WEEKDAYS[weekdayIdx(shift.date)]
  const all: Suggestion[] = base.map((c) => {
    const full = c.start <= from && c.end >= to
    const hours = Math.max(0, c.end - c.start)
    const limit = maxMonthHours(db.settings.hr, c.emp, shift.date) !== null ? valueOn(db.settings.hr.minijobLimit, shift.date) : null
    const reason = [`Frei ${tag}`, full ? 'ganze Schicht möglich' : `ab ${hhmm(c.start)} bis ${hhmm(c.end)} Uhr`, limit && !c.warnings.length ? `bleibt unter ${eur(limit)}` : c.warnings.length ? c.warnings[0] : `Stundenkonto: noch ${nf.format(c.openHours)} Std. offen`].join(' · ')
    return { emp: c.emp, start: c.start, end: c.end, hours, of: to - from, reason, warnings: c.warnings, full, rank: 0 }
  })
  const good = all.filter((s) => !s.warnings.length).sort((a, b) => Number(b.full) - Number(a.full) || b.hours - a.hours || a.emp.name.localeCompare(b.emp.name, 'de'))
  good.forEach((s, i) => (s.rank = i + 1))
  const warned = all.filter((s) => s.warnings.length).sort((a, b) => a.warnings.length - b.warnings.length)
  return { ranked: good, warned }
}
export const netHours = (db: Db, e: Employee, s: Shift) => netOf(db.settings.hr, e, s)
void addDays
