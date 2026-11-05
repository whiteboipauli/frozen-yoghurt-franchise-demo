import { useState } from 'react'
import { actions, useDb } from '../data/repository'
import { CARRIERS, type CentralOrder } from '../data/types'
import { makeTracking } from '../logic/shipping'
import { addDays } from '../lib/date'
import { TOUR_STORE } from '../data/stores'
import { todayISO } from '../lib/date'
import { go } from '../lib/router'
import { fmtDate, fmtEUR, relDay } from '../lib/format'
import { packLabel, packsOf } from '../logic/invoice'
import { Btn, Card, Empty, NumInput, PageHead, Pill, useToast } from '../ui/kit'
import { CoSteps, coNet, storeName } from '../ui/misc'

type Adj = Record<string, { packs: number; reason: string }>
type Ship = { carrier: string; trackingNo: string; etaDate: string }

/** HQ: eingehende Bestellungen bestätigen (Mengen anpassbar mit Begründung), versenden, Lieferschein */
export function IncomingPage() {
  const db = useDb()
  const toast = useToast()
  const [filter, setFilter] = useState('alle')
  const [adj, setAdj] = useState<Record<string, Adj>>({})
  const [ship, setShip] = useState<Record<string, Partial<Ship>>>({})
  const shipOf = (o: CentralOrder): Ship => { const c = ship[o.id]?.carrier ?? 'DHL'; return { carrier: c, trackingNo: ship[o.id]?.trackingNo ?? makeTracking(c, o.id), etaDate: ship[o.id]?.etaDate ?? (o.wishDate > todayISO() ? o.wishDate : addDays(todayISO(), 1)) } }
  const setS = (o: CentralOrder, p: Partial<Ship>) => setShip((x) => ({ ...x, [o.id]: { ...shipOf(o), ...x[o.id], ...p, ...(p.carrier && !('trackingNo' in p) && !x[o.id]?.trackingNo ? { trackingNo: undefined } : {}) } }))
  const mine = (o: CentralOrder) => filter === 'alle' || o.storeId === filter
  const open = db.centralOrders.filter((o) => (o.status === 'eingegangen' || o.status === 'bestätigt') && mine(o)).sort((a, b) => a.wishDate.localeCompare(b.wishDate) || a.no.localeCompare(b.no))
  const done = db.centralOrders.filter((o) => !['eingegangen', 'bestätigt'].includes(o.status) && mine(o)).sort((a, b) => b.no.localeCompare(a.no)).slice(0, 8)
  const art = (id: string) => db.articles.find((a) => a.id === id)!
  const changed = (o: CentralOrder) => o.lines.filter((l) => adj[o.id]?.[l.articleId] && adj[o.id][l.articleId].packs !== l.packs)
  const missingReason = (o: CentralOrder) => changed(o).some((l) => !adj[o.id][l.articleId].reason.trim())
  const setLine = (o: CentralOrder, id: string, patch: Partial<Adj[string]>) => setAdj((a) => ({ ...a, [o.id]: { ...a[o.id], [id]: { packs: a[o.id]?.[id]?.packs ?? o.lines.find((l) => l.articleId === id)!.packs, reason: a[o.id]?.[id]?.reason ?? '', ...patch } } }))
  return (
    <>
      <PageHead title="Eingehende Bestellungen" hint="Die Läden bestellen direkt im System. Bestätigen (Mengen anpassbar, dann mit Begründung), mit Versanddienstleister, Sendungsnummer und Lieferdatum als versendet markieren – der Laden sieht das sofort im Wareneingang und bestätigt den Empfang." right={
        <select className="select" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Laden filtern"><option value="alle">Alle Läden</option>{db.stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>} />
      <div className="stack" data-tour="incoming">
        {open.length === 0 && <Card><Empty icon="inbox">Keine offenen Bestellungen.</Empty></Card>}
        {open.map((o, i) => {
          const isNew = o.status === 'eingegangen'
          return (
            <Card key={o.id} i={i} tour={o.storeId === TOUR_STORE && o.createdOn === todayISO() ? 'incoming-new' : undefined}
              title={<>{storeName(db, o.storeId)} <Pill>{o.no}</Pill> <Pill tone="blue">Wunschtermin {relDay(o.wishDate)}</Pill></>}
              right={<span className="small muted">bestellt am {fmtDate(o.createdOn)} · {fmtEUR(coNet(db, o))} netto</span>}>
              <CoSteps status={o.status} />
              {o.note && <p className="muted" style={{ margin: '10px 0 0' }}>Bemerkung: {o.note}</p>}
              <table className="tbl" style={{ marginTop: 10 }}>
                <thead><tr><th>Artikel</th><th className="r">bestellt</th><th className="r">{isNew ? 'bestätigen' : 'bestätigt'}</th>{isNew && <th>Begründung bei Änderung</th>}<th className="r">Netto</th></tr></thead>
                <tbody>
                  {o.lines.map((l) => {
                    const a = art(l.articleId)
                    const cur = adj[o.id]?.[l.articleId]?.packs ?? l.packs
                    return (
                      <tr key={l.articleId}>
                        <td className="strong">{a.name}<div className="faint small">{packLabel(a)}</div></td>
                        <td className="r">{l.packs}</td>
                        <td className="r">{isNew ? <NumInput width={64} value={cur} min={0} onChange={(v) => setLine(o, l.articleId, { packs: Math.round(v) })} /> : <b>{packsOf(l)}</b>}</td>
                        {isNew && <td>{cur !== l.packs ? <input className="input" style={{ width: 220 }} placeholder="Begründung (Pflicht)" value={adj[o.id]?.[l.articleId]?.reason ?? ''} onChange={(e) => setLine(o, l.articleId, { reason: e.target.value })} /> : <span className="faint">–</span>}</td>}
                        <td className="r">{fmtEUR((isNew ? cur : packsOf(l)) * a.packPrice)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {!isNew && (() => { const sh = shipOf(o); return (
                <div className="ship-form" data-tour="ship-form">
                  <div className="cap">Versand</div>
                  <div className="row wrap" style={{ alignItems: 'flex-end', gap: 14 }}>
                    <div className="field"><label>Versanddienstleister</label><select className="select" value={sh.carrier} onChange={(e) => setS(o, { carrier: e.target.value, trackingNo: makeTracking(e.target.value, o.id) })}>{CARRIERS.map((c) => <option key={c}>{c}</option>)}</select></div>
                    <div className="field" style={{ flex: 1, minWidth: 200 }}><label>Sendungsnummer</label><input className="input wide mono" value={sh.trackingNo} onChange={(e) => setS(o, { trackingNo: e.target.value })} /></div>
                    <div className="field"><label>Voraussichtliches Lieferdatum</label><input type="date" className="input" min={todayISO()} value={sh.etaDate} onChange={(e) => setS(o, { etaDate: e.target.value })} /></div>
                  </div>
                </div>
              ) })()}
              <div className="row" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
                <Btn kind="glass" icon="print" onClick={() => go(`/zentrale/lieferschein/${o.id}`)}>Lieferschein</Btn>
                {isNew
                  ? <Btn kind="primary" icon="check" data-tour="confirm-btn" disabled={missingReason(o)} onClick={() => { actions.confirmCentralOrder(o.id, adj[o.id] ?? {}); toast('Bestellung bestätigt') }}>Bestätigen</Btn>
                  : <Btn kind="primary" icon="truck" data-tour="ship-btn" disabled={!shipOf(o).trackingNo.trim() || !shipOf(o).etaDate} onClick={() => { actions.shipCentralOrder(o.id, shipOf(o)); toast('Als versendet markiert – der Laden sieht Sendungsnummer und Wareneingang') }}>Als versendet markieren</Btn>}
              </div>
            </Card>
          )
        })}
        {done.length > 0 && (
          <Card title="Zuletzt bearbeitet" i={open.length}>
            <table className="tbl"><tbody>
              {done.map((o) => <tr key={o.id}><td className="strong">{o.no}</td><td>{fmtDate(o.shippedOn ?? o.createdOn)}</td><td>{storeName(db, o.storeId)}</td><td className="small muted">{o.carrier ? `${o.carrier} · ${o.trackingNo}` : '–'}</td><td className="muted">{o.lines.map((l) => `${packsOf(l)} × ${art(l.articleId).name}`).join(', ')}</td><td className="r"><Pill tone={o.status === 'berechnet' ? 'green' : o.status === 'geliefert' ? 'blue' : 'yellow'}>{o.status}</Pill></td></tr>)}
            </tbody></table>
          </Card>
        )}
      </div>
    </>
  )
}
