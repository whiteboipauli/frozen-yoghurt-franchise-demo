import { useEffect, useState } from 'react'
import { actions, useDb } from '../data/repository'
import type { CentralOrder } from '../data/types'
import { cart, useCart } from '../lib/cart'
import { go } from '../lib/router'
import { fmtDate, fmtEUR, relDay } from '../lib/format'
import { packsOf, invoiceState } from '../logic/invoice'
import { Icon } from '../icons'
import { Btn, Card, Empty, Modal, Pill, useToast } from '../ui/kit'
import { coNet, InvoicePill } from '../ui/misc'
import { InvoiceDoc } from '../ui/InvoiceDoc'
import { confirmationNo, OrderDoc } from '../ui/OrderDoc'

const STEPS = ['eingegangen', 'bestätigt', 'versendet', 'geliefert'] as const
const STEP_LABEL = ['Bestellt', 'Bestätigt', 'Versendet', 'Geliefert']
const STEP_ICON = ['rechnung', 'haken-kreis', 'lkw', 'haken'] as const
const stepIdx = (s: CentralOrder['status']) => (s === 'berechnet' ? 3 : STEPS.indexOf(s as (typeof STEPS)[number]))
const stepDate = (o: CentralOrder, i: number) => [o.createdOn, o.confirmedOn, o.shippedOn, o.deliveredOn][i]

/** Status-Kette mit Symbolen: Bestellt, Bestätigt, Versendet (LKW, mit Rechnung und Sendungsnummer), Geliefert (Haken) */
export function OrderTimeline({ o }: { o: CentralOrder }) {
  const now = stepIdx(o.status)
  return (
    <>
      <ol className="otl" aria-label={`Status: ${STEP_LABEL[now]}`}>
        {STEPS.map((s, i) => (
          <li key={s} className={i < now ? 'done' : i === now ? 'now' : ''}>
            <i className="ot-ico"><Icon name={i < now || (i === now && i === 3) ? 'haken' : STEP_ICON[i]} size={18} /></i>
            <b>{STEP_LABEL[i]}</b>
            <span>{stepDate(o, i) && i <= now ? fmtDate(stepDate(o, i)!) : i === 2 && now < 2 ? 'dann kommt die Rechnung' : ''}</span>
          </li>
        ))}
      </ol>
      {now < 2 && <p className="inv-note"><Icon name="info" size={15} />Eine Rechnung gibt es erst, wenn das HQ die Bestellung versendet. Bis dahin gilt die Auftragsbestätigung.</p>}
    </>
  )
}

const isActive = (db: ReturnType<typeof useDb>, o: CentralOrder) =>
  o.status === 'eingegangen' || o.status === 'bestätigt' || o.status === 'versendet' || db.deliveries.some((d) => d.coId === o.id && !d.confirmed)

