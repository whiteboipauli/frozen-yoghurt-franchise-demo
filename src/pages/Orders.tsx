import { useState } from 'react'
import { actions, useDb } from '../data/repository'
import { todayISO } from '../lib/date'
import { fmt0, fmtDate, fmtQty, relDay } from '../lib/format'
import { packBase, portionBase } from '../logic/consumption'
import { orderList, reachAfter, type OrderItem } from '../logic/orderlist'
import { addDays } from '../lib/date'
import { fmtDayMonth } from '../lib/format'
import { artEmoji } from '../ui/art'
import { Icon } from '../ui/icons'
import { Btn, Card, Empty, Info, LightPill, PageHead, Pill, useToast, NumInput } from '../ui/kit'
import { cart } from '../lib/cart'
import { manualList, useManualList } from '../lib/manual-list'
import { go } from '../lib/router'

const unitText = (a: OrderItem['article'], qty: number) =>
  a.category === 'Topping' ? `${fmtQty(a, qty)} · ${fmt0(qty / portionBase(a))} Portionen` : fmtQty(a, qty)

const sentence = (i: OrderItem, packs: number, sup: string) => {
  const a = i.article
  const ra = reachAfter(i, packs)
  const who = a.supplier === 'Zentrale' ? 'bei der Zentrale' : `bei ${a.supplier}`
  const when = i.status !== 'offen' || ra === null ? '' : ` · reicht dann bis ca. ${fmtDayMonth(addDays(todayISO(), Math.round(ra)))} (${Math.round(ra)} Tage)`
  void sup
  return `${a.name} · ${packs} Packung${packs === 1 ? '' : 'en'} ${who}${when}`
}

