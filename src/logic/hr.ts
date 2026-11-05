import type { Absence, Availability, ContractType, DatedValue, Db, Employee, HrSettings, Shift } from '../data/types'
import { addDays, diffDays, parseISO, todayISO, weekdayIdx, WEEKDAYS_SHORT } from '../lib/date'

/* ================= Regeln und Grenzwerte ================= */
export const valueOn = (list: DatedValue[], date: string): number => {
  let v = list[0]?.value ?? 0
  for (const x of [...list].sort((a, b) => a.from.localeCompare(b.from))) if (x.from <= date) v = x.value
  return v
}
export const contractOf = (hr: HrSettings, e: Employee): ContractType | undefined => hr.contracts.find((c) => c.id === e.contractId)
export const isSemesterBreak = (hr: HrSettings, date: string) => hr.semesterBreaks.some((b) => date >= b.from && date <= b.to)

/** Minijob: höchstmögliche Stunden im Monat aus der Verdienstgrenze und dem Stundenlohn; sonst null */
export function maxMonthHours(hr: HrSettings, e: Employee, date: string): number | null {
  const c = contractOf(hr, e)
  if (c?.kind !== 'minijob' || e.wage <= 0) return null
  return Math.floor((valueOn(hr.minijobLimit, date) / e.wage) * 10) / 10
}
/** Höchststunden pro Woche (Vertrag, Werkstudent-Regel, unter 18) */
export function weekCap(hr: HrSettings, e: Employee, date: string): number {
  let cap = e.maxWeekHours
  const c = contractOf(hr, e)
  if (c?.kind === 'werkstudent') cap = Math.min(cap, isSemesterBreak(hr, date) ? (c.weekHoursBreak ?? 40) : (c.weekHoursTerm ?? 20))
  if (e.under18) cap = Math.min(cap, hr.under18.maxWeekHours)
  return cap
}
export const dayCap = (hr: HrSettings, e: Employee) => (e.under18 ? Math.min(hr.under18.maxDayHours, hr.maxDayHours) : hr.maxDayHours)
export const restNeeded = (hr: HrSettings, e: Employee) => (e.under18 ? Math.max(hr.under18.restHours, hr.restHours) : hr.restHours)
/** Pause in Stunden bei einer Schichtlänge */
export function pauseFor(hr: HrSettings, e: Pick<Employee, 'under18'>, len: number): number {
  if (e.under18) return len > hr.under18.break60After ? 1 : len > hr.under18.break30After ? 0.5 : 0
  return len > 9 ? 0.75 : len > hr.break30After ? 0.5 : 0
}
export const netOf = (hr: HrSettings, e: Pick<Employee, 'under18'>, s: Pick<Shift, 'start' | 'end'>) => {
  const len = s.end - s.start
  return Math.max(0, len - pauseFor(hr, e, len))
}

/* ================= Verfügbarkeit ================= */
export const AFTERNOON_FROM = 15
export function availWindow(av: Availability | undefined, open: number, close: number): [number, number] | null {
  if (!av) return null
  switch (av.kind) {
    case 'ganztags': return [open, close]
    case 'vormittags': return [open, Math.min(close, AFTERNOON_FROM)]
    case 'nachmittags': return [Math.max(open, AFTERNOON_FROM), close]
    case 'frei': {
      const from = Math.max(open, av.from ?? open), to = Math.min(close, av.to ?? close)
      return to > from ? [from, to] : null
    }
    default: return null
  }
}
export const isAbsent = (absences: Absence[], empId: string, date: string) => absences.find((a) => a.empId === empId && date >= a.from && date <= a.to)

