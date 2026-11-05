import type { Absence, Availability, ContractType, Db, Employee, HrSettings, Shift, Store } from './types'
import { addDays, range, todayISO, weekdayIdx, diffDays } from '../lib/date'
import { availWindow, isAbsent, maxMonthHours, netOf, planRange } from '../logic/hr'
import { hourlyOf, openHours } from '../logic/history'
import { staffDay } from '../logic/staffing'

export const defaultContracts = (): ContractType[] => [
  { id: 'minijob', name: 'Minijob', kind: 'minijob', defaultTarget: 36, defaultMaxWeek: 16 },
  { id: 'werkstudent', name: 'Werkstudent', kind: 'werkstudent', weekHoursTerm: 20, weekHoursBreak: 40, defaultTarget: 70, defaultMaxWeek: 40 },
  { id: 'teilzeit', name: 'Teilzeit', kind: 'teilzeit', defaultTarget: 100, defaultMaxWeek: 30 },
  { id: 'vollzeit', name: 'Vollzeit', kind: 'vollzeit', defaultTarget: 160, defaultMaxWeek: 40 },
]
export const defaultHr = (): HrSettings => ({
  minWage: [{ from: '2026-01-01', value: 13.9 }, { from: '2027-01-01', value: 14.6 }],
  minijobLimit: [{ from: '2026-01-01', value: 603 }, { from: '2027-01-01', value: 633 }],
  contracts: defaultContracts(),
  maxDayHours: 10, restHours: 11, break30After: 6, break45After: 9, minShift: 3, maxShift: 8,
  under18: { maxDayHours: 8, maxWeekHours: 40, restHours: 12, latestEnd: 20, break30After: 4.5, break60After: 6 },
  semesterBreaks: [
    { from: '2026-02-09', to: '2026-04-10' }, { from: '2026-07-20', to: '2026-10-09' },
    { from: '2027-02-08', to: '2027-04-09' }, { from: '2027-07-19', to: '2027-10-08' },
  ],
})

const FIRST = ['Lena', 'Jonas', 'Mia', 'Leon', 'Emma', 'Noah', 'Sophie', 'Elias', 'Hannah', 'Mehmet', 'Ayşe', 'Luca', 'Marie', 'Finn', 'Lea', 'Paul', 'Anna', 'Tim', 'Zeynep', 'Jan', 'Laura', 'Max', 'Sara', 'Felix', 'Nina', 'Ben', 'Julia', 'Omar', 'Katharina', 'David', 'Amelie', 'Tom', 'Yasmin', 'Lukas', 'Clara', 'Nico', 'Ida', 'Samuel', 'Jana', 'Emre', 'Charlotte', 'Moritz', 'Aleyna', 'Philipp', 'Greta', 'Daniel', 'Sofia', 'Kevin', 'Pia', 'Alexander']
const LAST = ['Müller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Meyer', 'Wagner', 'Becker', 'Schulz', 'Hoffmann', 'Koch', 'Richter', 'Klein', 'Wolf', 'Neumann', 'Schwarz', 'Zimmermann', 'Braun', 'Krüger', 'Hartmann', 'Lange', 'Yilmaz', 'Kowalski', 'Demir', 'Nowak', 'Petrovic', 'Öztürk', 'Kaya', 'Hahn', 'Vogel', 'Berger', 'Frank', 'Schäfer', 'Lorenz', 'König']

export function hash01(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  h ^= h >>> 15
  h = Math.imul(h, 2246822507)
  h ^= h >>> 13
  return ((h >>> 0) % 100000) / 100000
}
const slug = (s: string) => s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/ş/g, 's').replace(/[^a-z]/g, '')

