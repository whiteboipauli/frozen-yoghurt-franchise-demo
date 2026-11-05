import type { Db } from './types'
import { buildSeed, DB_VERSION } from './seed'
import { todayISO } from '../lib/date'
import { CITY_COORDS } from './stores'
import { syntheticWx, wxFor } from '../logic/weather'

const KEY = 'fj-ww-delta-v5'
const LEGACY = ['fj-warenwirtschaft-db', 'fj-ww-weather']

/**
 * Persistenz: Die Demodaten werden deterministisch (Seed) erzeugt und gar nicht gespeichert.
 * Im localStorage liegen nur die Änderungen gegenüber diesen Demodaten (kleiner Patch).
 * Später durch echte Datenbank + Login ersetzen (gleiche Signaturen).
 */
type Node = { s: unknown } | { o: Record<string, Node>; d: string[] } | { a: unknown[]; del: string[] }
const ARR_KEYS: Record<string, (x: any) => string> = {
  stores: (x) => x.id, articles: (x) => x.id, recipes: (x) => x.id, saleDays: (x) => `${x.storeId}|${x.date}`, orders: (x) => x.id, centralOrders: (x) => x.id,
  deliveries: (x) => x.id, invoices: (x) => x.id, outflows: (x) => x.id, inventories: (x) => x.id, requests: (x) => x.id, cases: (x) => x.id, employees: (x) => x.id,
  availability: (x) => `${x.empId}|${x.date}`, absences: (x) => x.id, shifts: (x) => x.id, callouts: (x) => x.id, monthlyReports: (x) => x.id, reports: (x) => x.id, posts: (x) => x.id, campaigns: (x) => x.id, knowledge: (x) => x.id,
  'settings.specialDays': (x) => x.id, 'settings.schoolHolidays': (x) => x.id, 'settings.hr.contracts': (x) => x.id,
}
const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

export function diffNode(a: any, b: any, path: string): Node | undefined {
  if (a === b) return undefined
  const kf = ARR_KEYS[path]
  if (kf && Array.isArray(a) && Array.isArray(b)) {
    const ma = new Map(a.map((x) => [kf(x), x]))
    const mb = new Set<string>()
    const upsert: unknown[] = []
    for (const x of b) {
      const k = kf(x)
      mb.add(k)
      const o = ma.get(k)
      if (o !== x && (o === undefined || JSON.stringify(o) !== JSON.stringify(x))) upsert.push(x)
    }
    const del = [...ma.keys()].filter((k) => !mb.has(k))
    return upsert.length || del.length ? { a: upsert, del } : undefined
  }
  if (isPlain(a) && isPlain(b)) {
    const o: Record<string, Node> = {}
    for (const k of Object.keys(b)) {
      const n = diffNode(a[k], b[k], path ? `${path}.${k}` : k)
      if (n) o[k] = n
    }
    const d = Object.keys(a).filter((k) => !(k in b))
    return Object.keys(o).length || d.length ? { o, d } : undefined
  }
  return JSON.stringify(a) === JSON.stringify(b) ? undefined : { s: b }
}
export function applyNode(a: any, n: Node, path: string): any {
  if ('s' in n) return n.s
  if ('o' in n) {
    const c: Record<string, unknown> = { ...(a ?? {}) }
    for (const k of n.d) delete c[k]
    for (const [k, sub] of Object.entries(n.o)) c[k] = applyNode(a?.[k], sub, path ? `${path}.${k}` : k)
    return c
  }
  const kf = ARR_KEYS[path]
  const m = new Map<string, unknown>((a ?? []).map((x: unknown) => [kf(x), x]))
  for (const k of n.del) m.delete(k)
  for (const x of n.a) m.set(kf(x), x)
  return [...m.values()]
}

/** Am nächsten Tag werden die zeitbezogenen Demodaten neu erzeugt; Stammdaten und Einstellungen bleiben */
const KEEP = ['settings', 'stores', 'articles', 'recipes', 'employees', 'posts', 'campaigns', 'knowledge', 'monthlyReports', 'reports']

let base: Db | null = null
export const getBase = () => base

/** Demodaten mit Wetter (echt, sonst deutsches Klima als Ersatz für die Demo-Verkäufe) */
function seed(): Db {
  const byLoc: Record<string, any> = {}
  for (const c of Object.values(CITY_COORDS)) byLoc[`${c.lat},${c.lon}`] = wxFor(c)
  void syntheticWx
  return buildSeed(byLoc)
}

/** Einmalig beim Start: Einträge der früheren Markenbezeichnung aus dem Browser-Speicher entfernen (Präfix bewusst zusammengesetzt) */
function purgeOldKeys() {
  try {
    const old = atob('eW9tYXJv')
    for (const k of Object.keys(localStorage)) if (k.startsWith(`${old}-ww-`) || k === `${old}-warenwirtschaft-db`) localStorage.removeItem(k)
    for (const k of Object.keys(sessionStorage)) if (k.startsWith(`${old}-ww-`)) sessionStorage.removeItem(k)
  } catch { /* ignorieren */ }
}

export function load(): Db {
  purgeOldKeys()
  try { for (const k of LEGACY) localStorage.removeItem(k) } catch { /* ignorieren */ }
  base = seed()
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const saved = JSON.parse(raw) as { v: number; on: string; patch: Node }
      if (saved.v === DB_VERSION && 'o' in saved.patch) {
        let patch = saved.patch
        if (saved.on !== todayISO()) {
          const o: Record<string, Node> = {}
          for (const k of KEEP) if (patch.o[k]) o[k] = patch.o[k]
          const st = o.settings
          if (st && 'o' in st) { delete st.o.invoiceNo; delete st.o.hr }
          patch = { o, d: [] }
        }
        return applyNode(base, patch, '') as Db
      }
    }
  } catch {
    /* defekte Daten → Demodaten */
  }
  return base
}

let timer: ReturnType<typeof setTimeout> | null = null
let pending: Db | null = null
function flush() {
  timer = null
  if (!pending || !base) return
  const db = pending
  pending = null
  try {
    const patch = diffNode(base, db, '')
    if (!patch) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, JSON.stringify({ v: DB_VERSION, on: todayISO(), patch }))
  } catch {
    /* Speicher voll / gesperrt – Daten bleiben im Arbeitsspeicher */
  }
}
export function save(db: Db) {
  pending = db
  if (!timer) timer = setTimeout(flush, 300)
}
export const flushNow = flush
if (typeof window !== 'undefined') window.addEventListener('pagehide', flush)

export function reset(): Db {
  try { localStorage.removeItem(KEY) } catch { /* ignorieren */ }
  pending = null
  base = seed()
  return base
}
