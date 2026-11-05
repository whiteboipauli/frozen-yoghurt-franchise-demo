import type { Article, Db, HqRequest, Inventory } from '../data/types'
import { addDays, todayISO } from '../lib/date'
import { CUP_IDS, POWDER_ID, type Light } from './forecast'

/** Alle Artikel der Zentrale müssen monatlich gezählt werden; Toppings optional */
export const zentraleArticles = (db: Pick<Db, 'articles'>) => db.articles.filter((a) => a.source === 'zentrale')
export const toppingArticles = (db: Pick<Db, 'articles'>) => db.articles.filter((a) => a.source === 'extern')

export const inventoriesOf = (db: Pick<Db, 'inventories'>, storeId: string): Inventory[] =>
  db.inventories.filter((i) => i.storeId === storeId).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))

/** Zuletzt vom Laden selbst gezählter Wert eines Artikels (Basiseinheit) mit Datum */
export function lastCount(db: Pick<Db, 'inventories'>, storeId: string, articleId: string): { counted: number; date: string } | null {
  for (const inv of inventoriesOf(db, storeId)) {
    const l = inv.lines.find((x) => x.articleId === articleId)
    if (l) return { counted: l.counted, date: inv.date }
  }
  return null
}

/** Grobe Reichweite in Worten (statt genauer rechnerischer Mengen) */
export function roughReach(days: number | null): string {
  if (days === null || days >= 60) return 'reicht noch lange (über 2 Monate)'
  if (days <= 0) return 'reicht nur noch heute'
  if (days <= 2) return 'reicht noch ca. 1–2 Tage'
  if (days <= 5) return 'reicht noch einige Tage'
  if (days <= 10) return 'reicht noch ca. 1 Woche'
  if (days <= 17) return 'reicht noch ca. 2 Wochen'
  if (days <= 24) return 'reicht noch ca. 3 Wochen'
  if (days <= 40) return 'reicht noch ca. 1 Monat'
  return 'reicht noch ca. 2 Monate'
}

/** Kurzform für große Anzeigen: „ca. 1 Woche“ */
export const roughShort = (days: number | null) => roughReach(days).replace(/^reicht (noch )?/, '').replace(/^nur noch heute$/, 'nur heute')

export type InvStatus = 'erledigt' | 'offen' | 'überfällig' | 'noch nicht'
/** Zu zählender Monat: der überfällige/offene Vormonat, sonst der laufende (für das Speichern einer Zählung) */
export const periodToCount = (db: Pick<Db, 'inventories' | 'requests'>, storeId: string, today = todayISO()) => inventoryState(db, storeId, today).period
export interface InvState {
  status: InvStatus
  /** Monat, um den es geht („2026-10“) */
  period: string
  /** Stichtag = letzter Tag des Monats */
  due: string
  /** ab diesem Tag (drittletzter Tag des Monats) kann gezählt werden */
  from: string
  /** spätestens bis hierhin gezählt (3. des Folgemonats), sonst überfällig */
  deadline: string
  last: Inventory | null
  /** Monatsinventur dieses Zeitraums (falls erledigt) */
  doneOn: string | null
  special: HqRequest | null
  reminder: HqRequest | null
}
export const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
export const monthLabel = (ym: string) => `${MONTHS[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}`
export const monthOf = (d: string) => d.slice(0, 7)
export const prevMonth = (ym: string) => (ym.slice(5) === '01' ? `${+ym.slice(0, 4) - 1}-12` : `${ym.slice(0, 5)}${String(+ym.slice(5) - 1).padStart(2, '0')}`)
export const nextMonth = (ym: string) => (ym.slice(5) === '12' ? `${+ym.slice(0, 4) + 1}-01` : `${ym.slice(0, 5)}${String(+ym.slice(5) + 1).padStart(2, '0')}`)
/** Die letzten n Monate bis einschließlich `ym`, neuester zuerst */
export const lastMonthsOf = (ym: string, n: number) => { const out: string[] = []; for (let i = 0, m = ym; i < n; i++, m = prevMonth(m)) out.push(m); return out }
/** Letzter Tag des Monats */
export const monthEnd = (ym: string) => addDays(`${nextMonth(ym)}-01`, -1)
/** Ab wann die Monatsinventur gezählt werden kann: der drittletzte Tag des Monats */
export const countFrom = (ym: string) => addDays(monthEnd(ym), -2)
/** Spätestens bis zum 3. des Folgemonats */
export const countDeadline = (ym: string) => `${nextMonth(ym)}-03`
/** Zu welchem Monat gehört eine Zählung? Ab dem drittletzten Tag zählt sie für den laufenden Monat, bis zum 3. für den Vormonat. */
export function periodOfCount(date: string): string | null {
  const ym = monthOf(date)
  if (date >= countFrom(ym)) return ym
  if (date <= countDeadline(prevMonth(ym))) return prevMonth(ym)
  return null
}
/** Monatsinventuren (ohne Sonder-Inventuren) */
export const monthlyOf = (db: Pick<Db, 'inventories'>, storeId: string) => inventoriesOf(db, storeId).filter((i) => i.kind !== 'sonder')
export const periodOf = (i: Inventory) => i.period ?? periodOfCount(i.date)
/** Stichtag einer Monatsinventur (Monatsletzter) – nie der Zähltag; Sonder-Inventuren behalten ihr Datum */
export const stichtagOf = (i: Inventory) => (i.kind === 'sonder' ? i.date : monthEnd(periodOf(i) ?? monthOf(i.date)))
/** „gezählt am …“, falls nach dem Stichtag gezählt wurde */
export const countedLate = (i: Inventory) => (i.kind !== 'sonder' && i.date > stichtagOf(i) ? i.date : null)
export const inventoryOfPeriod = (db: Pick<Db, 'inventories'>, storeId: string, ym: string) => monthlyOf(db, storeId).find((i) => periodOf(i) === ym) ?? null
/** Die Inventur am 31.12. gilt zugleich als Jahresinventur */
export const isYearEnd = (date: string) => date.slice(5) === '12-31'

