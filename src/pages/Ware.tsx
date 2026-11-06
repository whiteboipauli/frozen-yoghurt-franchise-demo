import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { actions, useDb } from '../data/repository'
import { cart, useCart } from '../lib/cart'
import { go } from '../lib/router'
import { addDays, todayISO } from '../lib/date'
import { fmtEUR } from '../lib/format'
import { reachPct, reachTone, type ArticleForecast } from '../logic/forecast'
import { reichtText, stockSim } from '../logic/stocksim'
import { packLabel, round2, totalsOf, VAT_NOTE } from '../logic/invoice'
import { GROUP_LABEL, orderPlan, type StockGroup } from '../logic/orderplan'
import { articleRows, orderAllPlan } from '../logic/warelist'
import { Icon } from '../icons'
import { ArtBadge } from '../ui/art'
import { FillBar, Signal, SignalChip, type Level } from '../ui/signal'
import { ArticleModal } from '../ui/ArticleModal'
import { Btn, Card, EmbedCtx, Modal, PageHead, Pill, Segmented, Tabs, useToast, NumInput } from '../ui/kit'
import { InvoicesPage } from './Invoices'
import { MyOrdersPage } from './MyOrders'

export type WareTab = 'artikel' | 'bestellungen' | 'rechnungen'

/** Ware & Bestellen: Artikel · Meine Bestellungen · Rechnungen */
export function WarePage({ storeId, tab }: { storeId: string; tab: WareTab }) {
  const db = useDb()
  const open = db.centralOrders.filter((o) => o.storeId === storeId && o.status !== 'geliefert' && o.status !== 'berechnet').length
  const c = useCart()
  const n = Object.values(c.lines).filter((x) => x > 0).length
  return (
    <>
      <PageHead title="Ware & Bestellen" hint="Was reicht noch, was fehlt – und mit einem Klick bestellen." right={<>
        <Btn icon="cart" data-tour="cart-btn" onClick={() => { cart.bind(storeId); cart.setOpen(true) }}>{`Warenkorb (${n})`}</Btn>
        <Tabs<WareTab> value={tab} onChange={(t) => go(`/filiale/ware/${t}`)} tour="ware-tabs" options={[{ value: 'artikel', label: 'Artikel' }, { value: 'bestellungen', label: open ? `Meine Bestellungen (${open})` : 'Meine Bestellungen' }, { value: 'rechnungen', label: 'Rechnungen' }]} />
      </>} />
      <EmbedCtx.Provider value>
        {tab === 'artikel' && <ArtikelTab storeId={storeId} />}
        {tab === 'bestellungen' && <MyOrdersPage storeId={storeId} />}
        {tab === 'rechnungen' && <InvoicesPage mode="filiale" storeId={storeId} />}
      </EmbedCtx.Provider>
      <CartDrawer storeId={storeId} />
    </>
  )
}

interface SupplierList { supplier: string; lines: { name: string; packs: number; qty: string }[] }

