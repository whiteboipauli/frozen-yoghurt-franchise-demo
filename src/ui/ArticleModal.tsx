import { useMemo, useState } from 'react'
import { actions, useDb } from '../data/repository'
import { cart } from '../lib/cart'
import { go } from '../lib/router'
import { addDays, todayISO, WEEKDAYS_SHORT, weekdayIdx } from '../lib/date'
import { fmt0, fmtDate, fmtDayMonth, fmtEUR, fmtQty } from '../lib/format'
import { packBase } from '../logic/consumption'
import { expectedUse, forecastAll, incomingFor, reachTone } from '../logic/forecast'
import { reichtText, stockSim } from '../logic/stocksim'
import { Signal } from './signal'
import { lastCount, roughReach } from '../logic/inventory'
import { packLabel } from '../logic/invoice'
import { orderPlan, ZONE_COLOR, ZONE_LABEL } from '../logic/orderplan'
import { Icon } from '../icons'
import { ArtBadge } from './art'
import { Btn, LightPill, Modal, NumInput, Pill, useToast } from './kit'

/** Haltbarkeit in Tagen: frische Ware kürzer, alles andere zählt 14 Tage */
const shelfDays = (id: string) => (['erdbeeren', 'mango', 'blaubeeren', 'kiwi', 'himbeeren'].includes(id) ? 10 : 14)

/** Tagesleiste „Reicht der Bestand?“: 14 Tage ab heute. Vor dem Liefertermin hängt alles nur vom Bestand ab (Lieferlücke), erst ab der Lieferung wirkt die Bestellmenge. */
function StockStrip({ storeId, articleId, packs, upperPacks }: { storeId: string; articleId: string; packs: number; upperPacks: number }) {
  const db = useDb()
  const toast = useToast()
  const a = db.articles.find((x) => x.id === articleId)!
  const today = todayISO()
  const shelf = shelfDays(articleId)
  const sim = useMemo(() => stockSim(db, storeId, articleId, packs, today), [db, storeId, articleId, packs, today])
  const lead = Math.min(a.leadTimeDays, 59)
  const day = (i: number) => addDays(today, i)
  const fmtD = (d: string) => `${WEEKDAYS_SHORT[weekdayIdx(d)]} ${fmtDayMonth(d)}`
  const firstLuecke = Array.from({ length: lead }, (_, i) => i).find((i) => !sim.covered[i]) ?? -1
  let afterEnd = lead
  while (afterEnd < 60 && sim.covered[afterEnd]) afterEnd++
  const tooMuch = afterEnd > shelf + lead && packs > upperPacks
  const lim = shelf < 14 ? shelf + lead : 11
  const state = (i: number): 'reicht' | 'leer' | 'viel' | 'luecke' => (i < lead && !sim.covered[i] ? 'luecke' : !sim.covered[i] ? 'leer' : tooMuch && i >= lim ? 'viel' : 'reicht')
  const lvl = { reicht: 'gruen', leer: 'rot', viel: 'bernstein', luecke: 'rot' } as const
  const word = { reicht: 'reicht', leer: 'leer', viel: 'zu viel', luecke: 'Lieferlücke' } as const
  const del = day(lead)
  const dText = `${a.leadTimeDays} ${a.leadTimeDays === 1 ? 'Tag' : 'Tage'}`
  const after = packs > 0 ? ` · danach reicht es ${afterEnd >= 59 ? 'über die nächsten 14 Tage hinaus' : `bis ca. ${fmtDate(day(afterEnd - 1))}`}` : ''
  const text = firstLuecke >= 0
    ? `Leer ab ${fmtD(day(firstLuecke))} · Lieferung ${fmtD(del)}${after}`
    : tooMuch ? `Zu viel: reicht über ${shelf} Tage hinaus · Lieferung ${fmtD(del)}`
      : afterEnd >= 14 ? `Reicht über die nächsten 14 Tage (bis ca. ${fmtDate(day(Math.min(59, afterEnd - 1)))})${packs > 0 && lead < 14 ? ` · Lieferung ${fmtD(del)}` : ''}`
        : `Reicht bis ${fmtD(day(afterEnd - 1))} (${afterEnd} ${afterEnd === 1 ? 'Tag' : 'Tage'}) · Leer ab ${fmtD(day(afterEnd))}${packs > 0 ? ` · Lieferung ${fmtD(del)}` : ''}`
  const explain = firstLuecke >= 0
    ? `Der Bestand reicht ${firstLuecke > 0 ? `nur bis ${fmtD(day(firstLuecke - 1))}` : 'heute nicht mehr'}. Die Lieferung kommt erst am ${fmtD(del)} (Lieferzeit ${dText}). ${fmtD(day(firstLuecke))}${lead - 1 > firstLuecke ? ` bis ${fmtD(day(lead - 1))}` : ''} ${lead - 1 > firstLuecke ? 'können' : 'kann'} auch eine größere Menge nicht mehr retten.`
    : ''
  return (
    <div data-stockstrip>
      <p className="stk-text"><Signal level={firstLuecke >= 0 ? 'rot' : tooMuch ? 'bernstein' : afterEnd >= 14 ? 'gruen' : 'rot'} size={20} /> <b>{text}</b></p>
      <div className="stk-row" role="img" aria-label={text}>
        {Array.from({ length: 14 }, (_, i) => {
          const st = state(i)
          return (
            <div key={i} className={`stk-tile ${st} ${i === 0 ? 'today' : ''}`} title={`${fmtD(day(i))}: ${word[st]}${i === lead ? ' · Lieferung' : ''}`}>
              <b>{i === 0 ? 'Heute' : WEEKDAYS_SHORT[weekdayIdx(day(i))]}</b><span>{Number(day(i).slice(8, 10))}.</span>
              <Signal level={lvl[st]} size={16} />
              <em>{word[st]}</em>
              {i === lead && <i className="stk-del"><Icon name="lkw" size={11} />Lieferung</i>}
            </div>
          )
        })}
      </div>
      {explain && (
        <div className="stk-explain">
          <p>{explain}</p>
          <Btn size="sm" icon="send" onClick={() => { actions.sendReport(storeId, 'anfrage', `Eillieferung für ${a.name} gewünscht`); toast('Anfrage ans HQ gesendet (Demo)') }}>Eillieferung anfragen (Demo)</Btn>
        </div>
      )}
    </div>
  )
}

