import type { CaseNote, CaseStatus, Db } from '../data/types'
import { fmtDate, fmtPct } from '../lib/format'
import { todayISO } from '../lib/date'
import type { Light } from './forecast'
import { inventoriesOf, countedLate, stichtagOf, groupDiffs, monthlyOf, inventoryState, invDiffLight, monthLabel, worstPct } from './inventory'
import { storeShrinkage } from './shrinkage'
import { CHECK_TITLES, storeChecks, type CheckKind } from './checks'
import { DEMO_STORES, TOUR_STORE } from '../data/stores'
import { ART_LABEL, artOfKind, type ReportArt } from './meldungen'
import { addDays } from '../lib/date'
import { hash01 } from '../data/seedHr'
import { dueReportMonth, reportMismatch } from './finance'
import { invoiceState } from './invoice'
import { dayStaffing } from './staffing'
import { prevMonth, monthOf } from './inventory'

export type CaseKind = 'bezug' | 'inventur' | 'abgang' | 'ueberfaellig' | 'rechnung' | 'unterbesetzung' | 'kassenabw' | 'monatsabschluss' | CheckKind | `r-${string}`
export interface Case {
  id: string
  storeId: string
  kind: CaseKind
  level: Light
  title: string
  text: string
  status: CaseStatus
  notes: CaseNote[]
  resolution?: string
  resolvedOn?: string
  /** Art der Meldung (Chip) */
  art: ReportArt
  /** automatisch erkannt (sonst vom Laden gesendet) */
  auto: boolean
  /** kurze Begründung bei automatisch erkannten Meldungen */
  reason?: string
  createdOn: string
}
const cache = new WeakMap<Db, Map<string, Case[]>>()

