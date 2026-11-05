import type { Absence, Availability, AvailKind, Db, Employee, Shift } from '../data/types'
import { addDays, parseISO, WEEKDAYS, weekdayIdx } from '../lib/date'
import { netOf, pauseFor } from './hr'

/**
 * Einheitliche Adapter-Schicht zu Personalplanungsprogrammen (Papershift, Planday, Deputy …).
 * Im Prototyp gibt es KEINE echten Aufrufe und keine API-Schlüssel im Browser – die Adapter sind vorbereitet.
 * Ein echter Anbieter implementiert dieses Interface serverseitig (dort liegen auch die Zugangsschlüssel).
 */
export interface SchedulingAdapter {
  id: string
  name: string
  status: 'vorbereitet'
  importEmployees(): Promise<Employee[]>
  importAvailability(from: string, to: string): Promise<Availability[]>
  importAbsences(from: string, to: string): Promise<Absence[]>
  exportSchedule(shifts: Shift[], employees: Employee[]): Promise<void>
}
class NotConnected implements SchedulingAdapter {
  status = 'vorbereitet' as const
  constructor(public id: string, public name: string) {}
  private fail(): never { throw new Error(`${this.name}: noch nicht verbunden – für eine echte Verbindung wird ein Server benötigt.`) }
  async importEmployees(): Promise<Employee[]> { return this.fail() }
  async importAvailability(): Promise<Availability[]> { return this.fail() }
  async importAbsences(): Promise<Absence[]> { return this.fail() }
  async exportSchedule(): Promise<void> { return this.fail() }
}
export const ADAPTERS: SchedulingAdapter[] = [new NotConnected('papershift', 'Papershift'), new NotConnected('planday', 'Planday'), new NotConnected('deputy', 'Deputy')]

/* ---------- Datei-Import: Verfügbarkeiten (JSON / CSV) ---------- */
const KINDS: Record<string, AvailKind> = {
  ganztags: 'ganztags', ganztag: 'ganztags', vormittags: 'vormittags', nachmittags: 'nachmittags', abends: 'nachmittags', 'nachmittags/abends': 'nachmittags',
  nicht: 'nicht', 'nicht verfügbar': 'nicht', frei: 'frei',
}
export const parseTime = (v: unknown): number | undefined => {
  if (v === undefined || v === null || v === '') return undefined
  const m = String(v).trim().match(/^(\d{1,2})(?::(\d{2}))?$/)
  if (!m) return NaN
  const h = Number(m[1]) + Number(m[2] ?? 0) / 60
  return h >= 0 && h <= 24 ? h : NaN
}
export const parseDate = (v: unknown): string | null => {
  const s = String(v ?? '').trim()
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m) return s
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null
}
export interface ImportResult {
  rows: Availability[]
  errors: string[]
}
function normalize(raw: Record<string, unknown>[], employees: Employee[]): ImportResult {
  const rows: Availability[] = []
  const errors: string[] = []
  raw.forEach((r, i) => {
    const line = i + 1
    const key = (k: string) => Object.entries(r).find(([x]) => x.trim().toLowerCase() === k)?.[1]
    const who = String(key('mitarbeiter') ?? key('name') ?? '').trim()
    const e = employees.find((x) => x.id === who || x.name.toLowerCase() === who.toLowerCase())
    if (!e) return void errors.push(`Zeile ${line}: Mitarbeiter „${who}“ nicht gefunden`)
    const date = parseDate(key('datum'))
    if (!date) return void errors.push(`Zeile ${line}: Datum „${key('datum')}“ ungültig (JJJJ-MM-TT oder TT.MM.JJJJ)`)
    const kind = KINDS[String(key('verfuegbarkeit') ?? key('verfügbarkeit') ?? '').trim().toLowerCase()]
    if (!kind) return void errors.push(`Zeile ${line}: Verfügbarkeit „${key('verfuegbarkeit')}“ unbekannt`)
    const from = parseTime(key('von')), to = parseTime(key('bis'))
    if (Number.isNaN(from) || Number.isNaN(to)) return void errors.push(`Zeile ${line}: Uhrzeit ungültig`)
    if (kind === 'frei' && (from === undefined || to === undefined || to <= from)) return void errors.push(`Zeile ${line}: „frei“ braucht von und bis (von < bis)`)
    rows.push(kind === 'frei' ? { empId: e.id, date, kind, from, to } : { empId: e.id, date, kind })
  })
  return { rows, errors }
}
export function parseAvailabilityJson(text: string, employees: Employee[]): ImportResult {
  let data: unknown
  try { data = JSON.parse(text) } catch { return { rows: [], errors: ['Die Datei ist kein gültiges JSON.'] } }
  const list = Array.isArray(data) ? data : (data as { verfuegbarkeiten?: unknown })?.verfuegbarkeiten
  if (!Array.isArray(list)) return { rows: [], errors: ['Erwartet wird eine Liste von Einträgen.'] }
  return normalize(list as Record<string, unknown>[], employees)
}
function splitCsv(line: string, sep: string) {
  const out: string[] = []
  let cur = '', q = false
  for (const ch of line) {
    if (ch === '"') q = !q
    else if (ch === sep && !q) { out.push(cur); cur = '' } else cur += ch
  }
  out.push(cur)
  return out.map((x) => x.trim())
}
export function parseAvailabilityCsv(text: string, employees: Employee[]): ImportResult {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return { rows: [], errors: ['Die Datei braucht eine Kopfzeile und mindestens eine Datenzeile.'] }
  const sep = lines[0].includes(';') ? ';' : ','
  const head = splitCsv(lines[0], sep).map((h) => h.toLowerCase())
  const raw = lines.slice(1).map((l) => Object.fromEntries(splitCsv(l, sep).map((v, i) => [head[i] ?? `spalte${i}`, v])))
  return normalize(raw, employees)
}
export const parseAvailabilityFile = (name: string, text: string, employees: Employee[]) =>
  name.toLowerCase().endsWith('.json') ? parseAvailabilityJson(text, employees) : parseAvailabilityCsv(text, employees)