/** Bestell-Fenster eines Artikels: „reicht noch“, Vorschau und Mengenregler mit Bereichen (zu wenig / optimal / zu viel) */
export function ArticleModal({ storeId, articleId, onClose }: { storeId: string; articleId: string; onClose: () => void }) {
  const db = useDb()
  const toast = useToast()
  const f = forecastAll(db, storeId).find((x) => x.article.id === articleId)
  const plan = useMemo(() => (f ? orderPlan(f, db.settings.targetDays) : null), [f, db.settings.targetDays])
  const [packs, setPacks] = useState<number | null>(null)
  if (!f || !plan) return null
  const a = f.article
  const yo = a.source === 'zentrale'
  const p = packs ?? plan.opt
  const zone = plan.zone(p)
  const lc = lastCount(db, storeId, a.id)
  const reach = plan.reachDays(p)
  const pct = (n: number) => `${(n / plan.max) * 100}%`
  const tone = reachTone(f)
  const packText = (n: number) => `${n} ${yo ? (n === 1 ? 'Karton' : 'Kartons') : n === 1 ? 'Packung' : 'Packungen'}`

  const order = () => {
    if (p <= 0) return
    if (yo) {
      cart.bind(storeId)
      cart.set(a.id, p)
      onClose()
      toast(`${p} × ${a.name} im Warenkorb`)
      go('/filiale/ware/artikel')
      cart.setOpen(true)
    } else {
      actions.placeOrder(storeId, a.supplier, [{ articleId: a.id, packs: p }])
      onClose()
      toast(`${a.name} bei ${a.supplier} bestellt`, { action: { label: 'Meine Bestellungen', onClick: () => go('/filiale/ware/bestellungen') } })
    }
  }
  return (
    <Modal onClose={onClose} wide light>
      <div className="am-modal">
        <button type="button" className="btn glass sm back-btn" onClick={onClose}><Icon name="pfeil-zurueck" size={16} />Zurück</button>
        <div className="row" style={{ gap: 18, alignItems: 'flex-start' }}>
          <ArtBadge article={a} size={84} />
          <div style={{ flex: 1 }}>
            <h2>{a.name}</h2>
            <p className="muted">{yo ? 'vom Headquarter bezogen' : `Topping · ${a.supplier}`} · {yo ? packLabel(a) : `Packung à ${a.packSize} kg`}</p>
            <div className="row wrap" style={{ marginTop: 8, gap: 8 }}>
              {f.ordered ? <Pill tone="blue">bestellt</Pill> : <LightPill light={tone} />}
              <Pill>{reichtText(stockSim(db, storeId, a.id, 0).firstGap)}</Pill>
              <Pill>Lieferzeit {a.leadTimeDays} Tage</Pill>
            </div>
            {yo && <p className="faint small" style={{ marginTop: 8 }}>{lc ? `Zuletzt gezählt: ${fmtQty(a, lc.counted)} am ${fmtDate(lc.date)}` : 'Noch nicht gezählt – bei der nächsten Monatsinventur.'}</p>}
          </div>
        </div>

        <div className="am-card">
          <div className="cap">Reicht der Bestand?</div>
          <StockStrip storeId={storeId} articleId={a.id} packs={p} upperPacks={plan.upper} />
          <p className="faint small">Bestand heute, erwarteter Verbrauch und Lieferung nach {a.leadTimeDays} Tagen Lieferzeit. Mehr oder weniger Menge ändert die Leiste sofort.</p>
        </div>

        <div className="slider-box" data-tour="qty-slider">
          <div className="row between">
            <div><div className="cap">Bestellmenge</div><div className="qty-big">{packText(p)}<small> · {fmt0(p * a.packSize)} {a.unit === 'kg' ? 'kg' : 'Stück'}</small></div></div>
            <span className="zone-chip" style={{ ['--zc' as string]: ZONE_COLOR[zone] }}>{ZONE_LABEL[zone]}</span>
          </div>
          <div className="qty-track">
            <div className="qty-zones">
              <i style={{ width: pct(plan.min), background: 'var(--bad)' }} />
              <i style={{ width: `calc(${pct(plan.upper + 1)} - ${pct(plan.min)})`, background: 'var(--ok)' }} />
              <i style={{ flex: 1, background: 'var(--warn)' }} />
            </div>
            <span className="qty-mark" style={{ left: pct(plan.opt) }} title="Vorschlag des Systems"><em>Vorschlag</em></span>
            <input type="range" min={0} max={plan.max} step={1} value={p} onChange={(e) => setPacks(Number(e.target.value))} aria-label={`Bestellmenge ${a.name}`} />
          </div>
          <div className="qty-labels"><span style={{ width: pct(plan.min), color: 'var(--bad)' }}>zu wenig</span><span style={{ flex: 1, color: 'var(--ok)' }}>optimal</span><span style={{ width: pct(plan.max - plan.upper), textAlign: 'right', color: 'var(--warn)' }}>zu viel</span></div>
          <div className="row between wrap" style={{ marginTop: 10, gap: 10 }}>
            <NumInput label="Packungen" value={p} min={0} max={plan.max} step={1} onChange={setPacks} width={44} />
            <div className="qty-reach" data-reach>{yo && p > 0 && <span className="faint small">{fmtEUR(p * a.packPrice)} netto</span>}</div>
          </div>
          {zone === 'wenig' && <div className="note warn" style={{ marginTop: 10 }}><Icon name="warn" /><div>Zu wenig: Das reicht nicht bis zur nächsten Lieferung.</div></div>}
          {zone === 'viel' && <div className="note warn" style={{ marginTop: 10 }}><Icon name="warn" /><div>Zu viel: {plan.warn}</div></div>}
        </div>
      </div>
      <div className="actions">
        <Btn onClick={onClose}>Schließen</Btn>
        <Btn kind="primary" icon="cart" data-tour="order-now" disabled={p <= 0} onClick={order}>{yo ? 'In den Warenkorb' : 'Bestellen'}</Btn>
      </div>
    </Modal>
  )
}
