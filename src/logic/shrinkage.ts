import type { Db, Outflow } from '../data/types'
import { addDays, range, todayISO } from '../lib/date'
import { CUP_IDS, POWDER_ID, type Light } from './forecast'
import { deliveredOn, kasseOn, outflowOn, shrinkRate } from './stock'

export { CUP_IDS, POWDER_ID }
export const WINDOW_WEEKS = 6

export interface Flow {
  /** Zeitraum (erste bis letzte Lieferung im Fenster) */
  from: string
  to: string
  delivered: number
  sold: number
  pauschale: number
  outflows: number
  unexplained: number
  /** unerklärt in % der Lieferungen */
  pct: number
}

/**
 * Warenabgleich: Unerklärt = Geliefert − Verkauft laut Kasse − Schwund-Pauschale − sonstige Abgänge.
 * Lieferungen kommen stoßweise; deshalb Zeitraum von der ersten bis zur letzten Lieferung im Fenster
 * (alles, was vor der letzten Lieferung ankam, wird dem Verkauf bis dahin gegenübergestellt).
 */
export function flow(db: Db, storeId: string, ids: string[], weeks = WINDOW_WEEKS, today = todayISO()): Flow | null {
  const parts = ids.map((id) => flowOne(db, storeId, id, weeks, today)).filter((p): p is Flow => !!p)
  if (!parts.length) return null
  const sum = (k: 'delivered' | 'sold' | 'pauschale' | 'outflows') => parts.reduce((s, p) => s + p[k], 0)
  const delivered = sum('delivered')
  const sold = sum('sold')
  const pauschale = sum('pauschale')
  const outflows = sum('outflows')
  const unexplained = delivered - sold - pauschale - outflows
  return {
    from: parts.map((p) => p.from).sort()[0], to: parts.map((p) => p.to).sort().reverse()[0],
    delivered, sold, pauschale, outflows, unexplained, pct: (unexplained / delivered) * 100,
  }
}

/** Ein Artikel: Zeitraum von der ersten bis zur letzten Lieferung im Fenster (Lagerbestand hebt sich so weitgehend auf) */
export function flowOne(db: Db, storeId: string, id: string, weeks: number, today: string): Flow | null {
  const winStart = addDays(today, -weeks * 7)
  const dates = [...new Set(db.deliveries.filter((d) => d.storeId === storeId && d.articleId === id && d.date <= today).map((d) => d.date))].sort()
  const before = dates.filter((d) => d <= winStart)
  const startDate = before.length ? before[before.length - 1] : dates[0]
  if (!startDate) return null
  const inWin = dates.filter((d) => d >= startDate)
  if (inWin.length < 2) return null
  const d1 = inWin[0]
  const dn = inWin[inWin.length - 1]
  let delivered = 0
  let sold = 0
  let outflows = 0
  for (const d of range(d1, addDays(dn, -1))) {
    delivered += deliveredOn(db, storeId, id, d)
    sold += kasseOn(db, storeId, id, d)
    outflows += outflowOn(db, storeId, id, d)
  }
  if (delivered <= 0) return null
  const pauschale = delivered * shrinkRate(db, id)
  const unexplained = delivered - sold - pauschale - outflows
  return { from: d1, to: dn, delivered, sold, pauschale, outflows, unexplained, pct: (unexplained / delivered) * 100 }
}

export const lightFor = (db: Db, pct: number | null): Light =>
  pct === null || pct <= db.settings.greenUntil ? 'green' : pct <= db.settings.yellowUntil ? 'yellow' : 'red'
const worst = (...l: Light[]): Light => (l.includes('red') ? 'red' : l.includes('yellow') ? 'yellow' : 'green')

export interface StoreShrinkage {
  storeId: string
  cups: Flow | null
  powder: Flow | null
  cupsLight: Light
  powderLight: Light
  light: Light
  /** Hinweistext in einem Satz (neutral formuliert) */
  sentence: string
  trend: { x: string; y: number }[]
  unusualOutflows: UnusualOutflow[]
}

function sentenceFor(light: Light, cups: Flow | null, powder: Flow | null): string {
  const pc = (n: number) => `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(n)} %`
  if (light === 'green') return 'Lieferungen und Kassenverkäufe passen zusammen – die Abweichung liegt im üblichen Rahmen.'
  const parts: string[] = []
  if (cups && cups.pct > 0) parts.push(`rund ${pc(cups.pct)} mehr Becher`)
  if (powder && powder.pct > 0) parts.push(`rund ${pc(powder.pct)} mehr Pulver`)
  return `Hier wurden ${parts.join(' und ') || 'mehr Ware'} geliefert, als Kasse, übliche Pauschale und eingetragene Abgänge erklären. Das ist ein Hinweis zum Nachfragen, kein Urteil.`
}