export function seedEmployees(store: Store, storeIdx: number): Employee[] {
  const n = 8 + Math.floor(hash01(store.id + 'n') * 2) // 8–9
  const kinds: string[] = ['vollzeit', 'teilzeit', 'teilzeit']
  const nWerk = Math.round(n * 0.3), nMini = n - 3 - nWerk
  for (let i = 0; i < nWerk; i++) kinds.push('werkstudent')
  for (let i = 0; i < nMini; i++) kinds.push('minijob')
  const out: Employee[] = []
  const u18 = hash01(store.id + 'u18') < 0.35
  kinds.forEach((k, i) => {
    const fi = Math.floor(hash01(`${store.id}f${i}`) * FIRST.length), li = Math.floor(hash01(`${store.id}l${i}`) * LAST.length)
    const first = FIRST[(fi + storeIdx * 7 + i * 13) % FIRST.length], last = LAST[(li + storeIdx * 5 + i * 3) % LAST.length]
    const wageBase = { minijob: 13.9, werkstudent: 14.2, teilzeit: 14.8, vollzeit: 16.8 }[k]!
    const wage = Math.round((wageBase + Math.floor(hash01(`${store.id}w${i}`) * 5) * 0.3) * 100) / 100
    const c = defaultContracts().find((x) => x.id === k)!
    const quals: string[] = k === 'vollzeit' ? ['Schichtleitung'] : k === 'teilzeit' && i === 1 ? ['Schichtleitung'] : k === 'werkstudent' && i === 3 ? ['Schichtleitung'] : []
    const under18 = u18 && k === 'minijob' && i === kinds.length - 1
    const e: Employee = {
      id: `${store.id}-m${i + 1}`, storeId: store.id, name: `${first} ${last}`, contractId: k, targetHours: c.defaultTarget, maxWeekHours: c.defaultMaxWeek,
      wage: under18 ? 13.9 : wage, quals, phone: `0151 000${String(storeIdx).padStart(2, '0')}${String(i).padStart(2, '0')}`, email: `${slug(first)}.${slug(last)}@example.org`, active: true, under18,
    }
    out.push(e)
  })
  return out
}

/** Typische Wochenmuster (Demo) – gleichen Namen in Wochen A/B */
export function demoAvailKind(e: Employee, date: string): Pick<Availability, 'kind' | 'from' | 'to'> {
  const wd = weekdayIdx(date)
  const week = Math.floor(diffDays(date, '2024-01-01') / 7)
  const r = hash01(`${e.id}|${wd}|${week % 2}`)
  const weekend = wd >= 5
  switch (e.contractId) {
    case 'vollzeit': return wd <= 4 ? { kind: 'ganztags' } : wd === 5 && week % 2 === 0 ? { kind: 'ganztags' } : wd === 6 && week % 2 === 1 ? { kind: 'ganztags' } : { kind: 'nicht' }
    case 'teilzeit': return weekend ? (r < 0.55 ? { kind: 'ganztags' } : { kind: 'nicht' }) : r < 0.45 ? { kind: 'ganztags' } : r < 0.75 ? { kind: 'nachmittags' } : { kind: 'nicht' }
    case 'werkstudent': return weekend ? (r < 0.6 ? { kind: 'ganztags' } : { kind: 'nicht' }) : r < 0.55 ? { kind: 'nachmittags' } : r < 0.65 ? { kind: 'ganztags' } : { kind: 'nicht' }
    default: // Minijob
      if (weekend) return r < 0.7 ? { kind: 'ganztags' } : r < 0.85 ? { kind: 'frei', from: 14, to: 19 } : { kind: 'nicht' }
      return wd === 4 ? (r < 0.7 ? { kind: 'nachmittags' } : { kind: 'nicht' }) : r < 0.3 ? { kind: 'nachmittags' } : r < 0.4 ? { kind: 'frei', from: 16, to: 20 } : { kind: 'nicht' }
  }
}

export interface HrSeed {
  employees: Employee[]
  availability: Availability[]
  absences: Absence[]
  shifts: Shift[]
}

