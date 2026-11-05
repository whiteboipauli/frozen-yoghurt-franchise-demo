import { actions, useDb } from '../data/repository'
import { go } from '../lib/router'
import { todayISO } from '../lib/date'
import { fmtEUR } from '../lib/format'
import { feeFor, feeInvoiceOf, lastMonths, monthLabel, revCtx } from '../logic/fees'
import { invoiceState } from '../logic/invoice'
import { Btn, Card, Empty, NumInput, PageHead, Pill, useToast } from '../ui/kit'
import { InvoicePill } from '../ui/misc'
import { useState } from 'react'

/** HQ: Franchise-Gebühren – Lizenzgebühr und Werbebeitrag monatlich aus dem Netto-Kassenumsatz, mit einem Klick als Rechnung */
export function FeesPage() {
  const db = useDb()
  const toast = useToast()
  const today = todayISO()
  const months = lastMonths(3, today)
  const fr = db.stores.filter((s) => !s.own)
  const ctx = revCtx(db)
  const [lic, setLic] = useState(db.settings.fees.license)
  const [mkt, setMkt] = useState(db.settings.fees.marketing)
  const open = fr.flatMap((s) => months.filter((m) => !feeInvoiceOf(db, s.id, m)).map((m) => ({ s, m })))
  return (
    <>
      <PageHead title="Franchise-Gebühren" hint="Pro Franchise-Laden werden monatlich aus dem Netto-Kassenumsatz die Lizenzgebühr und der Werbebeitrag berechnet. HQ-eigene Stores (Carlstadt) zahlen keine Gebühren." />
      <div className="stack">
        <Card title="Gebührensätze" i={0} tour="fee-rates" right={<Pill>laut Franchisevertrag anpassen</Pill>}>
          <div className="row wrap" style={{ alignItems: 'flex-end', gap: 22 }}>
            <div className="field"><label>Lizenzgebühr (% vom Netto-Umsatz)</label><NumInput width={96} step={0.5} value={lic} onChange={setLic} /></div>
            <div className="field"><label>Werbebeitrag (% vom Netto-Umsatz)</label><NumInput width={96} step={0.5} value={mkt} onChange={setMkt} /></div>
            <Btn kind="primary" disabled={lic === db.settings.fees.license && mkt === db.settings.fees.marketing} onClick={() => { actions.setFees(lic, mkt); toast('Gebührensätze gespeichert – gelten für neue Rechnungen') }}>Speichern</Btn>
            <span className="faint small">Demo: 6 % und 2 %. Bereits erstellte Rechnungen bleiben unverändert.</span>
          </div>
        </Card>
        <Card title={`Offen zur Abrechnung (${open.length})`} i={1} tour="fee-open" right={<Btn kind="cta" size="sm" icon="invoice" disabled={!open.length} onClick={() => { let n = 0; for (const o of open) if (actions.createFeeInvoice(o.s.id, o.m)) n++; toast(`${n} Rechnung${n === 1 ? '' : 'en'} erstellt`) }}>Alle erstellen</Btn>}>
          {open.length === 0 ? <Empty icon="check">Alle Monate sind abgerechnet.</Empty> : (
            <table className="tbl">
              <thead><tr><th>Laden</th><th>Monat</th><th className="r">Umsatzbasis (netto)</th><th className="r">Lizenzgebühr</th><th className="r">Werbebeitrag</th><th className="r">Summe netto</th><th /></tr></thead>
              <tbody>
                {open.map(({ s, m }) => { const f = feeFor(ctx, db.settings.fees, s.id, m); return (
                  <tr key={s.id + m}><td className="strong">{s.name}</td><td style={{ whiteSpace: "nowrap" }}>{monthLabel(m)}</td><td className="r">{fmtEUR(f.base)}</td><td className="r">{fmtEUR(f.license)}</td><td className="r">{fmtEUR(f.marketing)}</td><td className="r strong">{fmtEUR(f.total)}</td>
                    <td className="r"><Btn size="sm" kind="cta" onClick={() => { const id = actions.createFeeInvoice(s.id, m); if (id) { toast('Rechnung erstellt'); go(`/zentrale/rechnungen/${id}`) } }}>Rechnung erstellen</Btn></td></tr>
                ) })}
              </tbody>
            </table>
          )}
        </Card>
        <Card title="Übersicht der letzten 3 Monate" i={2}>
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th>Laden</th><th>Monat</th><th className="r">Umsatzbasis</th><th className="r">Gebühr</th><th className="r">Werbebeitrag</th><th>Status</th><th /></tr></thead>
            <tbody>
              {fr.flatMap((s) => months.map((m) => {
                const inv = feeInvoiceOf(db, s.id, m)
                const f = feeFor(ctx, db.settings.fees, s.id, m)
                const base = inv ? (inv.lines[0] ? f.base : f.base) : f.base
                return (
                  <tr key={s.id + m} className={inv && invoiceState(inv, today) === 'überfällig' ? 'overdue' : ''}>
                    <td className="strong">{s.name}</td><td style={{ whiteSpace: "nowrap" }}>{monthLabel(m)}</td><td className="r">{fmtEUR(base)}</td>
                    <td className="r">{fmtEUR(inv ? inv.lines[0].net : f.license)}</td><td className="r">{fmtEUR(inv ? inv.lines[1].net : f.marketing)}</td>
                    <td>{inv ? <InvoicePill state={invoiceState(inv, today)} /> : <Pill tone="yellow">noch nicht berechnet</Pill>}</td>
                    <td className="r">{inv && <Btn size="sm" kind="glass" onClick={() => go(`/zentrale/rechnungen/${inv.id}`)}>{inv.number}</Btn>}</td>
                  </tr>
                )
              }))}
            </tbody>
          </table></div>
          <p className="faint small" style={{ marginTop: 10 }}>Rechnungen nutzen denselben Nummernkreis wie die Warenrechnungen; Korrekturen nur per Stornorechnung. Der Franchisenehmer sieht sie unter „Rechnungen“.</p>
        </Card>
      </div>
    </>
  )
}