/** Monatsinventur: Stichtag ist der letzte Tag des Monats, gezählt werden kann ab dem drittletzten Tag. Überfällig, wenn bis zum 3. des Folgemonats nichts gezählt wurde. */
export function inventoryState(db: Pick<Db, 'inventories' | 'requests'>, storeId: string, today = todayISO()): InvState {
  const cur = monthOf(today), prev = prevMonth(cur)
  const list = inventoriesOf(db, storeId)
  const last = monthlyOf(db, storeId)[0] ?? null
  const open = (k: HqRequest['kind']) => db.requests.find((r) => r.storeId === storeId && r.kind === k && !r.doneOn) ?? null
  const base = { last, special: open('sonder-inventur'), reminder: open('erinnerung') }
  const mk = (period: string, status: InvStatus, doneOn: string | null): InvState => ({ ...base, status, period, due: monthEnd(period), from: countFrom(period), deadline: countDeadline(period), doneOn })
  // Vormonat noch nicht gezählt? Dann ist er offen (bis zum 3.) oder überfällig. Im Datenbestand gibt es nur Zählungen ab dem ersten Datenmonat.
  const prevDone = inventoryOfPeriod(db, storeId, prev)
  const mine = monthlyOf(db, storeId)
  const firstPeriod = mine.length ? periodOf(mine[mine.length - 1]) : null
  if (!prevDone && (firstPeriod === null || prev >= firstPeriod)) return mk(prev, today > countDeadline(prev) ? 'überfällig' : 'offen', null)
  const curDone = inventoryOfPeriod(db, storeId, cur)
  if (curDone) return mk(cur, 'erledigt', curDone.date)
  // Zählung für den Monatsende-Zeitraum ab dem drittletzten Tag
  if (today >= countFrom(cur)) return mk(cur, 'offen', null)
  return mk(cur, 'noch nicht', prevDone?.date ?? null)
}

export interface InvLineDiff { article: Article; counted: number; expected: number; diff: number; pct: number }
const pctOf = (counted: number, expected: number) => ((counted - expected) / Math.max(1, Math.abs(expected))) * 100
/** Toleranz der Inventur in Prozent: darunter „passt“, darüber „bitte nachzählen“ */
export const INV_TOLERANCE = 5
export const INV_GREEN = 5
export const INV_YELLOW = 10
export const invLight = (pct: number): Light => (Math.abs(pct) <= INV_GREEN ? 'green' : Math.abs(pct) <= INV_YELLOW ? 'yellow' : 'red')
const worst = (l: Light[]): Light => (l.includes('red') ? 'red' : l.includes('yellow') ? 'yellow' : 'green')

export interface GroupDiff { key: 'cups' | 'powder' | 'spoon'; label: string; counted: number; expected: number; diff: number; pct: number; light: Light }
/** Differenzen einer Inventur nach Gruppen (Becher gesamt, Pulver, Löffel). Nur für das HQ bestimmt! */
export function groupDiffs(db: Pick<Db, 'articles'>, inv: Inventory | null): GroupDiff[] {
  if (!inv) return []
  const sum = (ids: string[]) => {
    let c = 0, e = 0, n = 0
    for (const l of inv.lines) if (ids.includes(l.articleId)) { c += l.counted; e += Math.max(0, l.expected); n++ }
    return n ? { c, e } : null
  }
  const defs: [GroupDiff['key'], string, string[]][] = [['cups', 'Becher', CUP_IDS], ['powder', 'Pulver', [POWDER_ID]], ['spoon', 'Löffel', ['loeffel']]]
  const out: GroupDiff[] = []
  for (const [key, label, ids] of defs) {
    const s = sum(ids)
    if (!s) continue
    const pct = pctOf(s.c, s.e)
    out.push({ key, label, counted: s.c, expected: s.e, diff: s.c - s.e, pct, light: invLight(pct) })
  }
  return out
}
export function lineDiffs(db: Pick<Db, 'articles'>, inv: Inventory | null): InvLineDiff[] {
  if (!inv) return []
  return inv.lines.flatMap((l) => {
    const article = db.articles.find((a) => a.id === l.articleId)
    return article ? [{ article, counted: l.counted, expected: l.expected, diff: l.counted - l.expected, pct: pctOf(l.counted, l.expected) }] : []
  })
}
export const invDiffLight = (db: Pick<Db, 'articles'>, inv: Inventory | null): Light => worst(groupDiffs(db, inv).map((g) => g.light))
/** Größte Abweichung einer Inventur in % (Betrag) */
export const worstPct = (db: Pick<Db, 'articles'>, inv: Inventory | null) => Math.max(0, ...groupDiffs(db, inv).map((g) => Math.abs(g.pct)))

/** Verlauf: gezählter Bestand je Monat und Gruppe (für das Diagramm der Inventur) */
export function countSeries(db: Pick<Db, 'inventories' | 'articles'>, storeId: string, ids: string[]) {
  return inventoriesOf(db, storeId).slice().reverse().map((inv) => {
    const lines = inv.lines.filter((l) => ids.includes(l.articleId))
    return { inv, date: inv.date, counted: lines.reduce((s, l) => s + l.counted, 0), expected: lines.reduce((s, l) => s + l.expected, 0), has: lines.length > 0 }
  }).filter((p) => p.has)
}
