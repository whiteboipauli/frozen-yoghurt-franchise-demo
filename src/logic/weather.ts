import type { IconName } from '../icons'
import { useSyncExternalStore } from 'react'
import { addDays, parseISO, todayISO } from '../lib/date'

/** Wetterdaten: Open-Meteo (kostenlos, ohne API-Key). Mehrere Standorte pro Anfrage, lokal zwischengespeichert; bei Ausfall rechnet alles ohne Wetter weiter. */
export interface WxDay {
  tmax: number
  rain: number // mm
  code: number // WMO
  /** Sonnenstunden */
  sun: number
}
export type WxMap = Record<string, WxDay>
interface Cache {
  fetchedOn: string
  at: number
  /** Standort-Schlüssel → Tag → [tmax, regen, code, sonne] */
  byLoc: Record<string, Record<string, [number, number, number, number]>>
}

const KEY = 'fj-ww-weather-v2'
export const locKey = (l: { lat: number; lon: number }) => `${l.lat.toFixed(2)},${l.lon.toFixed(2)}`
/** Tage Historie (13 Monate) */
export const WX_ARCHIVE_DAYS = 410

let cache: Cache = { fetchedOn: '', at: 0, byLoc: {} }
const expanded = new Map<string, WxMap>()
let available = true
let version = 0
const listeners = new Set<() => void>()
try {
  const raw = localStorage.getItem(KEY)
  if (raw) cache = JSON.parse(raw)
} catch {
  /* ignorieren */
}
let snap = { version, available }
const emit = () => {
  version++
  snap = { version, available }
  listeners.forEach((l) => l())
}
export const useWeatherStatus = () =>
  useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => snap)

export const weatherVersion = () => version
export const weatherAvailable = () => available
export const wxFor = (l: { lat: number; lon: number }): WxMap | null => {
  const k = locKey(l)
  const raw = cache.byLoc[k]
  if (!raw) return null
  let m = expanded.get(k)
  if (!m) {
    m = {}
    for (const [d, v] of Object.entries(raw)) m[d] = { tmax: v[0], rain: v[1], code: v[2], sun: v[3] }
    expanded.set(k, m)
  }
  return Object.keys(m).length ? m : null
}

const DAILY = 'temperature_2m_max,precipitation_sum,weather_code,sunshine_duration'
async function getJson(url: string, ms = 12000) {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), ms)
  try {
    const r = await fetch(url, { signal: ctl.signal })
    if (!r.ok) throw new Error(String(r.status))
    return await r.json()
  } finally {
    clearTimeout(t)
  }
}
const r1 = (n: number) => Math.round(n * 10) / 10
function parse(j: any, into: Record<string, [number, number, number, number]>) {
  const d = j?.daily
  if (!d?.time) return
  d.time.forEach((date: string, i: number) => {
    const tmax = d.temperature_2m_max?.[i]
    const rain = d.precipitation_sum?.[i]
    const code = d.weather_code?.[i]
    const sun = d.sunshine_duration?.[i]
    if (tmax == null || rain == null || code == null) return
    into[date] = [r1(tmax), r1(rain), code, sun == null ? 0 : r1(sun / 3600)]
  })
}
const asList = (j: any): any[] => (Array.isArray(j) ? j : [j])

/**
 * Lädt Archiv (13 Monate) + Vorhersage (16 Tage) für alle Standorte in je EINER Anfrage.
 * Städte mit mehreren Filialen werden nur einmal abgefragt. Einmal pro Tag.
 */
export async function refreshWeather(locs: { lat: number; lon: number }[], force = false): Promise<boolean> {
  const today = todayISO()
  const uniq = [...new Map(locs.map((l) => [locKey(l), l])).values()]
  const missing = uniq.filter((l) => force || cache.fetchedOn !== today || !cache.byLoc[locKey(l)])
  if (!missing.length) return available
  let ok = true
  try {
    const q = `latitude=${missing.map((l) => l.lat).join(',')}&longitude=${missing.map((l) => l.lon).join(',')}&daily=${DAILY}&timezone=auto`
    const [arch, fc] = await Promise.all([
      getJson(`https://archive-api.open-meteo.com/v1/archive?${q}&start_date=${addDays(today, -WX_ARCHIVE_DAYS)}&end_date=${addDays(today, -4)}`),
      getJson(`https://api.open-meteo.com/v1/forecast?${q}&past_days=7&forecast_days=16`),
    ])
    const A = asList(arch), F = asList(fc)
    missing.forEach((l, i) => {
      const m: Record<string, [number, number, number, number]> = {}
      parse(A[i], m)
      parse(F[i], m)
      if (!Object.keys(m).length) { ok = false; return }
      cache.byLoc[locKey(l)] = m
      expanded.delete(locKey(l))
    })
  } catch {
    ok = false
  }
  if (ok) {
    cache.fetchedOn = today
    cache.at = Date.now()
    try {
      localStorage.setItem(KEY, JSON.stringify(cache))
    } catch {
      /* ignorieren */
    }
  }
  available = ok || missing.every((l) => !!cache.byLoc[locKey(l)])
  emit()
  return ok
}

/** Nur für Demodaten: deutsches Klima als Ersatz, wenn keine echten Wetterdaten vorliegen (deterministisch) */
export function syntheticWx(lat: number, days: string[]): WxMap {
  const out: WxMap = {}
  const hash = (n: number) => { const x = Math.sin(n * 12.9898 + lat * 78.233) * 43758.5453; return x - Math.floor(x) }
  days.forEach((date, i) => {
    const doy = Math.floor((parseISO(date).getTime() - new Date(parseISO(date).getFullYear(), 0, 0).getTime()) / 86400000)
    // langsame Wetterlagen: gleitender Wert aus Zufall
    const slow = (hash(Math.floor(i / 4)) - 0.5) * 8
    const tmax = 11.5 + 10.5 * Math.sin((2 * Math.PI * (doy - 105)) / 365) + slow + (hash(i + 3) - 0.5) * 4
    const wet = hash(i * 1.7 + 11)
    const rain = wet > 0.62 ? Math.round(hash(i + 91) * 14 * 10) / 10 : 0
    const sun = Math.max(0, (rain > 0 ? 1.5 : 6.5) * (0.4 + 0.6 * (1 + Math.sin((2 * Math.PI * (doy - 80)) / 365)) / 2 * 1.6) + (hash(i + 17) - 0.5) * 3)
    out[date] = { tmax: r1(tmax), rain, code: rain >= 8 ? 82 : rain >= 1 ? 61 : sun > 6 ? 0 : sun > 3 ? 2 : 3, sun: r1(Math.min(15, sun)) }
  })
  return out
}

/* ---------- Auswertung ---------- */
export type RainClass = 'trocken' | 'leicht' | 'stark'
export const rainClass = (mm: number): RainClass => (mm < 1 ? 'trocken' : mm < 8 ? 'leicht' : 'stark')

export function wxKind(w: WxDay): { icon: IconName; label: string } {
  const c = w.code
  if (c >= 95) return { icon: 'wx-storm', label: 'Gewitter' }
  if (rainClass(w.rain) === 'stark' || c >= 80) return { icon: 'wx-rain', label: 'Starker Regen' }
  if (rainClass(w.rain) === 'leicht' || (c >= 51 && c <= 67)) return { icon: 'wx-drizzle', label: 'Regen' }
  if (c <= 1) return { icon: 'wx-sun', label: 'Sonnig' }
  if (c === 2) return { icon: 'wx-part', label: 'Teils bewölkt' }
  return { icon: 'wx-cloud', label: 'Bewölkt' }
}