export function sampleAvailability(employees: Employee[], from: string): Availability[] {
  const e = employees.slice(0, 3)
  const out: Availability[] = []
  e.forEach((emp, i) => {
    out.push({ empId: emp.id, date: addDays(from, i), kind: 'ganztags' })
    out.push({ empId: emp.id, date: addDays(from, i + 1), kind: 'nachmittags' })
    out.push({ empId: emp.id, date: addDays(from, i + 2), kind: 'frei', from: 14, to: 19 })
    out.push({ empId: emp.id, date: addDays(from, i + 3), kind: 'nicht' })
  })
  return out
}
const hh = (h?: number) => (h === undefined ? '' : `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`)
export function sampleJson(employees: Employee[], from: string) {
  return JSON.stringify(sampleAvailability(employees, from).map((a) => ({ mitarbeiter: employees.find((e) => e.id === a.empId)!.name, datum: a.date, verfuegbarkeit: a.kind, ...(a.kind === 'frei' ? { von: hh(a.from), bis: hh(a.to) } : {}) })), null, 2)
}
export function sampleCsv(employees: Employee[], from: string) {
  return ['mitarbeiter;datum;verfuegbarkeit;von;bis', ...sampleAvailability(employees, from).map((a) => `${employees.find((e) => e.id === a.empId)!.name};${a.date};${a.kind};${hh(a.from)};${hh(a.to)}`)].join('\n')
}

/* ---------- Export: Dienstplan als CSV ---------- */
export function exportScheduleCsv(db: Db, storeId: string, from: string, to: string): string {
  const hr = db.settings.hr
  const emps = new Map(db.employees.map((e) => [e.id, e]))
  const rows = db.shifts.filter((s) => s.storeId === storeId && s.date >= from && s.date <= to && emps.has(s.empId)).sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start)
  const f = (n: number) => String(n).replace('.', ',')
  return ['datum;wochentag;mitarbeiter;beginn;ende;pause_std;netto_std;gesperrt', ...rows.map((s) => {
    const e = emps.get(s.empId)!
    return [s.date, WEEKDAYS[weekdayIdx(s.date)], e.name, hh(s.start), hh(s.end), f(pauseFor(hr, e, s.end - s.start)), f(netOf(hr, e, s)), s.locked ? 'ja' : 'nein'].join(';')
  })].join('\n')
}
export function download(name: string, text: string, mime = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob(['﻿' + text], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
void parseISO