/* ================= Bedarf und Abdeckung ================= */
export type Need = Record<number, number>
export function coverage(shifts: Pick<Shift, 'start' | 'end'>[], open: number, close: number): number[] {
  const out: number[] = []
  for (let h = open; h < close; h++) out.push(shifts.filter((s) => s.start <= h && s.end > h).length)
  return out
}
export type CellState = 'ok' | 'gap' | 'over'
export interface Gap { from: number; to: number; missing: number }
/** Zusammenhängende Lücken (gleiche Fehlzahl) */
export function gapsOf(need: Need, cov: number[], open: number): Gap[] {
  const gaps: Gap[] = []
  cov.forEach((c, i) => {
    const h = open + i
    const miss = (need[h] ?? 0) - c
    if (miss <= 0) return
    const last = gaps[gaps.length - 1]
    if (last && last.to === h && last.missing === miss) last.to = h + 1
    else gaps.push({ from: h, to: h + 1, missing: miss })
  })
  return gaps
}
export const gapText = (date: string, g: Gap) => `${WEEKDAYS_SHORT[weekdayIdx(date)]} ${g.from}–${g.to} Uhr: ${g.missing === 1 ? '1 Person fehlt' : `${g.missing} Personen fehlen`}`
export const cellState = (need: number, c: number): CellState => (c < need ? 'gap' : c > need ? 'over' : 'ok')

/* ================= Planer ================= */
export interface PlanCtx {
  hr: HrSettings
  storeId: string
  employees: Employee[]
  open: (date: string) => { open: number; close: number }
  /** Zeitfenster, in dem die Person an diesem Tag kann (inkl. Abwesenheit); null = nicht verfügbar */
  avail: (e: Employee, date: string) => [number, number] | null
  /** Bedarf je Stunde */
  need: (date: string) => Need
  /** bereits feststehende Schichten (gesperrte im Planungszeitraum, alles außerhalb) */
  fixed: Shift[]
  /** Id-Generator (deterministisch für Demodaten) */
  newId: () => string
}

/** Zähler für Stunden je Woche/Monat, Wochenenden und Ruhezeiten */
class Ledger {
  byEmp = new Map<string, Map<string, Shift[]>>()
  month = new Map<string, number>()
  week = new Map<string, number>()
  weekend = new Map<string, number>()
  all: Shift[] = []
  constructor(private hr: HrSettings, private emps: Map<string, Employee>) {}
  weekKey(id: string, date: string) { return `${id}|${addDays(date, -weekdayIdx(date))}` }
  add(s: Shift) {
    const e = this.emps.get(s.empId)
    if (!e) return
    this.all.push(s)
    let m = this.byEmp.get(s.empId)
    if (!m) this.byEmp.set(s.empId, (m = new Map()))
    m.set(s.date, [...(m.get(s.date) ?? []), s])
    const n = netOf(this.hr, e, s)
    this.month.set(`${s.empId}|${s.date.slice(0, 7)}`, (this.month.get(`${s.empId}|${s.date.slice(0, 7)}`) ?? 0) + n)
    const wk = this.weekKey(s.empId, s.date)
    this.week.set(wk, (this.week.get(wk) ?? 0) + n)
    if (weekdayIdx(s.date) >= 5) this.weekend.set(s.empId, (this.weekend.get(s.empId) ?? 0) + 1)
  }
  monthHours(id: string, date: string) { return this.month.get(`${id}|${date.slice(0, 7)}`) ?? 0 }
  weekHours(id: string, date: string) { return this.week.get(this.weekKey(id, date)) ?? 0 }
  onDay(id: string, date: string) { return this.byEmp.get(id)?.get(date) ?? [] }
  restOk(id: string, date: string, start: number, end: number, rest: number) {
    for (const s of this.onDay(id, addDays(date, -1))) if (24 + start - s.end < rest) return false
    for (const s of this.onDay(id, addDays(date, 1))) if (24 + s.start - end < rest) return false
    return true
  }
}

export interface PlanOut {
  shifts: Shift[]
}

interface Block { start: number; end: number; layer: number }

