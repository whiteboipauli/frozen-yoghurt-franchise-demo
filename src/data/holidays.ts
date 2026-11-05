import type { SchoolHoliday, StateCode } from './types'
import { addDays, iso } from '../lib/date'

/** Ostersonntag (Gauß/„anonymer gregorianischer“ Algorithmus) */
export function easterSunday(y: number): string {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1
  return iso(new Date(y, month - 1, day))
}

const ALL: StateCode[] = ['BW', 'BY', 'BE', 'BB', 'HB', 'HH', 'HE', 'MV', 'NI', 'NW', 'RP', 'SL', 'SN', 'ST', 'SH', 'TH']
const only = (...s: StateCode[]) => s

/** Buß- und Bettag: Mittwoch vor dem 23. November */
function bussBettag(y: number) {
  const d = new Date(y, 10, 22)
  while (d.getDay() !== 3) d.setDate(d.getDate() - 1)
  return iso(d)
}

/** Gesetzliche Feiertage eines Bundeslands (feste und osterabhängige), lokal berechnet */
export function legalHolidays(state: StateCode, y: number): { date: string; name: string }[] {
  const e = easterSunday(y)
  const f = (m: number, d: number) => iso(new Date(y, m - 1, d))
  const rows: [string, string, StateCode[]][] = [
    [f(1, 1), 'Neujahr', ALL],
    [f(1, 6), 'Heilige Drei Könige', only('BW', 'BY', 'ST')],
    [f(3, 8), 'Internationaler Frauentag', only('BE', 'MV')],
    [addDays(e, -2), 'Karfreitag', ALL],
    [addDays(e, 1), 'Ostermontag', ALL],
    [f(5, 1), 'Tag der Arbeit', ALL],
    [addDays(e, 39), 'Christi Himmelfahrt', ALL],
    [addDays(e, 50), 'Pfingstmontag', ALL],
    [addDays(e, 60), 'Fronleichnam', only('BW', 'BY', 'HE', 'NW', 'RP', 'SL')],
    [f(8, 15), 'Mariä Himmelfahrt', only('SL')],
    [f(9, 20), 'Weltkindertag', only('TH')],
    [f(10, 3), 'Tag der Deutschen Einheit', ALL],
    [f(10, 31), 'Reformationstag', only('BB', 'HB', 'HH', 'MV', 'NI', 'SN', 'ST', 'SH', 'TH')],
    [f(11, 1), 'Allerheiligen', only('BW', 'BY', 'NW', 'RP', 'SL')],
    [bussBettag(y), 'Buß- und Bettag', only('SN')],
    [f(12, 25), '1. Weihnachtstag', ALL],
    [f(12, 26), '2. Weihnachtstag', ALL],
  ]
  return rows.filter((r) => r[2].includes(state)).map((r) => ({ date: r[0], name: r[1] })).sort((a, b) => a.date.localeCompare(b.date))
}

const cache = new Map<string, Map<string, string>>()
/** Name des gesetzlichen Feiertags oder undefined */
export function legalHolidayOn(state: StateCode, date: string): string | undefined {
  const y = Number(date.slice(0, 4))
  const k = `${state}${y}`
  let m = cache.get(k)
  if (!m) cache.set(k, (m = new Map(legalHolidays(state, y).map((h) => [h.date, h.name]))))
  return m.get(date)
}

