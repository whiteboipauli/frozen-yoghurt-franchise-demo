import { useState } from 'react'
import { actions, useDb } from '../data/repository'
import { addDays, todayISO } from '../lib/date'
import { fmtDate, fmtQty, relDay } from '../lib/format'
import { Icon } from '../ui/icons'
import { Btn, Card, Empty, Modal, NumInput, PageHead, Pill, useToast } from '../ui/kit'
import { diffDays } from '../lib/date'

export function ReceivingPage({ storeId }: { storeId: string }) {
  const db = useDb()
  const toast = useToast()
  const today = todayISO()
  const [dev, setDev] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [rcv, setRcv] = useState<Record<string, number>>({})
  const art = (id: string) => db.articles.find((a) => a.id === id)!

  const yoDeliveries = db.deliveries.filter((d) => d.storeId === storeId && d.bookedBy === 'zentrale' && d.date <= today && d.date >= addDays(today, -21)).sort((a, b) => b.date.localeCompare(a.date))
  const yoOpen = db.centralOrders.filter((o) => o.storeId === storeId && (o.status === 'eingegangen' || o.status === 'bestätigt'))
  const topOpen = db.orders.filter((o) => o.storeId === storeId && o.supplier !== 'Zentrale' && o.status === 'bestellt').sort((a, b) => a.expectedOn.localeCompare(b.expectedOn))

  const arriving = db.centralOrders.filter((o) => o.storeId === storeId && o.status === 'versendet').sort((a, b) => (a.etaDate ?? '').localeCompare(b.etaDate ?? ''))
  const copy = (t: string) => { void navigator.clipboard?.writeText(t); toast('Sendungsnummer kopiert') }
  const etaText = (eta?: string) => (!eta ? 'Termin offen' : diffDays(eta, today) <= 0 ? 'Zustellung heute erwartet' : diffDays(eta, today) === 1 ? 'Zustellung morgen erwartet' : `Zustellung am ${fmtDate(eta)} erwartet`)

  return (
    <>
      <PageHead title="Wareneingang" hint="Ist die Lieferung angekommen? Lieferungen der Zentrale bucht das HQ – du bestätigst nur. Topping-Lieferungen buchst du selbst." />
      <div className="stack">
        <div className="arr-list" data-tour="arriving">
          <h2 className="sec-title" style={{ margin: '0 4px' }}>Wird gerade angeliefert</h2>
          {arriving.length === 0 ? <div className="glass arr-card"><span className="muted">Gerade ist keine Lieferung von der Zentrale unterwegs.</span></div> : arriving.map((o) => (
            <div className="glass arr-card" key={o.id}>
              <span className="arr-ico"><Icon name="truck" size={22} stroke={1.7} /></span>
              <div className="arr-cell"><span className="cap">Lieferant</span><b>FY</b></div>
              <div className="arr-cell"><span className="cap">Dienstleister</span><b>{o.carrier ?? '–'}</b></div>
              <div className="arr-cell grow"><span className="cap">Sendungsnummer</span><b className="mono">{o.trackingNo ?? '–'}</b></div>
              {o.trackingNo && <Btn size="sm" kind="glass" icon="copy" onClick={() => copy(o.trackingNo!)}>Kopieren</Btn>}
              <div className="arr-cell"><span className="cap">Voraussichtlich</span><b>{o.etaDate ? fmtDate(o.etaDate) : '–'}</b></div>
              <Pill tone="blue">unterwegs</Pill>
            </div>
          ))}
        </div>
        <h2 className="sec-title">Verlauf</h2>
        <Card title="Lieferungen von der Zentrale" i={1}>
          {yoOpen.length > 0 && (
            <div className="note" style={{ marginBottom: 14 }}>
              <Icon name="truck" />
              <div><b>Beim HQ in Bearbeitung</b>
                {yoOpen.map((o) => <div key={o.id}>{o.no}: {o.lines.map((l) => `${l.confirmed ?? l.packs} × ${art(l.articleId).name}`).join(', ')} – {o.status}, Wunschtermin {relDay(o.wishDate)}</div>)}
              </div>
            </div>
          )}
          {yoDeliveries.length === 0 ? <Empty icon="box">Keine Lieferungen in den letzten 3 Wochen.</Empty> : (
            <table className="tbl">
              <thead><tr><th>Datum</th><th>Artikel</th><th className="r">Menge (vom HQ gebucht)</th><th>Sendung</th><th className="r">Empfang</th></tr></thead>
              <tbody>
                {yoDeliveries.map((d) => (
                  <tr key={d.id}>
                    <td>{fmtDate(d.date)}</td>
                    <td className="strong">{art(d.articleId).name}</td>
                    <td className="r">{fmtQty(art(d.articleId), d.qty)}</td>
                    <td className="small muted">{(() => { const c = db.centralOrders.find((x) => x.id === d.coId); return c?.carrier ? `${c.carrier} · ${c.trackingNo}` : '–' })()}</td>
                    <td className="r">
                      {d.deviation ? <Pill tone="yellow">Abweichung gemeldet</Pill> : d.confirmed ? <Pill tone="green">bestätigt</Pill> : (
                        <span className="row" style={{ justifyContent: 'flex-end' }}>
                          <Btn kind="primary" size="sm" onClick={() => { actions.confirmDelivery(d.id); toast('Empfang bestätigt') }}>Empfang bestätigen</Btn>
                          <Btn size="sm" onClick={() => { setDev(d.id); setText('') }}>Abweichung melden</Btn>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="Topping-Lieferungen buchen" i={2}>
          {topOpen.length === 0 ? <Empty icon="strawberry">Keine offenen Topping-Bestellungen.</Empty> : (
            <div className="stack">
              {topOpen.map((o) => (
                <div key={o.id} className="say">
                  <div className="row between" style={{ marginBottom: 8 }}><b>{o.supplier}</b><span className="small muted">bestellt {fmtDate(o.orderedOn)} · erwartet {relDay(o.expectedOn)}</span></div>
                  <table className="tbl"><tbody>
                    {o.lines.map((l) => (
                      <tr key={l.articleId}>
                        <td className="strong">{art(l.articleId).name}</td>
                        <td className="r muted">bestellt: {l.packs} Pck.</td>
                        <td className="r">erhalten: <NumInput width={64} value={rcv[o.id + l.articleId] ?? l.packs} onChange={(v) => setRcv((x) => ({ ...x, [o.id + l.articleId]: Math.round(v) }))} /> Pck.</td>
                      </tr>
                    ))}
                  </tbody></table>
                  <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
                    <Btn kind="primary" onClick={() => {
                      const by: Record<string, number> = {}
                      o.lines.forEach((l) => (by[l.articleId] = rcv[o.id + l.articleId] ?? l.packs))
                      actions.receiveToppingOrder(o.id, by)
                      toast('Lieferung gebucht')
                    }}>Lieferung buchen</Btn>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
      {dev && (
        <Modal onClose={() => setDev(null)}>
          <h2>Abweichung melden</h2>
          <p className="muted" style={{ margin: '6px 0 16px' }}>Die Menge bleibt wie vom HQ gebucht. Deine Meldung wird dem HQ angezeigt.</p>
          <div className="field"><label>Was weicht ab?</label><textarea className="input" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="z. B. 2 Packungen Becher M fehlen" autoFocus /></div>
          <div className="actions">
            <Btn onClick={() => setDev(null)}>Abbrechen</Btn>
            <Btn kind="primary" disabled={!text.trim()} onClick={() => { actions.reportDeviation(dev, text.trim()); setDev(null); toast('Abweichung gemeldet') }}>Melden</Btn>
          </div>
        </Modal>
      )}
    </>
  )
}