/** Bedarfskurve → zusammenhängende Schichtblöcke innerhalb Mindest- und Höchstlänge */
export function blocksFromNeed(need: Need, cov: number[], open: number, close: number, minLen: number, maxLen: number): Block[] {
  const resid = cov.map((c, i) => Math.max(0, (need[open + i] ?? 0) - c))
  const top = Math.max(0, ...resid)
  const out: Block[] = []
  for (let k = 1; k <= top; k++) {
    let i = 0
    while (i < resid.length) {
      if (resid[i] < k) { i++; continue }
      let j = i
      while (j < resid.length && resid[j] >= k) j++
      let a = open + i, b = open + j
      if (b - a < minLen) {
        // verlängern, ohne die Öffnungszeiten zu verlassen
        let guard = 0
        while (b - a < minLen && guard++ < 24) {
          if (b < close) b++
          else if (a > open) a--
          else break
        }
      }
      const L = b - a
      if (L > maxLen) {
        const parts = Math.ceil(L / maxLen)
        if (parts === 2) {
          // versetzte Schichten mit kurzer Überlappung zur Übergabe (z. B. Früh 10–16, Spät 14–20)
          const len = Math.min(maxLen, Math.ceil(L * 0.6))
          out.push({ start: a, end: a + len, layer: k }, { start: b - len, end: b, layer: k })
          i = j
          continue
        }
        let cur = a
        for (let p = 0; p < parts; p++) {
          const len = Math.floor(L / parts) + (p < L % parts ? 1 : 0)
          out.push({ start: cur, end: cur + len, layer: k })
          cur += len
        }
      } else out.push({ start: a, end: b, layer: k })
      i = j
    }
  }
  return out.sort((x, y) => x.layer - y.layer || x.start - y.start)
}

/**
 * Dienstplan für die Tage `dates` (chronologisch). Berücksichtigt Verfügbarkeit, Höchststunden, Minijob-Grenze,
 * Ruhezeit, Vorrang offener Stunden, Schichtleitung und faire Wochenenden. Gibt nur NEUE Schichten zurück.
 */
export function planRange(ctx: PlanCtx, dates: string[]): PlanOut {
  const { hr } = ctx
  const emps = new Map(ctx.employees.map((e) => [e.id, e]))
  const led = new Ledger(hr, emps)
  for (const s of ctx.fixed) led.add(s)
  const created: Shift[] = []

  for (const date of dates) {
    const { open, close } = ctx.open(date)
    const need = ctx.need(date)
    const today = led.all.filter((s) => s.date === date && s.storeId === ctx.storeId)
    const cov = coverage(today, open, close)
    const queue = blocksFromNeed(need, cov, open, close, hr.minShift, hr.maxShift).map((b) => ({ ...b, leader: b.layer === 1 }))
    const weekend = weekdayIdx(date) >= 5
    let guard = 0
    while (queue.length && guard++ < 80) {
      const b = queue.shift()!
      type Cand = { e: Employee; s: number; en: number; net: number; tierA: boolean; remaining: number; score: number }
      const cands: Cand[] = []
      for (const e of ctx.employees) {
        if (!e.active || led.onDay(e.id, date).length) continue
        const w = ctx.avail(e, date)
        if (!w) continue
        const s0 = Math.max(b.start, w[0]), e0 = Math.min(b.end, w[1])
        if (e0 - s0 <= 0) continue
        const minLen = Math.min(hr.minShift, b.end - b.start)
        const capWeek = weekCap(hr, e, date) - led.weekHours(e.id, date)
        const mm = maxMonthHours(hr, e, date)
        const capMonth = mm === null ? Infinity : mm - led.monthHours(e.id, date)
        const cap = Math.min(dayCap(hr, e), capWeek, capMonth)
        let L = Math.min(e0 - s0, hr.maxShift)
        while (L > 0 && L - pauseFor(hr, e, L) > cap + 1e-9) L--
        if (L < minLen || L <= 0) continue
        if (!led.restOk(e.id, date, s0, s0 + L, restNeeded(hr, e))) continue
        const net = L - pauseFor(hr, e, L)
        const remaining = e.targetHours - led.monthHours(e.id, date)
        const tierA = remaining - net >= -0.01
        const score = weekend ? remaining - 4 * (led.weekend.get(e.id) ?? 0) : remaining
        cands.push({ e, s: s0, en: s0 + L, net, tierA, remaining, score })
      }
      if (!cands.length) continue // Lücke bleibt bestehen
      let pool = cands
      let noLeader = false
      if (b.leader) {
        const lead = cands.filter((c) => c.e.quals.includes('Schichtleitung'))
        if (lead.length) pool = lead
        else noLeader = true
      }
      pool.sort((x, y) => Number(y.tierA) - Number(x.tierA) || (y.en - y.s) - (x.en - x.s) || y.score - x.score || x.e.name.localeCompare(y.e.name))
      const c = pool[0]
      const first = c.e.name.split(' ')[0]
      const why = `${first}: verfügbar, ${c.remaining > 0 ? `noch ${fmtH(c.remaining)} Stunden offen` : `Soll erreicht (${fmtH(-c.remaining)} Std. darüber)`}${b.leader && !noLeader && c.e.quals.includes('Schichtleitung') ? ', Schichtleitung' : ''}${noLeader ? ', keine Schichtleitung verfügbar' : ''}${weekend ? `, ${led.weekend.get(c.e.id) ?? 0} Wochenenddienste bisher` : ''}`
      const sh: Shift = { id: ctx.newId(), storeId: ctx.storeId, empId: c.e.id, date, start: c.s, end: c.en, locked: false, why }
      led.add(sh)
      created.push(sh)
      // Reste des Blocks erneut verteilen
      if (c.s > b.start) queue.push({ start: b.start, end: c.s, layer: b.layer, leader: b.leader })
      if (c.en < b.end) queue.push({ start: c.en, end: b.end, layer: b.layer, leader: b.leader })
      queue.sort((x, y) => x.layer - y.layer || x.start - y.start)
    }
  }
  return { shifts: created }
}
const nf1h = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 })
const fmtH = (n: number) => nf1h.format(n)