/** Meine Bestellungen: Karten mit Status-Zeitleiste, Sendungsnummer und Bestätigung direkt an der Karte; darunter die Topping-Bestellungen je Lieferant */
export function MyOrdersPage({ storeId }: { storeId: string }) {
  const db = useDb()
  const toast = useToast()
  const c = useCart()
  const [open, setOpen] = useState<string | null>(null)
  const [dev, setDev] = useState<CentralOrder | null>(null)
  const [text, setText] = useState('')
  const [showDone, setShowDone] = useState(false)
  // Gerade abgesendet: die Auftragsbestätigung erscheint sofort im Vordergrund
  useEffect(() => { if (c.justSent) { setOpen(c.justSent); cart.setSent('') } }, [c.justSent])

  const all = db.centralOrders.filter((o) => o.storeId === storeId).sort((a, b) => b.no.localeCompare(a.no))
  const active = all.filter((o) => isActive(db, o))
  const done = all.filter((o) => !isActive(db, o)).slice(0, 12)
  const top = db.orders.filter((o) => o.storeId === storeId && o.supplier !== 'Headquarter')
  const topOpen = top.filter((o) => o.status === 'bestellt').sort((a, b) => a.expectedOn.localeCompare(b.expectedOn))
  const topDone = top.filter((o) => o.status === 'geliefert').sort((a, b) => (b.deliveredOn ?? '').localeCompare(a.deliveredOn ?? '')).slice(0, 8)
  const cur = all.find((o) => o.id === open)
  const art = (id: string) => db.articles.find((a) => a.id === id)
  const pending = (o: CentralOrder) => db.deliveries.filter((d) => d.coId === o.id && !d.confirmed)
  const copy = (t: string) => { void navigator.clipboard?.writeText(t); toast('Sendungsnummer kopiert') }

  const card = (o: CentralOrder) => {
    const inv = db.invoices.find((i) => i.id === o.invoiceId)
    const wait = pending(o)
    return (
      <div key={o.id} className="card n-order" data-co={o.no}>
        <div className="row between wrap">
          <div><b className="oc-no">{o.no}</b><span className="muted small"> · bestellt am {fmtDate(o.createdOn)}</span></div>
          <b>{fmtEUR(coNet(db, o))} <small className="muted" style={{ fontWeight: 500 }}>netto</small></b>
        </div>
        <OrderTimeline o={o} />
        <p className="muted small oc-lines">{o.lines.map((l) => `${packsOf(l)} × ${art(l.articleId)?.name}`).join(' · ')}</p>
        <div className="row between wrap oc-foot">
          <span className="row" style={{ gap: 8 }}>
            {o.shippedOn ? <><Icon name="truck" size={16} /><span>{o.carrier} · <span className="mono">{o.trackingNo}</span></span>{o.trackingNo && <Btn size="sm" kind="ghost" icon="copy" onClick={() => copy(o.trackingNo!)}>Kopieren</Btn>}</> : <span className="faint">Versand folgt – dann stehen hier Dienstleister und Sendungsnummer.</span>}
          </span>
          <span className="row wrap" style={{ gap: 8 }}>
            {wait.length > 0 && <>
              <Btn kind="primary" onClick={() => { wait.forEach((d) => actions.confirmDelivery(d.id)); toast('Lieferung bestätigt') }}>Lieferung bestätigen</Btn>
              <Btn onClick={() => { setDev(o); setText('') }}>Abweichung melden</Btn>
            </>}
            {inv ? <Btn icon="rechnung" onClick={() => setOpen(o.id)} data-invoice={inv.number}>Rechnung {inv.number}</Btn> : <><span className="muted small">Rechnung folgt nach Versand</span><Btn onClick={() => setOpen(o.id)}>Auftragsbestätigung {confirmationNo(o)}</Btn></>}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="stack n-stack" data-tour="my-orders">
      <section>
        <h2 className="n-h2">Bestellungen beim Headquarter</h2>
        {active.length === 0 ? <Card><Empty icon="box">Gerade ist nichts unterwegs. Neue Bestellungen findest du unter „Artikel“.</Empty></Card> : <div className="order-cards">{active.map(card)}</div>}
      </section>

      <section>
        <h2 className="n-h2">Bestellt bei Lieferanten</h2>
        {topOpen.length === 0 ? <Card><Empty icon="strawberry">Keine offenen Topping-Bestellungen.</Empty></Card> : (
          <div className="order-cards">
            {topOpen.map((o) => (
              <div key={o.id} className="card n-order">
                <div className="row between wrap"><b>{o.supplier}</b><span className="muted small">bestellt am {fmtDate(o.orderedOn)} · erwartet {relDay(o.expectedOn)}</span></div>
                <p className="oc-lines">{o.lines.map((l) => `${l.packs} × ${art(l.articleId)?.name}`).join(' · ')}</p>
                <div className="row" style={{ justifyContent: 'flex-end' }}><Btn icon="check" onClick={() => { actions.receiveToppingOrder(o.id); toast(`${o.supplier}: Lieferung abgehakt`) }}>Geliefert</Btn></div>
              </div>
            ))}
          </div>
        )}
      </section>

      {(done.length > 0 || topDone.length > 0) && (
        <Card className="done-card">
          <button className="done-head" aria-expanded={showDone} onClick={() => setShowDone(!showDone)} data-tour="orders-done">
            <Icon name="arrow" size={16} /><b>Erledigt</b><Pill tone="green">{done.length + topDone.length}</Pill><span className="muted small">bereits geliefert</span>
          </button>
          {showDone && (
            <div className="n-list" style={{ marginTop: 8 }}>
              {done.map((o) => (
                <div key={o.id} className="n-row">
                  <div className="n-main"><b>{o.no}</b><span className="muted small">{fmtDate(o.createdOn)} · {o.lines.map((l) => `${packsOf(l)} × ${art(l.articleId)?.name}`).join(', ')}</span></div>
                  <Btn size="sm" icon="rechnung" onClick={() => setOpen(o.id)}>Rechnung</Btn>
                </div>
              ))}
              {topDone.map((o) => (
                <div key={o.id} className="n-row">
                  <div className="n-main"><b>{o.supplier}</b><span className="muted small">geliefert am {fmtDate(o.deliveredOn ?? o.expectedOn)} · {o.lines.map((l) => `${l.packs} × ${art(l.articleId)?.name}`).join(', ')}</span></div>
                  <Pill tone="green">geliefert</Pill>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {cur && <OrderDetail o={cur} onClose={() => setOpen(null)} />}
      {dev && (
        <Modal onClose={() => setDev(null)}>
          <h2>Abweichung melden</h2>
          <p className="muted" style={{ margin: '6px 0 16px' }}>Die Menge bleibt wie vom HQ gebucht. Deine Meldung sieht das HQ sofort.</p>
          <div className="field"><label>Was weicht ab?</label><textarea className="input" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="z. B. 2 Kartons Becher M fehlen" autoFocus /></div>
          <div className="actions">
            <Btn onClick={() => setDev(null)}>Abbrechen</Btn>
            <Btn kind="primary" disabled={!text.trim()} onClick={() => { pending(dev).forEach((d) => actions.reportDeviation(d.id, text.trim())); setDev(null); toast('Abweichung gemeldet') }}>Melden</Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}

/** Dokument im Vordergrund: Auftragsbestätigung bzw. (nach dem Versand) die Rechnung, mit PDF-Download */
export function OrderDetail({ o, onClose }: { o: CentralOrder; onClose: () => void }) {
  const db = useDb()
  const inv = db.invoices.find((i) => i.id === o.invoiceId)
  const art = (id: string) => db.articles.find((a) => a.id === id)!
  return (
    <Modal onClose={onClose} wide light>
      <div className="no-print">
        <h2>{inv ? `Rechnung ${inv.number}` : `Auftragsbestätigung ${confirmationNo(o)}`}</h2>
        <p className="muted small" style={{ margin: '4px 0 12px' }}>Bestellung {o.no} vom {fmtDate(o.createdOn)} · Wunschtermin {fmtDate(o.wishDate)}</p>
        <OrderTimeline o={o} />
        <table className="tbl" style={{ marginTop: 10 }}>
          <thead><tr><th>Position</th><th className="r">bestellt</th><th className="r">bestätigt</th><th className="r">Netto</th></tr></thead>
          <tbody>
            {o.lines.map((l) => (
              <tr key={l.articleId}>
                <td className="strong">{art(l.articleId).name}{l.reason && <div className="faint small">Änderung: {l.reason}</div>}</td>
                <td className="r">{l.packs}</td><td className="r">{packsOf(l)}</td><td className="r">{fmtEUR(packsOf(l) * art(l.articleId).packPrice)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td colSpan={3} className="r strong">Summe netto</td><td className="r strong">{fmtEUR(coNet(db, o))}</td></tr></tfoot>
        </table>
        <div className="am-grid" style={{ marginTop: 12 }}>
          <div><span className="cap">Versanddienstleister</span><b>{o.carrier ?? '–'}</b><span className="faint small">{o.shippedOn ? `versendet am ${fmtDate(o.shippedOn)}` : 'noch nicht versendet'}</span></div>
          <div><span className="cap">Sendungsnummer</span><b className="mono">{o.trackingNo ?? '–'}</b><span className="faint small">{o.etaDate ? `voraussichtlich ${fmtDate(o.etaDate)}` : ''}</span></div>
          <div><span className="cap">{inv ? 'Rechnung' : 'Auftragsbestätigung'}</span><b>{inv ? inv.number : confirmationNo(o)}</b>{inv ? <InvoicePill state={invoiceState(inv)} /> : <span className="faint small">Rechnung folgt mit dem Versand</span>}</div>
        </div>
      </div>
      <div className="inv-embed">{inv ? <InvoiceDoc inv={inv} /> : <OrderDoc db={db} o={o} />}</div>
      <div className="actions no-print">
        {inv && <Btn kind="ghost" onClick={() => { onClose(); go('/filiale/ware/rechnungen') }}>Alle Rechnungen</Btn>}
        <Btn onClick={onClose}>Schließen</Btn>
        <Btn kind="primary" icon="download" onClick={() => { document.body.classList.add('print-modal'); window.addEventListener('afterprint', () => document.body.classList.remove('print-modal'), { once: true }); window.print() }}>Als PDF herunterladen</Btn>
      </div>
    </Modal>
  )
}