const ABOVE = (pct: number | null, db: Db) => pct !== null && pct > db.settings.greenUntil

const shrinkCache = new WeakMap<Db, Map<string, StoreShrinkage>>()
export function storeShrinkage(db: Db, storeId: string, today = todayISO()): StoreShrinkage {
  let sm = shrinkCache.get(db)
  if (!sm) shrinkCache.set(db, (sm = new Map()))
  const ck = `${storeId}|${today}`
  const hit = sm.get(ck)
  if (hit) return hit
  const res = storeShrinkageRaw(db, storeId, today)
  sm.set(ck, res)
  return res
}
function storeShrinkageRaw(db: Db, storeId: string, today: string): StoreShrinkage {
  const cups = flow(db, storeId, CUP_IDS, WINDOW_WEEKS, today)
  const powder = flow(db, storeId, [POWDER_ID], WINDOW_WEEKS, today)
  const cupsLight = lightFor(db, cups?.pct ?? null)
  const powderLight = lightFor(db, powder?.pct ?? null)
  const light = worst(cupsLight, powderLight)
  return {
    storeId, cups, powder, cupsLight, powderLight, light,
    sentence: sentenceFor(light, ABOVE(cups?.pct ?? null, db) ? cups : null, ABOVE(powder?.pct ?? null, db) ? powder : null),
    trend: rollingMehrbezug(db, storeId, CUP_IDS, 35, today),
    unusualOutflows: unusualOutflows(db, storeId, today),
  }
}

/** Rollierender Mehrbezug (unerklärt in %) der Becher, täglich über die letzten Tage; leicht geglättet */
export function rollingMehrbezug(db: Db, storeId: string, ids: string[], days = 35, today = todayISO()) {
  const raw: { x: string; y: number | null }[] = []
  for (let i = days; i >= 0; i--) {
    const t = addDays(today, -i)
    raw.push({ x: t, y: flow(db, storeId, ids, WINDOW_WEEKS, t)?.pct ?? null })
  }
  let last: number | null = null
  const filled = raw.map((p) => {
    if (p.y !== null) last = p.y
    return { x: p.x, y: last }
  })
  const pts = filled.filter((p): p is { x: string; y: number } => p.y !== null)
  return pts.map((p, i) => {
    const win = pts.slice(Math.max(0, i - 4), i + 1)
    return { x: p.x, y: win.reduce((s, q) => s + q.y, 0) / win.length }
  })
}

/* ---------- Sonstige Abgänge ---------- */
export interface UnusualOutflow {
  outflow: Outflow
  reason: string
}
const groupOf = (id: string) => (CUP_IDS.includes(id) ? 'becher' : id)
const groupIds = (db: Db, g: string) => (g === 'becher' ? CUP_IDS : db.articles.filter((a) => a.id === g).map((a) => a.id))

/** Auffällig: Summe je Artikelgruppe > 2 % der Lieferungen der letzten 30 Tage oder 3 und mehr Einträge */
export function unusualOutflows(db: Db, storeId: string | null, today = todayISO()): UnusualOutflow[] {
  const from = addDays(today, -30)
  const out: UnusualOutflow[] = []
  const stores = storeId ? [storeId] : db.stores.map((s) => s.id)
  for (const sid of stores) {
    const mine = db.outflows.filter((o) => o.storeId === sid && o.date >= from)
    const groups = new Map<string, Outflow[]>()
    for (const o of mine) groups.set(groupOf(o.articleId), [...(groups.get(groupOf(o.articleId)) ?? []), o])
    for (const [g, list] of groups) {
      let delivered = 0
      for (const id of groupIds(db, g)) for (const d of range(from, today)) delivered += deliveredOn(db, sid, id, d)
      const sum = list.reduce((s, o) => s + o.qty, 0)
      const share = delivered > 0 ? (sum / delivered) * 100 : 0
      const many = list.length >= 3
      if (share > 2 || many) {
        const reason = share > 2 ? `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(share)} % der Lieferungen im letzten Monat` : `${list.length} Einträge im letzten Monat`
        for (const o of list) out.push({ outflow: o, reason })
      }
    }
  }
  return out
}
export const isUnusual = (list: UnusualOutflow[], id: string) => list.find((u) => u.outflow.id === id)?.reason ?? null

export const cupsSoldBetween = (db: Db, storeId: string, from: string, to: string) =>
  db.saleDays.filter((d) => d.storeId === storeId && d.date >= from && d.date <= to).reduce((s, d) => s + Object.values(d.counts).reduce((a, b) => a + b, 0), 0)
