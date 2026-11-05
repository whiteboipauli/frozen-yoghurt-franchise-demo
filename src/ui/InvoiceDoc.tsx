import type { Invoice } from '../data/types'
import { fmtDate, fmtEUR, fmtNum2 } from '../lib/format'

const PLACEHOLDER = (v: string) => v.includes('bitte ergänzen')
const F = ({ v }: { v: string }) => <span className={PLACEHOLDER(v) ? 'ph' : ''}>{v}</span>

/** Saubere, neutrale Rechnungsansicht (druckbar, per Druckdialog als PDF speicherbar) mit allen Pflichtangaben nach § 14 UStG */
export function InvoiceDoc({ inv }: { inv: Invoice }) {
  const storno = inv.type === 'storno'
  const demo = [inv.seller.street, inv.seller.taxNumber, inv.seller.vatId, inv.seller.iban].some((x) => !x || PLACEHOLDER(x))
  return (
    <article className="paper inv-doc" data-tour="invoice-doc">
      <header className="paper-head">
        <div>
          <div className="paper-brand">{inv.seller.name}</div>
          <div className="paper-small">
            <F v={inv.seller.street} />, <F v={inv.seller.zipCity} /><br />
            Steuernummer: <F v={inv.seller.taxNumber ?? ''} /> · USt-IdNr.: <F v={inv.seller.vatId} />
          </div>
        </div>
        <div className="paper-title">{storno ? 'Stornorechnung (Gutschrift)' : 'Rechnung'}</div>
      </header>

      <section className="paper-cols">
        <div>
          <div className="paper-cap">Rechnungsempfänger</div>
          <b>{inv.buyer.name}</b><br />
          <F v={inv.buyer.street} /><br />
          <F v={inv.buyer.zipCity} />
        </div>
        <table className="paper-meta"><tbody>
          <tr><td>Rechnungsnummer</td><td><b>{inv.number}</b></td></tr>
          <tr><td>Rechnungsdatum</td><td>{fmtDate(inv.date)}</td></tr>
          <tr><td>Liefer-/Leistungsdatum</td><td>{inv.serviceFrom === inv.serviceTo ? fmtDate(inv.serviceFrom) : `${fmtDate(inv.serviceFrom)} – ${fmtDate(inv.serviceTo)}`}</td></tr>
          {storno ? <tr><td>Bezug</td><td>Rechnung {inv.refNumber}</td></tr> : <tr><td>Zahlungsziel</td><td>{fmtDate(inv.dueDate)} ({inv.paymentDays} Tage)</td></tr>}
        </tbody></table>
      </section>

      {storno && <p className="paper-note">Diese Stornorechnung hebt die Rechnung <b>{inv.refNumber}</b> auf. Grund: {inv.reason}.</p>}

      <table className="paper-lines">
        <thead><tr><th>Pos.</th><th>Artikelnr.</th><th>Bezeichnung</th><th className="r">Menge</th><th className="r">Einzel netto</th><th className="r">USt</th><th className="r">Netto</th></tr></thead>
        <tbody>
          {inv.lines.map((l) => (
            <tr key={l.pos}>
              <td>{l.pos}</td><td>{l.sku}</td>
              <td>{l.name}<div className="paper-small">{inv.kind === 'gebuehr' ? 'Leistungszeitraum bis' : 'Lieferung'} {fmtDate(l.serviceDate)}</div></td>
              <td className="r">{l.qty} {l.unit}</td><td className="r">{fmtNum2(l.unitNet)} €</td><td className="r">{l.vatRate} %</td><td className="r">{fmtNum2(l.net)} €</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="paper-sum">
        <table><tbody>
          {inv.taxes.map((t) => (
            <tr key={t.rate}><td>Nettobetrag {t.rate} % USt</td><td className="r">{fmtEUR(t.net)}</td><td>USt {t.rate} %</td><td className="r">{fmtEUR(t.vat)}</td></tr>
          ))}
          <tr className="sum-net"><td colSpan={3}>Summe netto</td><td className="r">{fmtEUR(inv.net)}</td></tr>
          <tr><td colSpan={3}>Umsatzsteuer gesamt</td><td className="r">{fmtEUR(inv.vat)}</td></tr>
          <tr className="sum-gross"><td colSpan={3}>{storno ? 'Gutschriftbetrag brutto' : 'Rechnungsbetrag brutto'}</td><td className="r">{fmtEUR(inv.gross)}</td></tr>
        </tbody></table>
      </section>

      <footer className="paper-foot">
        {!storno && <p>Bitte überweisen Sie den Betrag bis zum <b>{fmtDate(inv.dueDate)}</b> ({inv.paymentDays} Tage netto) unter Angabe der Rechnungsnummer.</p>}
        <p><b>Bankverbindung:</b> <F v={inv.seller.bankName} /> · IBAN <F v={inv.seller.iban} /> · BIC <F v={inv.seller.bic} /></p>
        {demo && <p className="paper-demo">Demo-Beleg: Firmendaten sind Platzhalter („bitte ergänzen“) und werden in den Einstellungen des HQ gepflegt. Kein rechtsgültiger Beleg.</p>}
      </footer>
    </article>
  )
}
