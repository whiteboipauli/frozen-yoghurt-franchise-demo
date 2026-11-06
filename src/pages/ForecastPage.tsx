import { GROUP_LABEL, groupOf, type StockGroup } from '../logic/orderplan'
import { useState } from 'react'
import { useDb } from '../data/repository'
import { addDays, diffDays, todayISO, WEEKDAYS_SHORT, weekdayIdx } from '../lib/date'
import { fmt0, fmtDate, fmtDayMonth, fmtQty } from '../lib/format'
import { portionBase } from '../logic/consumption'
import { byReach, cupSeries, forecastAll, holidayOn, project, reachTone, wxOn, type ArticleForecast } from '../logic/forecast'
import { roughReach } from '../logic/inventory'
import { Icon } from '../icons'
import { useWeatherStatus, weatherAvailable, wxKind } from '../logic/weather'
import { ArtIcon } from '../ui/art'
import { Curve } from '../ui/charts'
import { ArticleModal } from '../ui/ArticleModal'
import { Btn, Card, Info, Modal, PageHead, Pill, Segmented } from '../ui/kit'

const lbl = (d: string) => `${WEEKDAYS_SHORT[weekdayIdx(d)]} ${fmtDayMonth(d)}`
const SPAN = 28

/** Sortierung der Balkenliste: frühestes Leer-Datum zuerst (rot, dann gelb, unten grün – die Farbe folgt der Reichweite) */
export const emptyOrder = (fc: ArticleForecast[]): ArticleForecast[] => [...fc].sort(byReach)

export function ForecastPage({ storeId }: { storeId: string }) {
  const db = useDb()
  useWeatherStatus()
  const today = todayISO()
  const [filter, setFilter] = useState<StockGroup>('alle')
  const [sel, setSel] = useState<string | null>(null)
  const [order, setOrder] = useState<string | null>(null)
  const all = forecastAll(db, storeId)
  const rows = emptyOrder(all.filter((f) => filter === 'alle' || groupOf(f.article) === filter))
  const series = cupSeries(db, storeId, 7, 14, today)
  const pos = (r: number) => Math.min(100, Math.max(0, (r / SPAN) * 100))
  const ticks = [0, 7, 14, 21, 28]
  const cur = sel ? all.find((f) => f.article.id === sel) : null

  return (
    <>
      <PageHead title="Forecast" hint="Hier siehst du sofort, was als Nächstes leerläuft – und wie viel Wetter, Wochentag und Feiertage dabei eine Rolle spielen." />
      <div className="stack">
        <Card title={<>Wann läuft was leer?<Info text="Jeder Balken reicht von heute bis zum erwarteten Leer-Datum. Der Warenkorb-Punkt zeigt den Tag, bis zu dem du spätestens bestellen solltest. Kritische Artikel stehen automatisch oben. Klicke einen Balken für das Detail-Diagramm." /></>} i={0} tour="empty-bars"
          right={<Segmented value={filter} onChange={setFilter} w={150} options={(Object.keys(GROUP_LABEL) as StockGroup[]).map((g) => ({ value: g, label: GROUP_LABEL[g] }))} />}>
          <div className="eb">
            <div className="eb-axis">
              <span />
              <div className="eb-ticks">{ticks.map((t) => <span key={t} style={{ left: `${(t / SPAN) * 100}%` }}>{t === 0 ? 'Heute' : fmtDayMonth(addDays(today, t))}</span>)}</div>
              <span />
            </div>
            {rows.map((f) => {
              const tone = reachTone(f)
              const crit = tone === 'red'
              const yo = f.article.source === 'zentrale'
              const within = f.reach !== null && f.reach <= SPAN
              const w = within ? Math.max(1.5, pos(f.reach!)) : 100
              const lo = f.latestOrderDate && !f.ordered ? pos(Math.max(0, diffDays(f.latestOrderDate, today)) + 0.5) : null
              const col = tone === 'green' ? 'var(--ok)' : tone === 'yellow' ? 'var(--warn)' : 'var(--bad)'
              const when = !f.emptyDate ? 'reicht länger als 3 Monate' : yo ? roughReach(f.daysLeft) : `leer ${f.daysLeft! <= 0 ? 'heute' : `am ${lbl(f.emptyDate)}`}`
              return (
                <button key={f.article.id} className={`eb-row ${crit ? 'crit' : ''}`} onClick={() => setSel(f.article.id)} aria-label={`${f.article.name}: Detail-Diagramm`}>
                  <span className="eb-name"><ArtIcon article={f.article} size={20} />{f.article.name}{crit && <em>kritisch</em>}</span>
                  <span className="eb-track">
                    {ticks.map((t) => <i key={t} className="eb-grid" style={{ left: `${(t / SPAN) * 100}%` }} />)}
                    <span className={`eb-bar ${within ? '' : 'more'}`} style={{ width: `${w}%`, background: col }} />
                    {lo !== null && lo < w && <span className="eb-order" style={{ left: `${lo}%` }} title="Spätestens hier bestellen"><Icon name="cart" size={12} stroke={2.4} /></span>}
                  </span>
                  <span className="eb-when" style={{ color: col }}>{when}</span>
                </button>
              )
            })}
          </div>
          <div className="legend" role="list">
            <span role="listitem"><i style={{ background: 'var(--ok)' }} />reicht länger</span>
            <span role="listitem"><i style={{ background: 'var(--warn)' }} />unter 7 Tage</span>
            <span role="listitem"><i style={{ background: 'var(--bad)' }} />unter 3 Tage – kritisch</span>
            <span role="listitem"><i className="dot-cart"><Icon name="cart" size={10} stroke={2.6} /></i>spätestens bestellen</span>
            <span role="listitem" className="faint">Vom Headquarter bezogene Artikel: nur grobe Reichweite, keine genauen Mengen</span>
          </div>
        </Card>

        <Card title={<>Erwartete Becher pro Tag<Info text="Für jeden kommenden Tag sucht das System vergangene Tage, die ähnlich waren: gleicher Tagestyp (Mo–Do, Fr, Wochenende, Feiertag) und ähnliches Wetter. Deren Durchschnitt ist die Erwartung. Fahre mit der Maus über eine Säule für die Begründung." /></>} i={1} tour="forecast-chart"
          right={weatherAvailable() ? <span className="fx-chip"><Icon name="wx-sun" size={16} /> Wetter: Open-Meteo</span> : <span className="fx-chip">Wetterdaten gerade nicht verfügbar – nur Wochentag &amp; Feiertage</span>}>
          <div className="cols">
            {(() => { const max = Math.max(1, ...series.map((x) => x.value)); return series.map((x) => {
              const w = wxOn(db, storeId, x.date)
              const hol = holidayOn(db, storeId, x.date)
              const wk = weekdayIdx(x.date) >= 5
              return (
                <div key={x.date} className={`col ${x.future ? 'future' : 'past'} ${wk ? 'wk' : ''} ${hol ? 'hol' : ''} ${x.date === today ? 'today' : ''}`} title={x.future ? x.explain.text : `${lbl(x.date)}: tatsächlich verkauft`}>
                  <span className="col-wx">{w ? <Icon name={wxKind(w).icon} size={18} stroke={1.6} /> : null}</span>
                  <span className="col-n">{fmt0(x.value)}</span>
                  <span className="col-bar" style={{ height: `${Math.max(4, (x.value / max) * 100)}%` }} />
                  <span className="col-d"><b>{x.date === today ? 'Heute' : WEEKDAYS_SHORT[weekdayIdx(x.date)]}</b>{fmtDayMonth(x.date)}</span>
                  {hol && <span className="col-h" title={hol.name}>Feiertag</span>}
                </div>
              )
            }) })()}
          </div>
          <div className="legend"><span><i style={{ background: 'var(--accent-soft)' }} />tatsächlich verkaufte Becher</span><span><i style={{ background: 'var(--ink-3)', opacity: 0.55 }} />erwartete Becher</span><span>hinterlegt: Wochenende bzw. Feiertag</span></div>
        </Card>
      </div>
      {cur && <DetailModal f={cur} storeId={storeId} onClose={() => setSel(null)} onOrder={() => { setOrder(cur.article.id); setSel(null) }} />}
      {order && <ArticleModal storeId={storeId} articleId={order} onClose={() => setOrder(null)} />}
    </>
  )
}

