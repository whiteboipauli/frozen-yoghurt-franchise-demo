import { useDb } from '../data/repository'
import { go } from '../lib/router'
import { fmtDate } from '../lib/format'
import { packLabel, packsOf } from '../logic/invoice'
import { Btn, Card, Empty, PageHead } from '../ui/kit'
import { storeName } from '../ui/misc'

/** Lieferschein zu einer Bestellung (druckbar) */
export function DeliveryNotePage({ id }: { id: string }) {
  const db = useDb()
  const co = db.centralOrders.find((c) => c.id === id)
  if (!co) return <Card><Empty icon="box">Lieferung nicht gefunden.</Empty></Card>
  const st = db.stores.find((s) => s.id === co.storeId)!
  const c = db.settings.company
  return (
    <>
      <PageHead title={`Lieferschein ${co.no}`} hint="Zum Mitgeben oder Abheften. Über „Drucken“ auch als PDF speicherbar." right={<div className="row no-print"><Btn kind="primary" icon="print" onClick={() => window.print()}>Drucken</Btn></div>} />
      <article className="paper">
        <header className="paper-head">
          <div><div className="paper-brand">{c.name}</div><div className="paper-small">{c.street}, {c.zipCity}</div></div>
          <div className="paper-title">Lieferschein</div>
        </header>
        <section className="paper-cols">
          <div><div className="paper-cap">Lieferanschrift</div><b>{st.franchise.name}</b><br />{st.franchise.street}<br />{st.franchise.zipCity}<br /><span className="paper-small">Filiale: {storeName(db, st.id)}</span></div>
          <table className="paper-meta"><tbody>
            <tr><td>Bestellung</td><td><b>{co.no}</b></td></tr>
            <tr><td>Bestellt am</td><td>{fmtDate(co.createdOn)}</td></tr>
            <tr><td>Wunsch-Liefertermin</td><td>{fmtDate(co.wishDate)}</td></tr>
            <tr><td>Versand</td><td>{co.shippedOn ? fmtDate(co.shippedOn) : 'noch nicht versendet'}</td></tr>
          </tbody></table>
        </section>
        <table className="paper-lines">
          <thead><tr><th>Pos.</th><th>Artikelnr.</th><th>Bezeichnung</th><th className="r">bestellt</th><th className="r">geliefert</th><th>Hinweis</th></tr></thead>
          <tbody>
            {co.lines.map((l, i) => {
              const a = db.articles.find((x) => x.id === l.articleId)!
              return <tr key={l.articleId}><td>{i + 1}</td><td>{a.sku}</td><td>{a.name}<div className="paper-small">{packLabel(a)}</div></td><td className="r">{l.packs}</td><td className="r"><b>{packsOf(l)}</b></td><td>{l.reason ?? ''}</td></tr>
            })}
          </tbody>
        </table>
        {co.note && <p className="paper-note">Bemerkung der Filiale: {co.note}</p>}
        <div className="paper-foot"><p>Empfang bitte in der Warenwirtschaft bestätigen. Abweichungen dort melden.</p></div>
      </article>
    </>
  )
}
