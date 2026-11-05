import type { CentralOrder, Db } from '../data/types'
import { fmtDate, fmtEUR, fmtNum2 } from '../lib/format'
import { packLabel, packsOf, round2, totalsOf } from '../logic/invoice'

/** Auftragsbestätigung (eigenes Dokument, keine Rechnung): entsteht sofort beim Absenden der Bestellung */
export const confirmationNo = (o: Pick<CentralOrder, 'no'>) => `AB-${o.no.replace(/\D/g, '').padStart(4, '0')}`

export function OrderDoc({ db, o }: { db: Pick<Db, 'articles' | 'stores' | 'settings'>; o: CentralOrder }) {
  const store = db.stores.find((s) => s.id === o.storeId)!
  const co = db.settings.company
  const lines = o.lines.filter((l) => packsOf(l) > 0).map((l, i) => {
    const a = db.articles.find((x) => x.id === l.articleId)!
    return { pos: i + 1, a, qty: packsOf(l), net: round2(packsOf(l) * a.packPrice), vat: a.vatRate ?? 19 }
  })
  const t = totalsOf(lines.map((l) => ({ net: l.net, vatRate: l.vat })))
  return (
    <article className="paper inv-doc">
      <header className="paper-head">
        <div>
          <div className="paper-brand">{co.name}</div>
          <div className="paper-small">{co.street}, {co.zipCity}<br />USt-IdNr.: {co.vatId}</div>
        </div>
        <div className="paper-title">Auftragsbestätigung</div>
      </header>
      <section className="paper-cols">
        <div>
          <div className="paper-cap">Auftraggeber</div>
          <b>{store.franchise.name}</b><br />{store.franchise.street}<br />{store.franchise.zipCity}
        </div>
        <table className="paper-meta"><tbody>
          <tr><td>Auftragsbestätigung</td><td><b>{confirmationNo(o)}</b></td></tr>
          <tr><td>Bestellung</td><td>{o.no} vom {fmtDate(o.createdOn)}</td></tr>
          <tr><td>Wunsch-Liefertermin</td><td>{fmtDate(o.wishDate)}</td></tr>
        </tbody></table>
      </section>
      <p className="paper-note">Vielen Dank für Ihre Bestellung. Wir bestätigen den Eingang und liefern die folgenden Positionen. <b>Dies ist keine Rechnung</b> – die Rechnung wird automatisch erstellt, sobald die Ware versendet wird.</p>
      <table className="paper-lines">
        <thead><tr><th>Pos.</th><th>Artikelnr.</th><th>Bezeichnung</th><th className="r">Menge</th><th className="r">Einzel netto</th><th className="r">USt</th><th className="r">Netto</th></tr></thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.pos}><td>{l.pos}</td><td>{l.a.sku ?? l.a.id}</td><td>{l.a.name}<div className="paper-small">{packLabel(l.a)}</div></td><td className="r">{l.qty} Karton</td><td className="r">{fmtNum2(l.a.packPrice)} €</td><td className="r">{l.vat} %</td><td className="r">{fmtNum2(l.net)} €</td></tr>
          ))}
        </tbody>
      </table>
      <section className="paper-sum">
        <table><tbody>
          {t.taxes.map((x) => <tr key={x.rate}><td>Nettobetrag {x.rate} % USt</td><td className="r">{fmtEUR(x.net)}</td><td>USt {x.rate} %</td><td className="r">{fmtEUR(x.vat)}</td></tr>)}
          <tr className="sum-net"><td colSpan={3}>Summe netto</td><td className="r">{fmtEUR(t.net)}</td></tr>
          <tr className="sum-gross"><td colSpan={3}>Voraussichtlicher Betrag brutto</td><td className="r">{fmtEUR(t.gross)}</td></tr>
        </tbody></table>
      </section>
      <footer className="paper-foot"><p className="paper-demo">Demo-Beleg: Firmendaten sind Platzhalter. Kein rechtsgültiger Beleg.</p></footer>
    </article>
  )
}