function ArtikelTab({ storeId }: { storeId: string }) {
  const db = useDb()
  const toast = useToast()
  const c = useCart()
  const [group, setGroup] = useState<StockGroup>('alle')
  const [open, setOpen] = useState<string | null>(null)
  const [lists, setLists] = useState<SupplierList[] | null>(null)
  useEffect(() => { cart.bind(storeId) }, [storeId])

  const rows = useMemo(() => articleRows(db, storeId, group), [db, storeId, group])
  const sugOf = (f: ArticleForecast) => orderPlan(f, db.settings.targetDays).opt
  const needs = (f: ArticleForecast) => reachTone(f) !== 'green' && !f.ordered

  // „Alle Vorschläge bestellen“: Artikel des Headquarters in den Warenkorb, Toppings je Lieferant als bestellt markieren
  const orderAll = () => {
    const plan = orderAllPlan(db, storeId)
    if (!plan.zentrale.length && !plan.suppliers.length) { toast('Es gibt gerade keine offenen Vorschläge.', { tone: '' }); return }
    if (plan.zentrale.length) { cart.fill(storeId, plan.zentrale); cart.setOpen(true) }
    const out: SupplierList[] = plan.suppliers.map((s) => {
      actions.placeOrder(storeId, s.supplier, s.lines.map((l) => ({ articleId: l.articleId, packs: l.packs })))
      return { supplier: s.supplier, lines: s.lines.map((l) => ({ name: l.name, packs: l.packs, qty: `${l.packs} Packung${l.packs === 1 ? '' : 'en'}` })) }
    })
    toast(`${plan.zentrale.length ? `${plan.zentrale.length} Artikel im Warenkorb` : 'Bestellt'}${out.length ? ` · ${out.length} Lieferant${out.length === 1 ? '' : 'en'} als bestellt markiert` : ''}`)
    if (out.length) setLists(out)
  }
  const pending = rows.filter(needs).length

  const openCart = () => { cart.bind(storeId); cart.setOpen(true) }
  return (
    <div className="stack n-stack">
      <div className="row between wrap no-print">
        <Segmented value={group} onChange={setGroup} tour="stock-groups" options={(Object.keys(GROUP_LABEL) as StockGroup[]).map((g) => ({ value: g, label: GROUP_LABEL[g] }))} />
        <Btn kind="primary" icon="cart" data-tour="order-all" onClick={orderAll}>Alle Vorschläge bestellen</Btn>
      </div>
      <div className="glass card n-art-list" data-tour="art-list">
        <div className="n-art n-art-head" aria-hidden><span>Artikel</span><span>Bestand</span><span>Vorschlag</span><span>Menge</span><span className="r">Preis</span><span /></div>
        {rows.map((f) => {
          const a = f.article
          const yo = a.source === 'zentrale'
          const sim0 = stockSim(db, storeId, a.id, 0)
          const leadRed = sim0.firstGap < a.leadTimeDays
          const tone = leadRed ? 'red' : reachTone(f)
          const lvl: Level = tone === 'red' ? 'rot' : tone === 'yellow' ? 'bernstein' : 'gruen'
          const n = sugOf(f)
          const inCart = yo ? c.lines[a.id] ?? 0 : 0
          const reach = reichtText(sim0.firstGap)
          const sug = f.ordered ? 'bestellt' : needs(f) ? `${n} ${yo ? (n === 1 ? 'Karton' : 'Kartons') : n === 1 ? 'Packung' : 'Packungen'}` : 'nichts nötig'
          const ev: { l: Level; t: string } | null = !yo || !inCart ? null : inCart < Math.max(1, Math.floor(n * 0.7)) ? { l: 'bernstein', t: 'zu wenig' } : inCart > Math.ceil(n * 1.4) + 1 ? { l: 'bernstein', t: 'zu viel' } : { l: 'gruen', t: 'passt' }
          return (
            <div key={a.id} className={`n-art clickable tint-${lvl === 'gruen' ? 'none' : lvl}`} data-art={a.id} role="button" tabIndex={0} onClick={() => setOpen(a.id)} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setOpen(a.id) } }}>
              <button className="n-art-main" onClick={() => setOpen(a.id)} aria-label={`${a.name} – Details und bestellen`}>
                <ArtBadge article={a} size={48} />
                <span className="n-art-name"><b title={a.name}>{a.name}</b><span className="muted small" title={yo ? 'vom Headquarter' : a.supplier}>{yo ? 'vom Headquarter' : a.supplier} · Lieferzeit {a.leadTimeDays} {a.leadTimeDays === 1 ? 'Tag' : 'Tage'}</span></span>
              </button>
              <FillBar value={reachPct(f)} max={100} level={lvl} label={reach} />
              <span className="n-art-sug" title={sug}>{f.ordered ? <SignalChip level="info">bestellt</SignalChip> : needs(f) ? <b>{sug}</b> : <span className="muted">{sug}</span>}</span>
              <span className="n-art-qty" onClick={(e) => e.stopPropagation()}>
                {yo ? (
                  <>
                    <NumInput label={a.name} value={inCart} step={1} onChange={(v) => { cart.bind(storeId); cart.add(a.id, v - inCart) }} width={44} />
                    {ev && <SignalChip level={ev.l}>{ev.t}</SignalChip>}
                  </>
                ) : <span className="faint small">direkt beim Lieferanten</span>}
              </span>
              <span className="r n-art-price">{fmtEUR(a.packPrice)}<small className="faint"> /{yo ? 'Karton' : 'Pack.'}</small></span>
              {yo
                ? <button className={`n-art-cart ${inCart ? 'on' : ''}`} title={inCart ? 'Aus dem Warenkorb nehmen' : 'In den Warenkorb'} aria-label={`${a.name}: ${inCart ? 'aus dem Warenkorb nehmen' : 'in den Warenkorb'}`} onClick={(e) => { e.stopPropagation(); cart.bind(storeId); if (inCart) { cart.set(a.id, 0); toast(`${a.name} aus dem Warenkorb genommen`) } else { const q = Math.max(1, n); cart.set(a.id, q); toast(`${q} × ${a.name} im Warenkorb`, { action: { label: 'Warenkorb öffnen', onClick: () => cart.setOpen(true) } }) } }}><Icon name={inCart ? 'check' : 'cart'} size={18} /><span>{inCart ? 'Im Warenkorb' : 'In den Warenkorb'}</span></button>
                : <button className="n-art-cart" title="Details" aria-label={`${a.name}: Details`} onClick={(e) => { e.stopPropagation(); setOpen(a.id) }}><Icon name="arrow" size={18} /><span>Details</span></button>}
              {leadRed && <span className="n-art-warn"><Signal level="rot" size={16} />Lieferzeit {a.leadTimeDays} {a.leadTimeDays === 1 ? 'Tag' : 'Tage'} – heute bestellen</span>}
              {ev?.t === 'zu viel' && <span className="n-art-warn"><Signal level="bernstein" size={16} />Zu viel: Verfallsrisiko und Schwund. Ein kleinerer Karton-Zähler reicht meist.</span>}
            </div>
          )
        })}
      </div>
      <p className="faint small">{pending ? `${pending} Artikel brauchen eine Bestellung.` : 'Alle Artikel reichen aus.'}</p>

      {open && <ArticleModal storeId={storeId} articleId={open} onClose={() => setOpen(null)} />}
      {lists && (
        <Modal onClose={() => setLists(null)} wide light>
          <h2>Bestellliste je Lieferant</h2>
          <p className="muted small" style={{ margin: '4px 0 14px' }}>Diese Artikel sind jetzt als bestellt markiert. Zum Anrufen oder Mitnehmen kannst du die Liste ausdrucken.</p>
          <div className="stack n-stack print-area">
            {lists.map((l) => (
              <div key={l.supplier} className="inset-card">
                <div className="card-head"><h2>{l.supplier}</h2><Pill>{l.lines.length} Artikel</Pill></div>
                {l.lines.map((x) => <div key={x.name} className="n-line"><span>☐ {x.name}</span><b>{x.qty}</b></div>)}
              </div>
            ))}
          </div>
          <div className="actions no-print">
            <Btn onClick={() => setLists(null)}>Schließen</Btn>
            <Btn kind="primary" icon="print" onClick={() => { document.body.classList.add('print-modal'); window.addEventListener('afterprint', () => document.body.classList.remove('print-modal'), { once: true }); window.print() }}>Liste drucken</Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}

/** Warenkorb: Glas-Fenster, das von rechts hereinfährt – mit „Bestellung absenden“ */
function CartDrawer({ storeId }: { storeId: string }) {
  const db = useDb()
  const c = useCart()
  const toast = useToast()
  const [more, setMore] = useState(false)
  const close = () => cart.setOpen(false)
  useEffect(() => {
    if (!c.open) return
    const k = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [c.open])
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
    if (id) {
      cart.reset(); cart.bind(storeId); cart.setSent(id)
      toast('Bestellung gesendet – hier ist deine Auftragsbestätigung')
      go('/filiale/ware/bestellungen')
    }
  }
  if (!c.open) return null
  return createPortal(
    <div className="drawer-scrim" onPointerDown={(e) => e.target === e.currentTarget && close()}>
    <aside className="glass drawer" data-tour="cart" role="dialog" aria-label="Warenkorb">
      <div className="card-head"><h2><Icon name="cart" size={20} /> Warenkorb{lines.length > 0 && <SignalChip level="info">{String(lines.length)}</SignalChip>}</h2><button className="toast-x" aria-label="Schließen" onClick={close}><Icon name="x" size={18} /></button></div>
      {lines.length === 0 ? <p className="muted">Noch leer. Wähle bei einem Artikel „Bestellen“ – oder oben „Alle Vorschläge bestellen“.</p> : (
        <div className="n-cart-lines">
          {lines.map((l) => (
            <div key={l.a.id} className="n-cart-line">
              <div className="grow"><b>{l.a.name}</b><span className="faint small">{packLabel(l.a)}</span></div>
              <NumInput label={l.a.name} value={l.packs} step={1} onChange={(v) => cart.add(l.a.id, v - l.packs)} width={44} />
              <span className="n-cart-sum">{fmtEUR(l.net)}</span>
            </div>
          ))}
          <div className="cart-sum">
            <div><span>Netto</span><span>{fmtEUR(t.net)}</span></div>
            {t.taxes.map((x) => <div key={x.rate} className="muted"><span>USt {x.rate} %</span><span>{fmtEUR(x.vat)}</span></div>)}
            <div className="total"><span>Brutto</span><span>{fmtEUR(t.gross)}</span></div>
          </div>
        </div>
      )}
      {lines.length > 0 && (
        <>
          <button className="n-more" aria-expanded={more} onClick={() => setMore(!more)}><Icon name="arrow" size={14} /> Wunschtermin &amp; Bemerkung</button>
          {more && (
            <div className="stack" style={{ gap: 10 }}>
              <div className="field"><label>Wunsch-Liefertermin</label><input type="date" className="input" min={earliest} value={wish} onChange={(e) => cart.setWish(e.target.value)} /></div>
              <div className="field"><label>Bemerkung</label><textarea className="input" rows={2} value={c.note} onChange={(e) => cart.setNote(e.target.value)} placeholder="optional" /></div>
            </div>
          )}
        </>
      )}
      <Btn kind="primary" size="lg" icon="send" style={{ width: '100%' }} disabled={!lines.length} onClick={send} data-tour="send-order">Bestellung absenden</Btn>
      {lines.length > 0 && <p className="faint small">{VAT_NOTE}. Mit dem Absenden bekommst du sofort die Auftragsbestätigung.</p>}
    </aside>
    </div>,
    document.body,
  )
}
