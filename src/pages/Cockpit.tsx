import { useState } from 'react'
import { actions, useDb } from '../data/repository'
import { STATE_NAMES } from '../data/stores'
import { go } from '../lib/router'
import { todayISO } from '../lib/date'
import { fmtDate } from '../lib/format'
import { invoiceState } from '../logic/invoice'
import { inventoryState } from '../logic/inventory'
import { openCases, storeLight, storesWithDeviation, type Case } from '../logic/cases'
import { storeKpi } from '../logic/kpi'
import { Icon, type IconName } from '../icons'
import { Btn, Card, useToast } from '../ui/kit'
import { hqSignals } from '../logic/hqSignals'
import { CountChip, IconTile, LegendLink, Signal, SignalChip, type Level } from '../ui/signal'
import { ART_ICON, ART_LABEL } from '../logic/meldungen'
import { RevenueCostCard } from './RevenueCost'

const COLOR = { green: 'var(--ok)', yellow: 'var(--warn)', red: 'var(--bad)' }

/** Einfache Aktions-Buttons je Fall */
export function CaseActions({ c, compact }: { c: Case; compact?: boolean }) {
  const toast = useToast()
  const db = useDb()
  const pending = db.requests.find((r) => r.storeId === c.storeId && !r.doneOn)
  const sonder = () => { actions.requestFromStore(c.storeId, 'sonder-inventur'); actions.updateCase(c.storeId, c.kind, { status: 'in Klärung', note: 'Sonder-Inventur angefordert.' }); toast('Sonder-Inventur angefordert – sie erscheint beim Laden als fällige Inventur') }
  const remind = () => { actions.requestFromStore(c.storeId, 'erinnerung'); toast('Erinnerung gesendet – sie erscheint beim Laden als Alarm') }
  return (
    <span className="row wrap" style={{ gap: 8 }}>
      {c.kind === 'ueberfaellig'
        ? <Btn size="sm" kind="primary" icon="bell" disabled={!!pending} onClick={remind}>{pending ? 'Erinnerung gesendet' : 'Erinnerung senden'}</Btn>
        : <Btn size="sm" kind="primary" icon="inventory" disabled={db.requests.some((r) => r.storeId === c.storeId && r.kind === 'sonder-inventur' && !r.doneOn)} onClick={sonder}>Sonder-Inventur anfordern</Btn>}
      {!compact && <Btn size="sm" kind="glass" onClick={() => go(`/zentrale/laeden/${c.storeId}`)}>Kontroll-Ansicht</Btn>}
      <Btn size="sm" kind="glass" onClick={() => go(`/zentrale/fall/${c.storeId}/${c.kind}`)}>Meldung öffnen</Btn>
    </span>
  )
}

export function CockpitPage() {
  const db = useDb()
  const today = todayISO()
  const hs = hqSignals(db, today)
  const worst = hs.lamps.filter((l) => l.level !== 'gruen')
  const ok = hs.lamps.length - worst.length
  const [all, setAll] = useState(false)
  const lamps = all ? hs.lamps : hs.lamps.slice(0, 8)
  return (
    <>
      <div className="page-head">
        <div>
          <div className="cap">HQ</div>
          <h1>HQ-Cockpit</h1>
          <p className="hint">Welcher Laden braucht heute das HQ? Die Läden mit Problemen stehen oben.</p>
          <LegendLink />
        </div>
      </div>
      <div className="stack">
        <div className="cp-top">
          <RevenueCostCard />
          <MeldungenCard />
        </div>
        <Card title={`${hs.lamps.length} Läden im Überblick`} tour="kpis" right={<span className="muted small">{ok} in Ordnung · {worst.length} mit Hinweis</span>}>
          <div className="lamps">
            {lamps.map((l) => (
              <button key={l.storeId} className={`lamp tint-${l.level}`} onClick={() => go(`/zentrale/laeden/${l.storeId}`)}>
                <IconTile icon="stores" level={l.level} />
                <div className="lamp-main"><b title={l.name}>{l.name.replace('Frozen Yoghurt ', '')}</b><span title={l.sentence}>{l.sentence}</span></div>
              </button>
            ))}
          </div>
          {hs.lamps.length > 8 && <Btn kind="ghost" size="sm" onClick={() => setAll(!all)} style={{ marginTop: 10 }}>{all ? 'Weniger anzeigen' : `Alle ${hs.lamps.length} Läden anzeigen`}</Btn>}
        </Card>
      </div>
    </>
  )
}

/** Meldungen im Cockpit: die wichtigsten offenen, mit Art, Laden und Datum */
function MeldungenCard() {
  const db = useDb()
  const today = todayISO()
  const open = openCases(db, today)
  const name = (id: string) => db.stores.find((s) => s.id === id)?.name ?? id
  const red = open.filter((c) => c.level === 'red').length
  const stLevel = (c: Case): Level => (c.level === 'red' ? 'rot' : 'bernstein')
  return (
    <section className="glass card in tasks-card" data-tour="attention">
      <div className="tasks-head">
        <Signal level={red ? 'rot' : open.length ? 'bernstein' : 'gruen'} size={44} pulse />
        <div className="tasks-head-text">
          <h2>{open.length === 0 ? 'Keine offenen Meldungen' : `${open.length} offene ${open.length === 1 ? 'Meldung' : 'Meldungen'}`}</h2>
          <div className="tasks-counts"><CountChip level="rot" n={red} word="dringend" /><CountChip level="bernstein" n={open.length - red} word="bald" /></div>
        </div>
        <Btn kind="glass" size="sm" className="no-print" onClick={() => go('/zentrale/meldungen')} style={{ marginLeft: 'auto' }}>Alle Meldungen</Btn>
      </div>
      {open.length === 0 && <p className="tasks-empty"><Signal level="gruen" size={22} /> Alle Läden sind in Ordnung.</p>}
      <div className="task-group">
        {open.slice(0, 5).map((c) => (
          <div key={c.id} className={`task-row tint-${stLevel(c)}`} role="button" tabIndex={0} onClick={() => go(`/zentrale/fall/${c.storeId}/${c.kind}`)} onKeyDown={(e) => e.key === 'Enter' && go(`/zentrale/fall/${c.storeId}/${c.kind}`)} data-task={c.id}>
            <IconTile icon={ART_ICON[c.art]} level={stLevel(c)} />
            <div className="task-main"><b title={name(c.storeId)}>{name(c.storeId)}</b><span className="mchips"><span className="art-chip">{ART_LABEL[c.art]}</span>{c.auto && <span className="art-chip auto">automatisch erkannt</span>}<span className="faint small">{fmtDate(c.createdOn)}</span></span></div>
            <SignalChip level={stLevel(c)}>{c.status === 'offen' ? 'Offen' : 'In Klärung'}</SignalChip>
            <span className="task-go" aria-hidden><Icon name="arrow" size={18} /></span>
          </div>
        ))}
      </div>
    </section>
  )
}
