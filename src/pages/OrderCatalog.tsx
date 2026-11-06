import { useEffect } from 'react'
import { go } from '../lib/router'
import { actions, useDb } from '../data/repository'
import { addDays, todayISO } from '../lib/date'
import { cart, useCart } from '../lib/cart'
import { fmtEUR } from '../lib/format'
import { packLabel, round2, totalsOf, VAT_NOTE } from '../logic/invoice'
import { ProductArt } from '../icons'
import { Icon } from '../ui/icons'
import { Btn, Card, PageHead, useToast, NumInput } from '../ui/kit'

/** „Beim Headquarter bestellen“: Katalog als Kacheln, Warenkorb mit Netto/USt/Brutto, Bestellhistorie */
export function OrderCatalogPage({ storeId }: { storeId: string }) {
  const db = useDb()
  const c = useCart()
  const toast = useToast()
  useEffect(() => { cart.bind(storeId) }, [storeId])
  const items = db.articles.filter((a) => a.source === 'zentrale')
  const lines = Object.entries(c.lines).filter(([, n]) => n > 0).map(([id, packs]) => {
    const a = db.articles.find((x) => x.id === id)!
    return { a, packs, net: round2(packs * a.packPrice), vatRate: a.vatRate ?? 19 }
  })
  const t = totalsOf(lines)
  const minLead = lines.length ? Math.max(...lines.map((l) => l.a.leadTimeDays)) : 3
  const earliest = addDays(todayISO(), minLead)
  const wish = c.wish && c.wish >= earliest ? c.wish : earliest
  const send = () => {
    const id = actions.placeCentralOrder(storeId, lines.map((l) => ({ articleId: l.a.id, packs: l.packs })), wish, c.note)
    if (id) { cart.reset(); cart.bind(storeId); toast('Bestellung gesendet – die Auftragsbestätigung liegt unter „Meine Bestellungen“', { action: { label: 'Meine Bestellungen', onClick: () => go('/filiale/meine-bestellungen') } }) }
  }
  return (
    <>
      <PageHead title="Beim Headquarter bestellen" hint="Becher, Pulver, Löffel und mehr direkt beim HQ bestellen – ohne E-Mail und Excel. Die Mengen sind Verpackungseinheiten (Kartons). Mit dem Absenden bekommst du sofort eine Auftragsbestätigung; die Rechnung folgt mit dem Versand." />
      <div className="oc">
        <div className="stack">
          <div className="store-grid" data-tour="catalog">
            {items.map((a, i) => {
              const n = c.lines[a.id] ?? 0
              const off = a.available === false
              return (
                <div key={a.id} className={`glass shop-tile card in ${n > 0 ? 'sel' : ''} ${off ? 'off' : ''}`} style={{ ['--i' as string]: Math.min(i, 10) * 0.4 }}>
                  <div className="shop-art"><ProductArt article={a} size={112} /></div>
                  <h3>{a.name}</h3>
                  <p className="muted small">{packLabel(a)}</p>
                  <div className="shop-price"><b>{fmtEUR(a.packPrice)}</b><span> netto je Karton</span></div>
                  {off ? <p className="faint small">derzeit nicht verfügbar</p> : (
                    <div className="shop-qty">
                      <NumInput label={a.name} value={n} step={1} onChange={(v) => cart.add(a.id, v - n)} width={44} />
                      <Btn size="sm" kind={n ? 'glass' : 'cta'} onClick={() => cart.add(a.id, n ? 0 : 1)} aria-label={`${a.name} in den Warenkorb`}>{n ? 'Im Warenkorb' : 'Hinzufügen'}</Btn>
                    </div>
                  )}
                  <p className="faint small">Lieferzeit {a.leadTimeDays} Tage</p>
                </div>
              )
            })}
          </div>
        </div>

        <Card className="cart oc-cart rose-cart" i={1} title={<><Icon name="cart" size={22} /> Warenkorb</>} tour="cart">
          {lines.length === 0 ? <p className="muted">Noch leer. Wähle Mengen links – oder übernimm die Vorschläge aus der Bestellliste.</p> : (
            <div className="cart-lines" style={{ borderTop: 0, paddingTop: 0 }}>
              {lines.map((l) => <div key={l.a.id}><span>{l.packs} × {l.a.name}</span><span>{fmtEUR(l.net)}</span></div>)}
            </div>
          )}
          {lines.length > 0 && (
            <div className="cart-sum">
              <div><span>Netto</span><span>{fmtEUR(t.net)}</span></div>
              {t.taxes.map((x) => <div key={x.rate} className="muted"><span>USt {x.rate} % auf {fmtEUR(x.net)}</span><span>{fmtEUR(x.vat)}</span></div>)}
              <div className="total"><span>Brutto</span><span>{fmtEUR(t.gross)}</span></div>
            </div>
          )}
          <div className="field"><label>Wunsch-Liefertermin</label><input type="date" className="input" min={earliest} value={wish} onChange={(e) => cart.setWish(e.target.value)} /></div>
          <div className="field"><label>Bemerkung</label><textarea className="input" rows={2} value={c.note} onChange={(e) => cart.setNote(e.target.value)} placeholder="optional" /></div>
          <Btn kind="cta" size="lg" icon="send" style={{ width: '100%' }} disabled={!lines.length} onClick={send} data-tour="send-order">Bestellung absenden</Btn>
          <p className="faint small">{VAT_NOTE}.</p>
        </Card>
      </div>
    </>
  )
}
