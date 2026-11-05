import { useEffect, useMemo, useState } from 'react'
import { actions, openForInvoice, useDb } from '../data/repository'
import type { Invoice } from '../data/types'
import { go } from '../lib/router'
import { printAfterNav } from '../lib/print-flag'
import { addDays, todayISO } from '../lib/date'
import { fmtDate, fmtEUR } from '../lib/format'
import { invoiceState, invoiceSums, round2 } from '../logic/invoice'
import { InvoiceDoc } from '../ui/InvoiceDoc'
import { Icon } from '../icons'
import { Btn, Card, Empty, Modal, PageHead, Pill, useToast } from '../ui/kit'
import { coNet, InvoicePill, storeName } from '../ui/misc'

type Mode = 'zentrale' | 'filiale'
const monthName = (m: string) => new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' }).format(new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1))

/** Rechnungsübersicht: HQ = alle Läden mit Filtern und Summen; Filiale = eigene Rechnungen */
export function InvoicesPage({ mode, storeId }: { mode: Mode; storeId?: string; base?: string }) {
  const db = useDb()
  const toast = useToast()
  const today = todayISO()
  const [store, setStore] = useState('alle')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [status, setStatus] = useState('alle')
  const [col, setCol] = useState({ store: db.stores[0].id, month: today.slice(0, 7) })
  const base = mode === 'filiale' ? db.invoices.filter((i) => i.storeId === storeId) : db.invoices
  const rows = useMemo(
    () => base.filter((i) => (store === 'alle' || i.storeId === store) && (!from || i.date >= from) && (!to || i.date <= to) && (status === 'alle' || invoiceState(i, today) === status))
      .sort((a, b) => b.number.localeCompare(a.number)),
    [base, store, from, to, status, today],
  )
  const sums = invoiceSums(mode === 'filiale' ? base : db.invoices, today)
  const view = (i: Invoice) => go(`/${mode}/rechnungen/${i.id}`)
  const months = [...new Set(db.centralOrders.filter((c) => !c.invoiceId && (c.status === 'versendet' || c.status === 'geliefert')).map((c) => (c.shippedOn ?? '').slice(0, 7)))].sort().reverse()
  const collect = openForInvoice(db, col.store, col.month)
  const [newInv, setNewInv] = useState(false)

  return (
    <>
      <PageHead
        title="Rechnungen"
        hint={mode === 'zentrale' ? 'Alle Rechnungen an die Franchisenehmer. Erstellte Rechnungen sind unveränderlich – Korrekturen nur per Stornorechnung.' : 'Deine Rechnungen von der Zentrale mit Status. Ansehen, drucken oder als PDF speichern.'}
        right={mode === 'zentrale' ? <Btn kind="primary" icon="plus" onClick={() => setNewInv(true)}>Neue Rechnung</Btn> : undefined}
      />
      {newInv && <NewInvoiceDialog onClose={() => setNewInv(false)} />}
      <div className="stack">
        <div className="sum-cards" data-tour="invoice-sums">
          <div className="glass sum-card"><div className="cap">Offen</div><b>{fmtEUR(sums.open)}</b></div>
          <div className={`glass sum-card ${sums.overdue > 0 ? 'bad' : ''}`}><div className="cap">davon überfällig</div><b>{fmtEUR(sums.overdue)}</b></div>
          <div className="glass sum-card"><div className="cap">Rechnungsumsatz {monthName(today.slice(0, 7))} (netto)</div><b>{fmtEUR(sums.monthNet)}</b></div>
        </div>

        {mode === 'zentrale' && (
          <Card title="Sammelrechnung pro Monat und Filiale" i={0}>
            <div className="row wrap" style={{ alignItems: 'flex-end', gap: 16 }}>
              <div className="field"><label>Filiale</label><select className="select" value={col.store} onChange={(e) => setCol({ ...col, store: e.target.value })}>{db.stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
              <div className="field"><label>Monat</label><select className="select" value={col.month} onChange={(e) => setCol({ ...col, month: e.target.value })}>{[...new Set([...months, today.slice(0, 7)])].sort().reverse().map((m) => <option key={m} value={m}>{monthName(m)}</option>)}</select></div>
              <Btn kind="primary" icon="invoice" disabled={!collect.length} onClick={() => { const id = actions.createInvoice(collect.map((c) => c.id)); if (id) { toast('Sammelrechnung erstellt'); go(`/zentrale/rechnungen/${id}`) } }}>
                {collect.length ? `Sammelrechnung erstellen (${collect.length} Lieferungen, ${fmtEUR(round2(collect.reduce((s, c) => s + coNet(db, c), 0)))} netto)` : 'Keine offenen Lieferungen'}
              </Btn>
            </div>
          </Card>
        )}

        <Card title={`${rows.length} Rechnung${rows.length === 1 ? '' : 'en'}`} i={1} right={
          <div className="row wrap no-print">
            {mode === 'zentrale' && <select className="select" value={store} onChange={(e) => setStore(e.target.value)} aria-label="Filiale filtern"><option value="alle">Alle Filialen</option>{db.stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status filtern">{['alle', 'offen', 'überfällig', 'bezahlt', 'storniert', 'Gutschrift'].map((s) => <option key={s} value={s}>{s === 'alle' ? 'Alle Status' : s}</option>)}</select>
            <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="von" /><span className="muted">bis</span>
            <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} aria-label="bis" />
          </div>}>
          {rows.length === 0 ? <Empty icon="haken-kreis">Keine Rechnungen im gewählten Filter. Nächster Schritt: Filter zurücksetzen.</Empty> : (
            <div className="table-wrap"><table className="tbl">
              <thead><tr><th>Nummer</th><th>Datum</th>{mode === 'zentrale' && <th>Filiale</th>}<th className="r">Netto</th><th className="r">Brutto</th><th>Fällig</th><th>Status</th><th /></tr></thead>
              <tbody>
                {rows.slice(0, 60).map((i) => {
                  const st = invoiceState(i, today)
                  return (
                    <tr key={i.id} className={st === 'überfällig' ? 'overdue' : ''}>
                      <td className="strong">{i.number}{i.type === 'storno' && <span className="faint small"> zu {i.refNumber}</span>}</td>
                      <td>{fmtDate(i.date)}</td>
                      {mode === 'zentrale' && <td>{storeName(db, i.storeId)}</td>}
                      <td className="r">{fmtEUR(i.net)}</td><td className="r strong">{fmtEUR(i.gross)}</td>
                      <td>{i.type === 'storno' ? '–' : st === 'überfällig' ? <b style={{ color: 'var(--bad)' }}>seit {fmtDate(i.dueDate)}</b> : fmtDate(i.dueDate)}</td>
                      <td><InvoicePill state={st} />{i.paidOn && <span className="faint small"> am {fmtDate(i.paidOn)}</span>}</td>
                      <td className="r"><span className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
                        {mode === 'zentrale' && (st === 'offen' || st === 'überfällig') && <Btn size="sm" onClick={() => { actions.markPaid(i.id); toast(`${i.number} als bezahlt markiert`) }}>Als bezahlt markieren</Btn>}
                        <Btn size="sm" kind="glass" onClick={() => view(i)}>Ansehen</Btn>
                      </span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table></div>
          )}
          {rows.length > 60 && <p className="faint small" style={{ marginTop: 10 }}>Die ersten 60 von {rows.length} Rechnungen – bitte Filter nutzen.</p>}
        </Card>
      </div>
    </>
  )
}

/** Einzelne Rechnung als Fenster im Vordergrund (Liste bleibt dahinter): ansehen, drucken/PDF, bezahlt markieren, stornieren, E-Rechnung (Vorschau) */
export function InvoiceViewPage({ id, mode, storeId }: { id: string; mode: Mode; storeId?: string; base?: string }) {
  const db = useDb()
  const toast = useToast()
  const [storno, setStorno] = useState(false)
  const [reason, setReason] = useState('')
  const inv = db.invoices.find((i) => i.id === id)
  const listPath = mode === 'filiale' ? '/filiale/ware/rechnungen' : '/zentrale/finanzen/rechnungen'
  const close = () => go(listPath)
  useEffect(() => { if (printAfterNav.take(id)) setTimeout(() => window.print(), 500) }, [id])
  const ok = inv && !(mode === 'filiale' && inv.storeId !== storeId)
  const st = ok ? invoiceState(inv) : 'offen'
  return (
    <>
      <InvoicesPage mode={mode} storeId={storeId} />
      <Modal onClose={close} wide>
        {!ok ? <Empty icon="rechnung">Rechnung nicht gefunden.</Empty> : (
          <>
            <div className="no-print">
              <div className="row between wrap">
                <h2>{inv.type === 'storno' ? 'Stornorechnung' : 'Rechnung'} {inv.number}</h2>
                <InvoicePill state={st} />
              </div>
              <p className="faint small" style={{ margin: '4px 0 10px' }}><Icon name="lock" size={14} /> Erstellte Rechnungen können nicht geändert oder gelöscht werden. Korrekturen laufen nur über eine Stornorechnung.</p>
              <div className="row wrap" style={{ gap: 8, marginBottom: 12 }}>
                {inv.cancelledBy && <Btn size="sm" icon="pfeil-zurueck" onClick={() => go(`/${mode}/rechnungen/${inv.cancelledBy}`)}>Zur Stornorechnung</Btn>}
                {inv.refId && <Btn size="sm" onClick={() => go(`/${mode}/rechnungen/${inv.refId}`)}>Zur Originalrechnung</Btn>}
                <Btn size="sm" icon="download" disabled title="Pflicht für alle ab 2028">E-Rechnung (ZUGFeRD/XRechnung)</Btn>
                <span className="faint small" style={{ alignSelf: 'center' }}>E-Rechnung: Vorschau, Pflicht für alle ab 2028.</span>
              </div>
            </div>
            <div className="inv-embed"><InvoiceDoc inv={inv} /></div>
            <div className="actions no-print">
              {mode === 'zentrale' && inv.type === 'rechnung' && !inv.cancelledBy && <Btn kind="danger" icon="pfeil-zurueck" onClick={() => { setReason(''); setStorno(true) }}>Stornorechnung erstellen</Btn>}
              <Btn icon="print" onClick={() => { document.body.classList.add('print-modal'); window.addEventListener('afterprint', () => document.body.classList.remove('print-modal'), { once: true }); window.print() }}>Drucken / als PDF</Btn>
              {mode === 'zentrale' && (st === 'offen' || st === 'überfällig') && <Btn kind="primary" icon="haken" onClick={() => { actions.markPaid(inv.id); toast('Als bezahlt markiert') }}>Als bezahlt markieren</Btn>}
              <Btn onClick={close}>Schließen</Btn>
            </div>
          </>
        )}
      </Modal>
      {storno && inv && (
        <Modal onClose={() => setStorno(false)}>
          <h2>Stornorechnung erstellen?</h2>
          <p className="muted" style={{ margin: '8px 0 14px' }}>Die Rechnung {inv.number} bleibt unverändert bestehen. Es entsteht eine eigene Stornorechnung mit neuer Nummer, negativen Positionen und Bezug auf das Original.</p>
          <div className="field"><label>Grund</label><input className="input wide" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="z. B. falsche Menge berechnet" autoFocus /></div>
          <div className="actions">
            <Btn onClick={() => setStorno(false)}>Abbrechen</Btn>
            <Btn kind="danger" disabled={!reason.trim()} onClick={() => { const nid = actions.cancelInvoice(inv.id, reason); setStorno(false); if (nid) { toast('Stornorechnung erstellt'); go(`/zentrale/rechnungen/${nid}`) } }}>Stornorechnung erstellen</Btn>
          </div>
        </Modal>
      )}
    </>
  )
}

/** HQ: freie Rechnung (Gebühren, Marketing-Beiträge …) an einen Laden */
export function NewInvoiceDialog({ onClose }: { onClose: () => void }) {
  const db = useDb()
  const toast = useToast()
  const [store, setStore] = useState(db.stores.find((s) => !s.own)?.id ?? db.stores[0].id)
  const [lines, setLines] = useState([{ text: '', qty: 1, price: 0, vat: 19 }])
  const set = (i: number, p: Partial<(typeof lines)[number]>) => setLines(lines.map((l, k) => (k === i ? { ...l, ...p } : l)))
  const net = round2(lines.reduce((a, l) => a + l.qty * l.price, 0))
  const valid = lines.every((l) => l.text.trim() && l.qty > 0) && lines.some((l) => l.price !== 0)
  const num = (v: string) => { const n = parseFloat(v.replace(',', '.')); return Number.isNaN(n) ? 0 : n }
  return (
    <Modal onClose={onClose} wide>
      <h2>Neue Rechnung</h2>
      <p className="muted" style={{ margin: '4px 0 12px' }}>Für Gebühren, Marketing-Beiträge oder anderes. Die Nummer wird automatisch vergeben, danach ist sie unveränderlich.</p>
      <div className="field"><label>Empfänger</label><select className="select" value={store} onChange={(e) => setStore(e.target.value)}>{db.stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
      <div className="cap" style={{ margin: '14px 0 6px' }}>Positionen</div>
      <div className="stack" style={{ gap: 8 }}>
        <div className="line-grid cap"><span>Text</span><span>Menge</span><span>Einzelpreis €</span><span>MwSt</span><span /></div>
        {lines.map((l, i) => (
          <div key={i} className="line-grid">
            <input className="input" value={l.text} placeholder="z. B. Marketing-Beitrag November" onChange={(e) => set(i, { text: e.target.value })} aria-label="Text" />
            <input className="input" inputMode="decimal" value={String(l.qty).replace('.', ',')} onChange={(e) => set(i, { qty: num(e.target.value) })} aria-label="Menge" />
            <input className="input" inputMode="decimal" value={String(l.price).replace('.', ',')} onChange={(e) => set(i, { price: num(e.target.value) })} aria-label="Einzelpreis" />
            <select className="select" value={l.vat} onChange={(e) => set(i, { vat: Number(e.target.value) })} aria-label="MwSt"><option value={19}>19 %</option><option value={7}>7 %</option><option value={0}>0 %</option></select>
            <button className="toast-x" aria-label="Position entfernen" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, k) => k !== i))}><Icon name="x" size={16} /></button>
          </div>
        ))}
        <div><Btn size="sm" icon="plus" onClick={() => setLines([...lines, { text: '', qty: 1, price: 0, vat: 19 }])}>Position hinzufügen</Btn></div>
      </div>
      <p className="strong" style={{ marginTop: 12 }}>Summe netto: {fmtEUR(net)}</p>
      <div className="actions">
        <Btn onClick={onClose}>Abbrechen</Btn>
        <Btn kind="primary" icon="haken" disabled={!valid} onClick={() => { const id = actions.createFreeInvoice(store, lines.map((l) => ({ text: l.text.trim(), qty: l.qty, unitNet: l.price, vatRate: l.vat }))); if (id) { toast('Rechnung erstellt'); onClose(); go(`/zentrale/rechnungen/${id}`) } }}>Rechnung erstellen</Btn>
      </div>
    </Modal>
  )
}
void addDays; void Pill
