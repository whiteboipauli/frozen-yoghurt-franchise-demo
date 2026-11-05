import { parseISO, todayISO, diffDays, WEEKDAYS_SHORT, weekdayIdx } from './date'
import type { Article } from '../data/types'

const nf0 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 })
const nf1 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 })
const nf2 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const fmt0 = (n: number) => nf0.format(n)
export const fmt1 = (n: number) => nf1.format(n)
export const fmtEUR = (n: number) => `${nf2.format(n)} €`
export const fmtNum2 = (n: number) => nf2.format(n)
export const fmtPct = (n: number, digits = 1) =>
  `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n)} %`

export const fmtDate = (s: string) =>
  new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(parseISO(s))
export const fmtDateShort = (s: string) =>
  `${WEEKDAYS_SHORT[weekdayIdx(s)]}, ${new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' }).format(parseISO(s))}`
export const fmtDayMonth = (s: string) =>
  new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' }).format(parseISO(s))
export const fmtLongToday = () =>
  new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())

export const relDay = (s: string) => {
  const d = diffDays(s, todayISO())
  if (d === 0) return 'heute'
  if (d === 1) return 'morgen'
  if (d === -1) return 'gestern'
  return d > 0 ? `in ${d} Tagen` : `vor ${-d} Tagen`
}

/** Menge (Basiseinheit g bzw. Stück) → Anzeige in der Artikel-Einheit */
/** Kartons aus Basiseinheit g (1 Karton = kg je Karton, zentral im Artikelstamm) */
export const fmtCartons = (base: number, packKg: number, withKg = false) => {
  const c = base / 1000 / Math.max(0.1, packKg)
  return `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(c)} ${Math.abs(Math.round(c * 10) / 10) === 1 ? 'Karton' : 'Kartons'}${withKg ? ` (= ${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(base / 1000)} kg)` : ''}`
}
export function fmtQty(a: Pick<Article, 'unit'> & { source?: string; packSize?: number }, base: number) {
  if (a.unit === 'kg' && a.source === 'zentrale' && a.packSize) return fmtCartons(base, a.packSize, true)
  if (a.unit === 'kg') {
    const kg = base / 1000
    return `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: Math.abs(kg) >= 100 ? 0 : 1 }).format(kg)} kg`
  }
  return `${nf0.format(base)} Stück`
}

/** Uhrzeit aus Stunden (15.5 → „15:30“) */
export const fmtTime = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`
export const fmtHoursNum = (n: number) => `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(n)} Std.`

export const fmtShortToday = () => new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date())