/** Schulferien 2026/2027 – Vorbefüllung nach bestem Wissen, bearbeitbar. Bitte Daten prüfen. */
const SH: [StateCode, string, string, string][] = [
  ['NW', 'Osterferien 2026', '2026-03-30', '2026-04-11'], ['NW', 'Pfingstferien 2026', '2026-05-26', '2026-05-26'], ['NW', 'Sommerferien 2026', '2026-07-20', '2026-09-01'],
  ['NW', 'Herbstferien 2026', '2026-10-12', '2026-10-24'], ['NW', 'Weihnachtsferien 2026', '2026-12-23', '2027-01-06'],
  ['NW', 'Osterferien 2027', '2027-03-22', '2027-04-03'], ['NW', 'Pfingstferien 2027', '2027-05-18', '2027-05-18'], ['NW', 'Sommerferien 2027', '2027-07-19', '2027-08-31'],
  ['NW', 'Herbstferien 2027', '2027-10-23', '2027-11-06'], ['NW', 'Weihnachtsferien 2027', '2027-12-24', '2028-01-08'],
  ['NI', 'Osterferien 2026', '2026-03-23', '2026-04-07'], ['NI', 'Sommerferien 2026', '2026-07-02', '2026-08-12'], ['NI', 'Herbstferien 2026', '2026-10-12', '2026-10-24'],
  ['NI', 'Weihnachtsferien 2026', '2026-12-23', '2027-01-05'], ['NI', 'Osterferien 2027', '2027-03-15', '2027-03-27'], ['NI', 'Sommerferien 2027', '2027-06-23', '2027-08-03'],
  ['NI', 'Herbstferien 2027', '2027-10-18', '2027-10-30'], ['NI', 'Weihnachtsferien 2027', '2027-12-23', '2028-01-08'],
  ['HB', 'Osterferien 2026', '2026-03-23', '2026-04-07'], ['HB', 'Sommerferien 2026', '2026-07-02', '2026-08-12'], ['HB', 'Herbstferien 2026', '2026-10-12', '2026-10-24'],
  ['HB', 'Weihnachtsferien 2026', '2026-12-23', '2027-01-05'], ['HB', 'Osterferien 2027', '2027-03-15', '2027-03-27'], ['HB', 'Sommerferien 2027', '2027-06-23', '2027-08-03'],
  ['HB', 'Herbstferien 2027', '2027-10-18', '2027-10-30'], ['HB', 'Weihnachtsferien 2027', '2027-12-23', '2028-01-08'],
  ['HH', 'Märzferien 2026', '2026-03-02', '2026-03-13'], ['HH', 'Maiferien 2026', '2026-05-11', '2026-05-15'], ['HH', 'Sommerferien 2026', '2026-07-09', '2026-08-19'],
  ['HH', 'Herbstferien 2026', '2026-10-19', '2026-10-30'], ['HH', 'Weihnachtsferien 2026', '2026-12-21', '2027-01-02'],
  ['HH', 'Märzferien 2027', '2027-03-01', '2027-03-12'], ['HH', 'Maiferien 2027', '2027-05-03', '2027-05-07'], ['HH', 'Sommerferien 2027', '2027-06-24', '2027-08-04'],
  ['HH', 'Herbstferien 2027', '2027-10-18', '2027-10-29'], ['HH', 'Weihnachtsferien 2027', '2027-12-23', '2028-01-04'],
  ['SH', 'Osterferien 2026', '2026-03-26', '2026-04-11'], ['SH', 'Sommerferien 2026', '2026-07-04', '2026-08-15'], ['SH', 'Herbstferien 2026', '2026-10-19', '2026-10-30'],
  ['SH', 'Weihnachtsferien 2026', '2026-12-21', '2027-01-06'], ['SH', 'Osterferien 2027', '2027-03-25', '2027-04-09'], ['SH', 'Sommerferien 2027', '2027-07-19', '2027-08-28'],
  ['SH', 'Herbstferien 2027', '2027-10-18', '2027-10-29'], ['SH', 'Weihnachtsferien 2027', '2027-12-23', '2028-01-08'],
  ['BY', 'Winterferien 2026', '2026-02-16', '2026-02-20'], ['BY', 'Osterferien 2026', '2026-03-30', '2026-04-10'], ['BY', 'Pfingstferien 2026', '2026-05-26', '2026-06-05'],
  ['BY', 'Sommerferien 2026', '2026-08-03', '2026-09-14'], ['BY', 'Herbstferien 2026', '2026-11-02', '2026-11-06'], ['BY', 'Weihnachtsferien 2026', '2026-12-24', '2027-01-08'],
  ['BY', 'Winterferien 2027', '2027-02-08', '2027-02-12'], ['BY', 'Osterferien 2027', '2027-03-29', '2027-04-09'], ['BY', 'Pfingstferien 2027', '2027-05-18', '2027-05-28'],
  ['BY', 'Sommerferien 2027', '2027-08-02', '2027-09-13'], ['BY', 'Herbstferien 2027', '2027-11-02', '2027-11-05'], ['BY', 'Weihnachtsferien 2027', '2027-12-24', '2028-01-07'],
]
export const defaultSchoolHolidays = (): SchoolHoliday[] => SH.map(([state, name, from, to], i) => ({ id: `sf${i}`, state, name, from, to }))
