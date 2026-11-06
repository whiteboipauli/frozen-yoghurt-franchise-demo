// Datumshilfen (lokale Tage als 'YYYY-MM-DD')
export const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const parseISO = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const pad2 = (n: number) => (n < 10 ? '0' + n : String(n))
const addCache = new Map<string, string>()
export const addDays = (s: string, n: number) => {
  const k = s + n
  let r = addCache.get(k)
  if (r === undefined) {
    const t = new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10) + n))
    r = `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`
    if (addCache.size > 200000) addCache.clear()
    addCache.set(k, r)
  }
  return r
}
export const todayISO = () => iso(new Date())
/** a − b in Tagen */
const utcDay = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 86400000
export const diffDays = (a: string, b: string) => Math.round(utcDay(a) - utcDay(b))
/** Montag = 0 … Sonntag = 6 */
export const weekdayIdx = (s: string) => (new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10))).getUTCDay() + 6) % 7
export const WEEKDAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']
export const WEEKDAYS_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
export const range = (from: string, to: string) => {
  const out: string[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}

/** Liefertag: Bestelltag + Lieferzeit; sonntags wird nicht geliefert, dann kommt die Ware am Montag */
export const deliveryOn = (from: string, lead: number) => { const d = addDays(from, lead); return weekdayIdx(d) === 6 ? addDays(d, 1) : d }
/** Lieferzeit in Tagen ab diesem Tag, mit Sonntagsregel */
export const leadDays = (from: string, lead: number) => diffDays(deliveryOn(from, lead), from)
