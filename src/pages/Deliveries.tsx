import { useState } from 'react'
import { actions, useDb } from '../data/repository'
import { TOUR_STORE } from '../data/stores'
import { addDays, todayISO } from '../lib/date'
import { go } from '../lib/router'
import { fmtDate, fmtEUR } from '../lib/format'
import { packLabel, packsOf } from '../logic/invoice'
import { Btn, Card, Empty, NumInput, PageHead, Pill, useToast } from '../ui/kit'
import { CoSteps, coNet, storeName } from '../ui/misc'

export function DeliveriesPage() {
  const db = useDb()
  const toast = useToast()
  const today = todayISO()
  const yo = db.articles.filter((a) => a.source === 'zentrale')
  const [storeId, setStoreId] = useState(db.stores[0].id)
  const [articleId, setArticleId] = useState(yo[0]?.id ?? '')
  const [packs, setPacks] = useState(1)
  const [date, setDate] = useState(today)
  const [filter, setFilter] = useState('alle')
  const rows = db.centralOrders
    .filter((c) => ['versendet', 'geliefert', 'berechnet'].includes(c.status) && (filter === 'alle' || c.storeId === filter) && (c.shippedOn ?? '') >= addDays(today, -60))
    .sort((a, b) => (b.shippedOn ?? '').localeCompare(a.shippedOn ?? '') || b.no.localeCompare(a.no))
    .slice(0, 40)
  const art = (id: string) => db.articles.find((a) => a.id === id)!
  const a = db.articles.find((x) => x.id === articleId)
  const devs = (coId: string) => db.deliveries.filter((d) => d.coId === coId && d.deviation)
  return (
    <>
      <PageHead title="Lieferungen" hint="Hier steht, was an die Läden geliefert wurde – mit Versanddienstleister und Sendungsnummer, die Grundlage des Warenabgleichs und der Rechnung. Aus einer Lieferung wird mit einem Klick eine Rechnung." />
      <div className="stack">
        <Card title="Gelieferte Bestellungen" i={0} tour="deliveries" right={
          <select className="select" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filiale filtern">
            <option value="alle">Alle Filialen</option>
            {db.stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>}>
          {rows.length === 0 ? <Empty icon="box">Keine Lieferungen.</Empty> : (
            <table className="tbl">
              <thead><tr><th>Bestellung</th><th>Versand</th><th>Laden</th><th>Sendung</th><th>Positionen</th><th className="r">Netto</th><th>Status</th><th className="r" /></tr></thead>
              <tbody>
                {rows.map((c) => {
                  const dv = devs(c.id)
                  return (
                    <tr key={c.id} data-tour={c.storeId === TOUR_STORE && c.shippedOn === today && !c.invoiceId ? 'delivery-new' : undefined}>
                      <td className="strong">{c.no}</td>
                      <td>{c.shippedOn ? fmtDate(c.shippedOn) : '–'}</td>
                      <td>{storeName(db, c.storeId)}</td>
                      <td className="small">{c.carrier ? <>{c.carrier}<div className="muted mono">{c.trackingNo}</div>{c.etaDate && c.status === 'versendet' && <div className="faint">erwartet {fmtDate(c.etaDate)}</div>}</> : '–'}</td>
                      <td className="muted small">{c.lines.map((l) => `${packsOf(l)} × ${art(l.articleId).name}`).join(', ')}{dv.length > 0 && <div><Pill tone="yellow">Abweichung gemeldet: {dv[0].deviation}</Pill></div>}</td>
                      <td className="r">{fmtEUR(coNet(db, c))}</td>
                      <td><CoSteps status={c.status} /></td>
                      <td className="r"><span className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
                        <Btn size="sm" kind="glass" onClick={() => go(`/zentrale/lieferschein/${c.id}`)}>Lieferschein</Btn>
                        {c.invoiceId
                          ? <Btn size="sm" kind="glass" onClick={() => go(`/zentrale/rechnungen/${c.invoiceId}`)}>Rechnung ansehen</Btn>
                          : <Btn size="sm" kind="primary" icon="invoice" data-tour="invoice-btn" onClick={() => { const id = actions.createInvoice([c.id]); if (id) { toast('Rechnung erstellt'); go(`/zentrale/rechnungen/${id}`) } }}>Rechnung erstellen</Btn>}
                      </span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </Card>
        <Card title="Direktlieferung buchen" i={1}>
          <div className="row wrap" style={{ alignItems: 'flex-end', gap: 16 }}>
            <div className="field"><label>Filiale</label><select className="select" value={storeId} onChange={(e) => setStoreId(e.target.value)}>{db.stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            <div className="field"><label>Artikel</label><select className="select" value={articleId} onChange={(e) => setArticleId(e.target.value)}>{yo.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
            <div className="field"><label>Kartons{a ? ` (${packLabel(a)})` : ''}</label><NumInput value={packs} onChange={(v) => setPacks(Math.round(v))} width={90} /></div>
            <div className="field"><label>Datum</label><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <Btn kind="primary" disabled={!a || packs <= 0 || !date} onClick={() => { actions.bookDelivery(storeId, articleId, packs, date); toast('Direktlieferung gebucht – sie kann jetzt berechnet werden') }}>Buchen</Btn>
          </div>
          <p className="faint small" style={{ marginTop: 10 }}>Für Lieferungen ohne Bestellung (z. B. Nachlieferung). Sie erscheint wie jede Lieferung beim Franchisenehmer als Wareneingang.</p>
        </Card>
      </div>
    </>
  )
}
