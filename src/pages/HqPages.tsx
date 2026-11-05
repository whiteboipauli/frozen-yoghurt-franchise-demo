import { useMemo, useState } from 'react'
import { useDb } from '../data/repository'
import { STATE_NAMES } from '../data/stores'
import { go } from '../lib/router'
import { todayISO } from '../lib/date'
import { fmtEUR } from '../lib/format'
import { monthLabel, prevMonth } from '../logic/inventory'
import { storeCases, storeLight } from '../logic/cases'
import { storeMonthFin } from '../logic/finance'
import { ART_LABEL } from '../logic/meldungen'
import { Signal, SignalChip, type Level } from '../ui/signal'
import { Icon } from '../icons'
import { Card, EmbedCtx, PageHead, Pill, Tabs } from '../ui/kit'
import { IncomingPage } from './Incoming'
import { DeliveriesPage } from './Deliveries'
import { InvoicesPage } from './Invoices'
import { FeesPage } from './Fees'
import { CampaignsPage, KnowledgePage, PinnwandHqPage } from './Comms'

const COLOR = { green: 'var(--ok)', yellow: 'var(--warn)', red: 'var(--bad)' }
type Key = 'name' | 'prev' | 'cur' | 'status'

/** Läden: Umsatz Vormonat und laufender Monat, Status mit Ampel und die offenen Meldungen als kleine Chips */
export function LaedenPage() {
  const db = useDb()
  const today = todayISO()
  const [q, setQ] = useState('')
  const [state, setState] = useState('alle')
  const [city, setCity] = useState('alle')
  const [sort, setSort] = useState<{ key: Key; dir: 1 | -1 }>({ key: 'status', dir: -1 })
  const cur = today.slice(0, 7), prev = prevMonth(cur)
  const rank = { red: 2, yellow: 1, green: 0 }
  const rows = useMemo(() => db.stores.map((s) => {
    const light = storeLight(db, s.id, today)
    const open = storeCases(db, s.id, today).filter((c) => c.status !== 'geklärt' && c.level !== 'green')
    return { s, light, open, prev: storeMonthFin(db, s.id, prev, today).revenue, cur: storeMonthFin(db, s.id, cur, today).revenue }
  }), [db, today])
  const states = [...new Set(db.stores.map((s) => s.state))]
  const cities = [...new Set(db.stores.filter((s) => state === 'alle' || s.state === state).map((s) => s.city))].sort((a, b) => a.localeCompare(b, 'de'))
  const list = rows.filter((r) => (state === 'alle' || r.s.state === state) && (city === 'alle' || r.s.city === city) && (!q.trim() || `${r.s.name} ${r.s.city} ${STATE_NAMES[r.s.state]}`.toLowerCase().includes(q.trim().toLowerCase())))
    .sort((a, b) => {
      const d = sort.key === 'name' ? a.s.name.localeCompare(b.s.name, 'de') : sort.key === 'prev' ? a.prev - b.prev : sort.key === 'cur' ? a.cur - b.cur : rank[a.light] - rank[b.light] || a.open.length - b.open.length
      return d * sort.dir || a.s.name.localeCompare(b.s.name, 'de')
    })
  const th = (key: Key, label: string, r = false) => (
    <th className={`${r ? 'r' : ''} sortable`} aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button onClick={() => setSort({ key, dir: sort.key === key ? (sort.dir === 1 ? -1 : 1) : key === 'name' ? 1 : -1 })}>{label}{sort.key === key ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}</button>
    </th>
  )
  const lvl = (l: 'green' | 'yellow' | 'red'): Level => (l === 'red' ? 'rot' : l === 'yellow' ? 'bernstein' : 'gruen')
  return (
    <>
      <PageHead title="Läden" hint="Alle Läden auf einen Blick. Ein Klick öffnet die Kontrollansicht – bei HQ-eigenen Läden den ganzen Laden." />
      <Card tour="stores" title={`${list.length} Läden`}
        right={<div className="row wrap no-print">
          <label className="input search"><Icon name="search" size={16} /><input placeholder="Laden suchen …" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Laden suchen" /></label>
          <select className="select" value={state} onChange={(e) => { setState(e.target.value); setCity('alle') }} aria-label="Bundesland"><option value="alle">Alle Bundesländer</option>{states.map((s) => <option key={s} value={s}>{STATE_NAMES[s]}</option>)}</select>
          <select className="select" value={city} onChange={(e) => setCity(e.target.value)} aria-label="Stadt"><option value="alle">Alle Städte</option>{cities.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        </div>}>
        <div className="table-wrap">
          <table className="tbl store-list">
            <thead><tr>{th('name', 'Laden')}{th('prev', `Umsatz ${monthLabel(prev).split(' ')[0]}`, true)}{th('cur', 'Umsatz laufender Monat (bis heute)', true)}{th('status', 'Status')}<th>Probleme</th></tr></thead>
            <tbody>
              {list.map(({ s, light, open, prev: pr, cur: cu }) => (
                <tr key={s.id} className="clicky" onClick={() => go(`/zentrale/laeden/${s.id}`)} data-store={s.id}>
                  <td className="strong">{s.name}{s.own && <Pill tone="blue"> HQ-eigen</Pill>}</td>
                  <td className="r">{fmtEUR(pr)}</td>
                  <td className="r">{fmtEUR(cu)}</td>
                  <td><SignalChip level={lvl(light)} /></td>
                  <td>
                    <span className="prob-chips">
                      {open.slice(0, 2).map((c) => <button key={c.id} className="art-chip prob" onClick={(e) => { e.stopPropagation(); go(`/zentrale/meldungen/${s.id}~${c.art}`) }} title={`${ART_LABEL[c.art]} – Meldungen dieses Ladens`}><Signal level={c.level === 'red' ? 'rot' : 'bernstein'} size={14} />{ART_LABEL[c.art]}</button>)}
                      {open.length > 2 && <button className="art-chip prob" onClick={(e) => { e.stopPropagation(); go(`/zentrale/meldungen/${s.id}`) }}>+{open.length - 2}</button>}
                      {open.length === 0 && <span className="faint">–</span>}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}

/** Bestellungen: eingehende Bestellungen (bestätigen, versenden) und darunter die Lieferungen */
export function HqBestellungen() {
  return (
    <>
      <PageHead title="Bestellungen" hint="Bestellungen der Läden bestätigen und versenden – die Rechnung entsteht automatisch beim Versand." />
      <div className="stack n-stack">
        <EmbedCtx.Provider value>
          <section><h2 className="n-h2">Eingehende Bestellungen</h2><IncomingPage /></section>
          <section><h2 className="n-h2">Lieferungen</h2><DeliveriesPage /></section>
        </EmbedCtx.Provider>
      </div>
    </>
  )
}

export type FinTab = 'rechnungen' | 'gebuehren'
export function FinanzenPage(_p: { tab: FinTab }) {
  return <InvoicesPage mode="zentrale" />
}

export type KommTab = 'pinnwand' | 'aktionen' | 'wissen'
export function KommunikationPage({ tab }: { tab: KommTab }) {
  return (
    <>
      <PageHead title="Kommunikation" hint="Nachrichten, Aktionen und Handbuch für alle Läden." right={
        <Tabs<KommTab> value={tab} onChange={(t) => go(`/zentrale/kommunikation/${t}`)} options={[{ value: 'pinnwand', label: 'Pinnwand' }, { value: 'aktionen', label: 'Aktionskalender' }, { value: 'wissen', label: 'Handbuch' }]} />
      } />
      <EmbedCtx.Provider value>
        {tab === 'pinnwand' && <PinnwandHqPage />}
        {tab === 'aktionen' && <CampaignsPage hq />}
        {tab === 'wissen' && <KnowledgePage hq />}
      </EmbedCtx.Provider>
    </>
  )
}