/* ================= Prüfung (Warnungen) ================= */
export interface Violation {
  empId: string
  date: string
  kind: 'woche' | 'tag' | 'minijob' | 'ruhezeit' | 'ueberlappung' | 'verfuegbar' | 'mindestlohn'
  text: string
}
export function validateShifts(db: Db, storeId: string, from: string, to: string): Violation[] {
  const hr = db.settings.hr
  const out: Violation[] = []
  const emps = new Map(db.employees.filter((e) => e.storeId === storeId).map((e) => [e.id, e]))
  const mine = db.shifts.filter((s) => s.storeId === storeId && emps.has(s.empId))
  const by = new Map<string, Shift[]>()
  for (const s of mine) by.set(s.empId, [...(by.get(s.empId) ?? []), s])
  for (const [id, list] of by) {
    const e = emps.get(id)!
    list.sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start)
    const weeks = new Map<string, number>(), months = new Map<string, number>()
    for (const s of list) {
      const n = netOf(hr, e, s)
      const wk = addDays(s.date, -weekdayIdx(s.date))
      weeks.set(wk, (weeks.get(wk) ?? 0) + n)
      months.set(s.date.slice(0, 7), (months.get(s.date.slice(0, 7)) ?? 0) + n)
    }
    list.forEach((s, i) => {
      if (s.date < from || s.date > to) return
      const n = netOf(hr, e, s)
      const first = e.name.split(' ')[0]
      if (n > dayCap(hr, e) + 1e-9) out.push({ empId: id, date: s.date, kind: 'tag', text: `${first}: mehr als ${dayCap(hr, e)} Stunden an einem Tag` })
      const wk = addDays(s.date, -weekdayIdx(s.date))
      if ((weeks.get(wk) ?? 0) > weekCap(hr, e, s.date) + 1e-9 && !out.some((v) => v.empId === id && v.kind === 'woche' && v.date >= wk && v.date <= addDays(wk, 6)))
        out.push({ empId: id, date: s.date, kind: 'woche', text: `${first}: Höchststunden pro Woche überschritten (${fmtH(weeks.get(wk)!)} von ${fmtH(weekCap(hr, e, s.date))})` })
      const mm = maxMonthHours(hr, e, s.date)
      if (mm !== null && (months.get(s.date.slice(0, 7)) ?? 0) > mm + 1e-9 && !out.some((v) => v.empId === id && v.kind === 'minijob' && v.date.slice(0, 7) === s.date.slice(0, 7)))
        out.push({ empId: id, date: s.date, kind: 'minijob', text: `${first}: Minijob-Grenze würde überschritten (${fmtH(months.get(s.date.slice(0, 7))!)} von ${fmtH(mm)} Std.)` })
      const prev = list[i - 1]
      if (prev) {
        const gap = diffDays(s.date, prev.date) * 24 + s.start - prev.end
        if (prev.date === s.date && s.start < prev.end) out.push({ empId: id, date: s.date, kind: 'ueberlappung', text: `${first}: zwei Schichten überlappen sich` })
        else if (gap < restNeeded(hr, e)) out.push({ empId: id, date: s.date, kind: 'ruhezeit', text: `${first}: weniger als ${restNeeded(hr, e)} Stunden Ruhezeit` })
      }
    })
  }
  return out
}