/** Bisheriges Detail-Diagramm: Bestandsverlauf der nächsten 30 Tage */
function DetailModal({ f, storeId, onClose, onOrder }: { f: ArticleForecast; storeId: string; onClose: () => void; onOrder: () => void }) {
  const db = useDb()
  const today = todayISO()
  const a = f.article
  const yo = a.source === 'zentrale'
  const proj = project(db, storeId, a.id, 30, today)
  const pu = (n: number) => (a.category === 'Topping' ? Math.max(0, n) / portionBase(a) : Math.max(0, n))
  const unitName = a.category === 'Topping' ? 'Portionen' : a.unit === 'kg' ? 'g' : 'Stück'
  const ppts = proj.path.map((p) => ({ x: p.date, y: pu(p.stock), tip: yo ? <><b>{lbl(p.date)}</b>{p.stock <= 0 ? 'voraussichtlich leer' : 'Bestand sinkt'}</> : <><b>{fmt0(pu(p.stock))} {unitName}</b>{lbl(p.date)} · erwartet {fmt0(pu(p.use))} Verbrauch</> }))
  const col = f.light === 'green' ? 'var(--ok)' : f.light === 'yellow' ? 'var(--warn)' : 'var(--bad)'
  const v: { x: string; label: string; tone?: 'accent' | 'bad' | 'warn' | 'ok' }[] = [{ x: today, label: 'Heute', tone: 'accent' }]
  if (f.latestOrderDate && f.latestOrderDate > today && f.latestOrderDate <= addDays(today, 30)) v.push({ x: f.latestOrderDate, label: 'Spätestens bestellen', tone: 'warn' })
  if (f.emptyDate && f.emptyDate <= addDays(today, 30)) v.push({ x: f.emptyDate, label: 'Leer am', tone: 'bad' })
  return (
    <Modal onClose={onClose} wide>
      <div className="row wrap" style={{ gap: 14, marginBottom: 16 }}>
        <ArtIcon article={a} size={40} />
        <div>
          <h2>{a.name}</h2>
          <div className="muted">{f.emptyDate ? <>{yo ? roughReach(f.daysLeft) : <>Leer am <b>{fmtDate(f.emptyDate)}</b></>} · spätestens bestellen am <b>{fmtDate(f.latestOrderDate!)}</b></> : 'Reicht laut Prognose länger als 3 Monate.'}</div>
        </div>
        <span className="grow" />
        {f.suggestion && <Pill tone="accent">Bestellvorschlag: {f.suggestion.packs} Pck.{yo ? '' : ` (${fmtQty(a, f.suggestion.qty)})`}</Pill>}
      </div>
      <Curve points={ppts} height={250} color={col} vlines={v} xLabel={lbl} unit={yo ? '' : unitName} yMin={0} showAxis={!yo} />
      <div className="actions"><Btn onClick={onClose}>Schließen</Btn><Btn kind="cta" icon="cart" onClick={onOrder}>Jetzt bestellen</Btn></div>
    </Modal>
  )
}