/** Personal-Demodaten für alle Filialen: Mitarbeitende, Verfügbarkeit (14 Tage), Urlaube, Schichten (Historie + Plan) */
export function seedHr(base: Db, today = todayISO()): HrSeed {
  const hr = base.settings.hr
  const out: HrSeed = { employees: [], availability: [], absences: [], shifts: [] }
  const histFrom = addDays(today, -90).slice(0, 7) + '-01'
  base.stores.forEach((st, si) => {
    let emps = seedEmployees(st, si)
    // Nachfrage (Personalstunden) der Historie → Soll-Stunden passend skalieren
    const hist = range(histFrom, addDays(today, -1))
    const needOf = (d: string) => {
      const { open, close } = openHours(st, d)
      const rows = hourlyOf(base, st.id, d)
      const need: Record<number, number> = {}
      for (let h = open; h < close; h++) need[h] = Math.max(st.minStaff, Math.ceil((rows.find((r) => r.hour === h)?.cups ?? 0) / st.cupsPerStaffHour - 1e-9))
      return need
    }
    let demand = 0
    for (const d of hist) demand += Object.values(needOf(d)).reduce((a, b) => a + b, 0)
    const monthly = (demand / Math.max(1, hist.length)) * 30.4
    const sum = emps.reduce((s, e) => s + e.targetHours, 0)
    const f = Math.min(1.35, Math.max(0.6, (0.96 * monthly) / sum))
    emps = emps.map((e) => {
      let t = Math.round(e.targetHours * f * 2) / 2
      const mm = maxMonthHours(hr, e, today)
      if (mm !== null) t = Math.min(t, Math.floor(mm - 2))
      t = Math.min(t, Math.floor((e.maxWeekHours * 4.2) / 0.5) * 0.5)
      return { ...e, targetHours: t }
    })
    const byId = new Map(emps.map((e) => [e.id, e]))
    const win = (e: Employee, date: string, useAbs: boolean): [number, number] | null => {
      const { open, close } = openHours(st, date)
      if (useAbs && isAbsent(out.absences, e.id, date)) return null
      const k = demoAvailKind(e, date)
      let w = availWindow({ empId: e.id, date, ...k }, open, close)
      if (w && e.under18) w = [w[0], Math.min(w[1], hr.under18.latestEnd)]
      return w && w[1] > w[0] ? w : null
    }
    // Historie
    let n = 0
    const newId = () => `sh-${st.id}-${++n}`
    const past = planRange({ hr, storeId: st.id, employees: emps, open: (d) => openHours(st, d), avail: (e, d) => win(e, d, false), need: needOf, fixed: [], newId }, hist)
    // Soll-Stunden aus dem tatsächlichen Monatsmittel (vollständige Monate) ableiten → realistische Salden
    const ymNow = today.slice(0, 7)
    const perMonth = new Map<string, number>()
    for (const sh of past.shifts) {
      const e = byId.get(sh.empId)!
      if (sh.date.slice(0, 7) < ymNow) perMonth.set(`${sh.empId}|${sh.date.slice(0, 7)}`, (perMonth.get(`${sh.empId}|${sh.date.slice(0, 7)}`) ?? 0) + netOf(hr, e, sh))
    }
    emps = emps.map((e) => {
      const v = [...perMonth.entries()].filter(([k]) => k.startsWith(e.id + '|')).map(([, h]) => h)
      if (!v.length) return e
      const avg = v.reduce((a, b) => a + b, 0) / v.length
      let t = Math.round(avg * 2) / 2
      const mm = maxMonthHours(hr, e, today)
      if (mm !== null) t = Math.min(t, Math.floor(mm - 1))
      return { ...e, targetHours: Math.max(8, t) }
    })
    for (const e of emps) byId.set(e.id, e)
    // Urlaube in den nächsten 14 Tagen (1–2 Personen)
    const nAbs = 1 + Math.floor(hash01(st.id + 'abs') * 2)
    for (let i = 0; i < nAbs; i++) {
      const e = emps[1 + Math.floor(hash01(`${st.id}ab${i}`) * (emps.length - 1))]
      const from = addDays(today, 2 + Math.floor(hash01(`${st.id}af${i}`) * 6))
      out.absences.push({ id: `ab-${st.id}-${i + 1}`, empId: e.id, from, to: addDays(from, 3 + i * 2), type: 'Urlaub', note: '' })
    }
    // Verfügbarkeiten (Eingaben) für die nächsten 14 Tage
    for (const e of emps) for (let i = 0; i < 14; i++) {
      const date = addDays(today, i)
      out.availability.push({ empId: e.id, date, ...demoAvailKind(e, date) })
    }
    // Plan für die nächsten 14 Tage
    const days = range(today, addDays(today, 13))
    const needFut = (d: string) => staffDay(base, st.id, d, today).need
    const plan = planRange({ hr, storeId: st.id, employees: emps, open: (d) => openHours(st, d), avail: (e, d) => win(e, d, true), need: needFut, fixed: past.shifts, newId }, days)
    out.employees.push(...emps)
    out.shifts.push(...past.shifts, ...plan.shifts)
    void byId
  })
  return out
}