/** Mindestlohn-Warnung */
export const belowMinWage = (hr: HrSettings, e: Employee, date = todayISO()) => e.wage > 0 && e.wage < valueOn(hr.minWage, date) - 1e-9

/* ================= Stundenkonto ================= */
export interface HourAccount {
  soll: number
  geplant: number
  gearbeitet: number
  /** gearbeitet − anteiliges Soll bis gestern (Plus-/Minusstunden bisher) */
  saldo: number
  kumuliert: number
  maxMonth: number | null
  flag: 'ok' | 'ueber' | 'minus' | 'grenze'
}
/** Demo: kleine, deterministische Abweichung gearbeitet vs. geplant (Viertelstunden) */
export function demoDeviation(s: Shift): number {
  let h = 7
  for (const ch of s.id + s.date) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return (((h % 7) - 2) * 0.25) // −0,5 … +1,0 h in Viertelstunden
}
export const workedOf = (hr: HrSettings, e: Employee, s: Shift) => Math.max(0, netOf(hr, e, s) + demoDeviation(s))

export function hourAccount(db: Db, e: Employee, today = todayISO()): HourAccount {
  const hr = db.settings.hr
  const mine = db.shifts.filter((s) => s.empId === e.id)
  const ym = today.slice(0, 7)
  let geplantFuture = 0, gearbeitet = 0, geplantMonth = 0, lastPlanned = today
  const months = new Map<string, number>()
  for (const s of mine) {
    const n = netOf(hr, e, s)
    const m = s.date.slice(0, 7)
    if (s.date < today) {
      const w = workedOf(hr, e, s)
      months.set(m, (months.get(m) ?? 0) + w)
      if (m === ym) gearbeitet += w
    }
    if (m === ym) { geplantMonth += n; if (s.date >= today) { geplantFuture += n; if (s.date > lastPlanned) lastPlanned = s.date } }
  }
  const dim = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate()
  // anteiliges Soll bis gestern: Plus-/Minusstunden bisher
  const elapsed = Number(today.slice(8, 10)) - 1
  const saldo = gearbeitet - e.targetHours * (elapsed / dim)
  let kum = 0
  for (const [m, w] of months) if (m < ym) kum += w - e.targetHours
  const mm = maxMonthHours(hr, e, today)
  const total = gearbeitet + geplantFuture
  // Abdeckung des Monats durch Ist + Plan → erwarteter Stand
  const covered = Math.min(dim, Number(lastPlanned.slice(8, 10)))
  const expected = e.targetHours * (covered / dim)
  let flag: HourAccount['flag'] = 'ok'
  if (mm !== null && total >= mm * 0.9) flag = 'grenze'
  else if (total > Math.max(e.targetHours + 2, expected + 8)) flag = 'ueber'
  else if (total < expected - 8) flag = 'minus'
  return { soll: e.targetHours, geplant: geplantMonth, gearbeitet, saldo, kumuliert: kum + saldo, maxMonth: mm, flag }
}
void parseISO

/** Stunden im Monat (gearbeitet + noch geplant) – dieselbe Rechnung wie auf der Seite „Mitarbeitende“ */
export function monthHours(db: Db, e: Employee, today = todayISO()): number {
  const a = hourAccount(db, e, today)
  const ym = today.slice(0, 7)
  let past = 0
  for (const sh of db.shifts) if (sh.empId === e.id && sh.date < today && sh.date.slice(0, 7) === ym) past += Math.max(0, sh.end - sh.start - (sh.end - sh.start > 9 ? 0.75 : sh.end - sh.start > 6 ? 0.5 : 0))
  return a.gearbeitet + (a.geplant - past)
}