export function OrdersPage({ storeId }: { storeId: string }) {
  const db = useDb()
  const toast = useToast()
  const [edit, setEdit] = useState<Record<string, number>>({})
  const [showDone, setShowDone] = useState(false)
  const extra = useManualList(storeId)
  const all = orderList(db, storeId, extra)
  // Oben stehen nur offene Positionen; Bestelltes und Geliefertes liegt im eingeklappten Bereich „Erledigt“
  const items = all.filter((i) => i.status === 'offen')
  const done = all.filter((i) => i.status !== 'offen')
  const packsOf = (i: OrderItem) => (i.status === 'offen' ? edit[i.article.id] ?? i.packs : i.packs)
  const urg = (sup: string) => Math.min(...items.filter((i) => i.supplier === sup && i.status === 'offen').map((i) => i.reach ?? 999), 1000)
  const suppliers = [...new Set(items.map((i) => i.supplier))].sort((a, b) => urg(a) - urg(b) || a.localeCompare(b))
  const openCount = items.filter((i) => i.status === 'offen').length
  const order = (i: OrderItem) => {
    actions.placeOrder(storeId, i.article.supplier, [{ articleId: i.article.id, packs: packsOf(i) }])
    manualList.remove(storeId, i.article.id)
    toast(`${i.article.name} als bestellt abgehakt`)
  }
  const toCart = () => {
    const lines = items.filter((i) => i.supplier === 'Zentrale' && i.status === 'offen').map((i) => ({ articleId: i.article.id, packs: packsOf(i) }))
    if (!lines.length) return
    cart.fill(storeId, lines)
    toast('Vorgeschlagene Mengen liegen im Warenkorb', { action: { label: 'Zum Warenkorb', onClick: () => go('/filiale/bestellen') } })
  }

  return (
    <>
      <PageHead
        title="Bestellliste"
        hint="Das System hat schon aufgeschrieben, was du bestellen musst. Bestelle es und hake es ab – mehr ist nicht zu tun."
        right={<Btn kind="glass" icon="print" className="no-print" onClick={() => window.print()} disabled={!items.length}>Liste drucken</Btn>}
      />
      <div className="stack screen-only">
        {items.length === 0 && <Card><Empty icon="check">Nichts zu bestellen – alles reicht aus.</Empty></Card>}
        {suppliers.map((sup, gi) => {
          const list = items.filter((i) => i.supplier === sup).sort((a, b) => Number(a.status !== 'offen') - Number(b.status !== 'offen') || (a.reach ?? 999) - (b.reach ?? 999))
          const yo = sup === 'Zentrale'
          const openYo = list.filter((i) => i.status === 'offen').length
          return (
            <Card key={sup} i={gi} tour={yo ? 'orderlist-zentrale' : undefined}
              title={<>{yo ? 'Von der Zentrale bezogen' : sup}{yo && <Info text="Becher, Pulver, Löffel und Zubehör bestellst du beim HQ. „In den Warenkorb“ übernimmt die vorgeschlagenen Mengen – dort schickst du die Bestellung ab." />}<Pill>{list.length} Position{list.length > 1 ? 'en' : ''}</Pill></>}
              right={yo && <Btn kind="cta" icon="cart" disabled={!openYo} onClick={toCart} data-tour="to-cart">Alles in den Warenkorb</Btn>}>
              {list.map((i) => {
                const a = i.article
                const packs = packsOf(i)
                const done = i.status !== 'offen'
                return (
                  <div key={i.key} className={`ol-item ${done ? 'done' : ''}`}>
                    <button className={`check ${done ? 'on' : ''}`} aria-label={`${a.name} als bestellt abhaken`} disabled={done || yo} title={yo ? 'Artikel der Zentrale bestellst du über den Warenkorb' : undefined} style={yo && !done ? { opacity: 0.35 } : undefined} onClick={() => order(i)}><Icon name="check" size={20} stroke={3} /></button>
                    <div>
                      <h3><span style={{ marginRight: 8 }}>{artEmoji(a)}</span>{a.name}<span className="muted small" style={{ fontWeight: 500 }}> · {unitText(a, packs * packBase(a))}</span></h3>
                      <p className="ol-sent">{sentence(i, packs, sup)}</p>
                    </div>
                    <div>
                      {done ? <b>{packs} Packung{packs > 1 ? 'en' : ''}</b> : (
                        <div className="row" style={{ gap: 8 }}>
                          <NumInput label={a.name} value={packs} min={1} step={1} onChange={(v) => setEdit((e) => ({ ...e, [a.id]: v }))} width={44} />
                          <span className="muted small" style={{ padding: '0 10px 0 4px' }}>Pck. à {a.packSize} {a.unit === 'kg' ? 'kg' : 'Stück'}</span>
                        </div>
                      )}
                    </div>
                    <div className="small muted">{i.latestOrderDate ? <>Spätestens bestellen:<br /><b style={{ color: 'var(--ink)' }}>{i.latestOrderDate <= todayISO() ? 'heute' : fmtDate(i.latestOrderDate)}</b> <span className="faint">({relDay(i.latestOrderDate)})</span></> : <>Lieferzeit {a.leadTimeDays} Tage</>}</div>
                    <div style={{ textAlign: 'right' }}>
                      {i.status === 'offen' ? <LightPill light={i.light} label={i.light === 'red' ? 'Dringend' : i.light === 'yellow' ? 'Bald' : 'Demnächst'} /> : i.status === 'bestellt' ? <Pill tone="blue">bestellt</Pill> : <Pill tone="green">geliefert</Pill>}
                    </div>
                  </div>
                )
              })}
            </Card>
          )
        })}

        {done.length > 0 && (
          <Card className="done-card" i={suppliers.length}>
            <button className="done-head" aria-expanded={showDone} onClick={() => setShowDone(!showDone)} data-tour="orders-done">
              <Icon name="arrow" size={16} /><b>Erledigt</b><Pill tone="green">{done.length} Position{done.length > 1 ? 'en' : ''}</Pill><span className="muted small">bereits bestellt oder geliefert</span>
            </button>
            {showDone && done.map((i) => (
              <div key={i.key} className="ol-item done-row">
                <span className="check on"><Icon name="check" size={18} stroke={3} /></span>
                <div><h3><span style={{ marginRight: 8 }}>{artEmoji(i.article)}</span>{i.article.name}</h3><p>{i.packs} Packung{i.packs > 1 ? 'en' : ''} · {i.supplier === 'Zentrale' ? 'von der Zentrale bezogen' : i.supplier}</p></div>
                <span /><span />
                <div style={{ textAlign: 'right' }}>{i.status === 'bestellt' ? <Pill tone="blue">bestellt</Pill> : <Pill tone="green">geliefert</Pill>}</div>
              </div>
            ))}
          </Card>
        )}
      </div>

      {/* Druckansicht A4 */}
      <div className="print-only">
        <h1>Bestellliste – {db.stores.find((s) => s.id === storeId)?.name}</h1>
        <p>Stand: {fmtDate(todayISO())} · {openCount} offene Position(en)</p>
        {suppliers.map((sup) => (
          <div key={sup}>
            <h2>{sup === 'Zentrale' ? 'Von der Zentrale bezogen' : sup}</h2>
            <table>
              <thead><tr><th>Artikel</th><th className="r">Packungen</th><th>Menge</th><th>Spätestens bestellen</th><th>Dringlichkeit</th><th>Status</th></tr></thead>
              <tbody>
                {items.filter((i) => i.supplier === sup).map((i) => (
                  <tr key={i.key}>
                    <td>[ ] {i.article.name}</td><td className="r">{packsOf(i)}</td><td>{unitText(i.article, packsOf(i) * packBase(i.article))}</td>
                    <td>{i.latestOrderDate ? fmtDate(i.latestOrderDate) : '–'}</td>
                    <td>{i.status === 'offen' ? (i.light === 'red' ? 'dringend' : i.light === 'yellow' ? 'bald' : 'demnächst') : '–'}</td><td>{i.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </>
  )
}
