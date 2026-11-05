import type { Db } from '../data/types'
import { diffDays, todayISO } from '../lib/date'
import type { IconName } from '../icons'
import { worstLevel, LEVEL_RANK, type Level } from '../ui/signal'
import { openCases, storeCases, type Case } from './cases'
import { ART_ICON, ART_LABEL } from './meldungen'
import { invoiceState } from './invoice'
import type { TaskGroup } from './signals'

export interface HqTask {
  key: string
  level: Level
  group: TaskGroup
  icon: IconName
  title: string
  text: string
  btn: string
  to: string
  nav: string
  time?: { text: string; level?: Level }
  caseOf?: Case
}
export interface StoreLamp { storeId: string; name: string; level: Level; sentence: string; n: number }
export interface HqSignals {
  tasks: HqTask[]
  lamps: StoreLamp[]
  warnings: { key: string; level: Level; text: string; when: string; to: string }[]
  level: Level
  counts: { rot: number; bernstein: number; normal: number }
  nav: Record<string, { level: Level; n: number }>
}

const caseLevel = (c: Case): Level => (c.level === 'red' ? 'rot' : 'bernstein')

export function hqSignals(db: Db, today = todayISO()): HqSignals {
  const name = (id: string) => db.stores.find((s) => s.id === id)?.name ?? id
  const tasks: HqTask[] = []
  const cases = openCases(db, today)
  for (const c of cases) {
    const lvl = caseLevel(c)
    tasks.push({ key: c.id, level: lvl, group: lvl === 'rot' ? 'jetzt' : 'woche', icon: ART_ICON[c.art], title: `${name(c.storeId)}: ${ART_LABEL[c.art]}`, text: c.text, btn: 'Meldung öffnen', to: `/zentrale/fall/${c.storeId}/${c.kind}`, nav: 'meldungen', time: { text: c.status === 'offen' ? 'offen' : c.status, level: c.status === 'offen' ? lvl : undefined }, caseOf: c })
  }
  const late = db.invoices.filter((i) => invoiceState(i, today) === 'überfällig')
  const fresh = db.centralOrders.filter((o) => o.status === 'eingegangen').length
  if (fresh) tasks.push({ key: 'orders-new', level: 'bernstein', group: 'woche', icon: 'paket', title: `${fresh} ${fresh === 1 ? 'neue Bestellung wartet' : 'neue Bestellungen warten'}`, text: 'Bestätigen, dann als versendet markieren – erst dann entsteht die Rechnung.', btn: 'Bestellungen öffnen', to: '/zentrale/bestellungen', nav: 'bestellungen', time: { text: 'wartet' } })
  const rank = (t: HqTask) => ['jetzt', 'woche', 'spaeter'].indexOf(t.group) * 10 - LEVEL_RANK[t.level]
  tasks.sort((a, b) => rank(a) - rank(b))

  const lamps: StoreLamp[] = db.stores.map((s) => {
    const cs = storeCases(db, s.id, today).filter((c) => c.status !== 'geklärt' && c.level !== 'green').sort((a, b) => LEVEL_RANK[caseLevel(b)] - LEVEL_RANK[caseLevel(a)])
    const lv = worstLevel(cs.map(caseLevel))
    return { storeId: s.id, name: s.name, level: lv, sentence: cs[0] ? ART_LABEL[cs[0].art] : 'Alles in Ordnung', n: cs.length }
  }).sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level] || b.n - a.n)

  const warnings: HqSignals['warnings'] = []

  const level = tasks.length ? worstLevel(tasks.map((t) => t.level)) : 'gruen'
  const counts = { rot: tasks.filter((t) => t.level === 'rot').length, bernstein: tasks.filter((t) => t.level === 'bernstein').length, normal: tasks.filter((t) => t.level === 'info').length }
  const nav: HqSignals['nav'] = { cockpit: { level, n: tasks.length } }
  for (const t of tasks) { const c = nav[t.nav]; nav[t.nav] = c ? { level: worstLevel([c.level, t.level]), n: c.n + 1 } : { level: t.level, n: 1 } }
  if (late.length) nav.rechnungen = { level: 'rot', n: late.length }
  const warnLevels = lamps.filter((l) => l.level !== 'gruen')
  if (warnLevels.length) nav.laeden = nav.laeden ?? { level: worstLevel(warnLevels.map((l) => l.level)), n: warnLevels.length }
  return { tasks, lamps, warnings, level, counts, nav }
}