/** Meldungen (Auffälligkeiten) werden aus den Daten abgeleitet; Status, Notizen und Begründung stehen in db.cases */
export function storeCases(db: Db, storeId: string, today = todayISO()): Case[] {
  let m = cache.get(db)
  if (!m) cache.set(db, (m = new Map()))
  const ck = `${storeId}|${today}`
  const hit = m.get(ck)
  if (hit) return hit
  const out: Case[] = []
  const rec = (kind: CaseKind) => db.cases.find((c) => c.id === `${storeId}|${kind}`)
  const add = (kind: CaseKind, level: Light, title: string, text: string) => {
    const r = rec(kind)
    out.push({ id: `${storeId}|${kind}`, storeId, kind, level, title, text, status: r?.status ?? 'offen', notes: r?.notes ?? [], resolution: r?.resolution, resolvedOn: r?.resolvedOn, art: artOfKind(kind), auto: true, reason: text, createdOn: addDays(today, -(1 + Math.floor(hash01(`${storeId}${kind}`) * 7))) })
  }
  const sh = storeShrinkage(db, storeId, today)
  if (sh.light !== 'green') {
    const parts: string[] = []
    if (sh.cupsLight !== 'green' && sh.cups) parts.push(`${fmtPct(sh.cups.pct)} Becher`)
    if (sh.powderLight !== 'green' && sh.powder) parts.push(`${fmtPct(sh.powder.pct)} Pulver`)
    add('bezug', sh.light, parts.some((p) => p.includes('Becher')) ? 'Zu viele Becher bezogen' : 'Zu viel Pulver bezogen', `Mehr geliefert, als Kasse, Pauschale und eingetragene Abgänge erklären: ${parts.join(' und ')} unerklärt.`)
  }
  const last = inventoriesOf(db, storeId)[0] ?? null
  const il = invDiffLight(db, last)
  // Monatsinventur: ab 5 % ein Fall; Zwischenzählung: erst bei mehr als 10 %
  if (last && (last.kind === 'sonder' ? il === 'red' : il !== 'green')) {
    const worst = groupDiffs(db, last).sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))[0]
    add('inventur', il, 'Inventur-Differenz', `Bei der ${last.kind === 'sonder' ? `Zwischenzählung vom ${fmtDate(last.date)}` : `Monatsinventur vom ${fmtDate(stichtagOf(last))}${countedLate(last) ? ` (gezählt am ${fmtDate(last.date)})` : ''}`} wurde bei ${worst.label} ${fmtPct(Math.abs(worst.pct))} ${worst.pct < 0 ? 'weniger' : 'mehr'} gezählt, als da sein sollte (größter Unterschied ${fmtPct(worstPct(db, last))}).`)
  }
  const mm = reportMismatch(db, storeId, prevMonth(monthOf(today)), today)
  if (mm !== null && Math.abs(mm) > 2) add('kassenabw', Math.abs(mm) > 5 ? 'red' : 'yellow', 'Kassenabweichung', `Die Monatsmeldung weicht um ${fmtPct(Math.abs(mm))} vom Kassenumsatz ab.`)
  const dueM = dueReportMonth(db, storeId, today)
  if (dueM) add('monatsabschluss', 'yellow', 'Monatsabschluss überfällig', `Der Monatsabschluss ${monthLabel(dueM)} fehlt noch.`)
  const lateInv = db.invoices.filter((i) => i.storeId === storeId && invoiceState(i, today) === 'überfällig')
  const lateSum = lateInv.reduce((n, i) => n + i.net, 0)
  if (lateInv.length && lateSum > 16000) add('rechnung', 'red', 'Rechnung überfällig', `${lateInv.length} ${lateInv.length === 1 ? 'Rechnung ist' : 'Rechnungen sind'} überfällig (zusammen ${Math.round(lateSum).toLocaleString('de-DE')} € netto).`)
  const gapDays = Array.from({ length: 7 }, (_, i) => dayStaffing(db, storeId, addDays(today, i), today).gaps.length).filter((n) => n > 0).length
  if (gapDays >= 3 && storeId === TOUR_STORE) add('unterbesetzung', 'yellow', 'Unterbesetzung', `An ${gapDays} der nächsten 7 Tage ist der Dienstplan nicht besetzt.`)
  for (const rp of db.reports) {
    if (rp.storeId !== storeId) continue
    const kind = `r-${rp.id}` as const
    const r = rec(kind)
    out.push({ id: `${storeId}|${kind}`, storeId, kind, level: rp.art === 'stoerung' ? 'red' : 'yellow', title: ART_LABEL[rp.art], text: rp.text, status: r?.status ?? 'offen', notes: r?.notes ?? [], resolution: r?.resolution, resolvedOn: r?.resolvedOn, art: rp.art, auto: false, createdOn: rp.createdOn })
  }
  const un = sh.unusualOutflows
  if (un.length) {
    const lvl: Light = un.length >= 3 ? 'red' : 'yellow'
    add('abgang', lvl, 'Auffälliger sonstiger Abgang', `${un.length} Abgänge ohne Kasse im letzten Monat, zuletzt: ${un[un.length - 1].outflow.label} (${un[0].reason}).`)
  }
  if (inventoryState(db, storeId, today).status === 'überfällig') add('ueberfaellig', 'yellow', 'Inventur überfällig', `Die Monatsinventur ${monthLabel(inventoryState(db, storeId, today).period)} wurde bis zum 3. des Folgemonats nicht gezählt.`)
  // Weitere Prüfungen des Warenabgleichs: Meldungen nur für die fiktiven Demo-Läden (echte Läden zeigen höchstens Hinweise auf der Seite Warenabgleich)
  if (DEMO_STORES.includes(storeId)) {
    for (const c of storeChecks(db, storeId, today)) if (c.light !== 'green') add(c.kind, c.light, c.title, `${c.text} (${c.value})`)
  }
  // Je Laden und Art eine Meldung: die schwerste, die übrigen stehen im Text
  const rank = { red: 0, yellow: 1, green: 2 } as const
  const merged: Case[] = []
  for (const c of out) {
    const same = !c.auto ? undefined : merged.find((x) => x.auto && x.art === c.art)
    if (!same) { merged.push(c); continue }
    const [first, other] = rank[c.level] < rank[same.level] ? [c, same] : [same, c]
    merged[merged.indexOf(same)] = { ...first, text: `${first.text} Außerdem: ${other.title}.`, reason: `${first.reason ?? first.text}`.slice(0, 200) }
  }
  m.set(ck, merged)
  return merged
}
/** Alle noch nicht erledigten Meldungen, schwerste zuerst */
export function openCases(db: Db, today = todayISO()): Case[] {
  const rank = { red: 0, yellow: 1, green: 2 } as const
  const st = { offen: 0, 'in Klärung': 1, geklärt: 2 } as const
  return db.stores.flatMap((s) => storeCases(db, s.id, today)).filter((c) => c.status !== 'geklärt' && c.level !== 'green')
    .sort((a, b) => rank[a.level] - rank[b.level] || st[a.status] - st[b.status] || a.storeId.localeCompare(b.storeId))
}
/** Läden mit echter Abweichung (ohne bloße „Inventur überfällig“-Hinweise) */
export const storesWithDeviation = (db: Db, today = todayISO()) => new Set(openCases(db, today).filter((c) => c.kind !== 'ueberfaellig').map((c) => c.storeId))

/** Gesamtampel eines Ladens aus seinen offenen Meldungen */
export function storeLight(db: Db, storeId: string, today = todayISO()): Light {
  const open = storeCases(db, storeId, today).filter((c) => c.status !== 'geklärt')
  return open.some((c) => c.level === 'red') ? 'red' : open.length ? 'yellow' : 'green'
}
export const CASE_ACTIONS: Record<string, string> = {
  kassenabw: 'Gemeldeter Monatsumsatz passt nicht zum Kassenumsatz',
  monatsabschluss: 'Der Monatsabschluss wurde noch nicht gemeldet',
  rechnung: 'Mindestens eine Rechnung ist überfällig',
  unterbesetzung: 'Der Dienstplan hat über mehrere Tage Lücken',
  bezug: 'Zu viel Ware bezogen im Vergleich zur Kasse',
  inventur: 'Gezählt wurde weniger, als da sein sollte',
  abgang: 'Ungewöhnlich viele Abgänge ohne Kasse',
  ueberfaellig: 'Monatsinventur fehlt',
  pulver: 'Mehr Pulver verbraucht, als pro Becher vorgesehen',
  groessen: 'Verbrauchte Bechergrößen passen nicht zu den verkauften',
  zubehoer: 'Zubehör pro Becher über dem Normalwert',
  mehrverkauf: 'Kasse zeigt mehr Becher, als geliefert wurden',
  prognose: 'Deutlich weniger Verkäufe als an vergleichbaren Tagen',
  invdisz: 'Monatsinventuren verspätet oder häufig korrigiert',
  kasse: 'Auffälliges Kassen-Muster (Storno, Rabatte, Bon-Lücken)',
}
