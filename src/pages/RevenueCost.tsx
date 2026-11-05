import { useMemo, useState } from 'react'
import { actions, useDb } from '../data/repository'
import type { CostTargets } from '../data/types'
import { go } from '../lib/router'
import { addDays, todayISO, WEEKDAYS_SHORT, weekdayIdx } from '../lib/date'
import { fmt0, fmtDate, fmtEUR, fmtPct } from '../lib/format'
import { COST_KEYS, COST_LABEL, COST_SHORT, costLevel, dayRevenueOf, quotesOf, reportMismatch, storeMonthFin, storeYearFin, sumFin, worstHint, type CostKey, type Fin } from '../logic/finance'
import { monthLabel, lastMonthsOf, prevMonth } from '../logic/inventory'
import { Signal, SignalChip, type Level } from '../ui/signal'
import { Btn, Card, Modal, Tabs, useToast } from '../ui/kit'

type Span = 'tag' | 'monat' | 'jahr'
const pct = (n: number | null) => (n === null ? '–' : fmtPct(n))
const signed = (n: number) => `${n > 0 ? '+' : ''}${fmtPct(n)}`

/** Richtwerte der Kostenquoten ändern (Platzhalter) */
function TargetsDialog({ onClose }: { onClose: () => void }) {
  const db = useDb()
  const toast = useToast()
  const [v, setV] = useState<Record<CostKey, string>>(() => Object.fromEntries(COST_KEYS.map((k) => [k, String(db.settings.costTargets[k]).replace('.', ',')])) as Record<CostKey, string>)
  const num = (t: string) => { const n = parseFloat(t.replace(',', '.')); return Number.isFinite(n) && n > 0 && n < 100 ? n : null }
  const ok = COST_KEYS.every((k) => num(v[k]) !== null)
  return (
    <Modal onClose={onClose}>
      <h2>Richtwerte ändern</h2>
      <p className="muted" style={{ margin: '4px 0 12px' }}>Anteil am Umsatz in Prozent. Das sind Platzhalter – trage hier die Werte ein, die für dein Netz gelten. Bis 15 % über dem Richtwert zeigt die Karte „Bald“, weiter darüber „Dringend“. Eine Quote unter dem Richtwert ist immer „In Ordnung“.</p>
      <div className="field-grid">
        {COST_KEYS.map((k) => <div className="field" key={k}><label>{COST_LABEL[k]} (%)</label><input className="input" inputMode="decimal" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} aria-label={`Richtwert ${COST_LABEL[k]}`} /></div>)}
      </div>
      <div className="row" style={{ justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
        <Btn kind="glass" onClick={onClose}>Abbrechen</Btn>
        <Btn kind="primary" disabled={!ok} onClick={() => { actions.setCostTargets(Object.fromEntries(COST_KEYS.map((k) => [k, num(v[k])!])) as unknown as CostTargets); toast('Richtwerte gespeichert'); onClose() }}>Speichern</Btn>
      </div>
    </Modal>
  )
}

/** Quote mit Symbol (Signal) – nie nur Farbe */
const QuoteCell = ({ value, target }: { value: number | null; target: number }) => {
  if (value === null) return <span className="muted">–</span>
  const lv = costLevel(value, target)
  return <span className="qcell"><Signal level={lv} size={16} />{pct(value)}</span>
}

/** HQ-Cockpit, ganz oben: Umsatz und Kosten – Tag, Monat oder Jahr, Quoten mit Richtwert und Signal */
export function RevenueCostCard() {
  const db = useDb()
  const today = todayISO()
  const [span, setSpan] = useState<Span>('tag')
  const [day, setDay] = useState(addDays(today, -1))
  const lastFull = prevMonth(today.slice(0, 7))
  const months = useMemo(() => lastMonthsOf(lastFull, 10), [today])
  const [ym, setYm] = useState(lastFull)
  const [all, setAll] = useState(false)
  const [edit, setEdit] = useState(false)
  const targets = db.settings.costTargets
  const year = +today.slice(0, 4)
  
  const rows = useMemo(() => db.stores.map((s) => {
    if (span === 'tag') {
      const rev = dayRevenueOf(db, s.id, day), prev = dayRevenueOf(db, s.id, addDays(day, -7))
      return { s, rev, prev, fin: storeMonthFin(db, s.id, lastFull, today) as Fin & { quoteRevenue?: number }, mm: null as number | null }
    }
    const fin = span === 'monat' ? storeMonthFin(db, s.id, ym, today) : storeYearFin(db, s.id, year, today)
    return { s, rev: fin.revenue, prev: 0, fin: fin as Fin & { quoteRevenue?: number }, mm: span === 'monat' ? reportMismatch(db, s.id, ym, today) : null }
  }).map((r) => {
    // auffälligste zuerst: schlechteste Ampel, dann Größe der Abweichung (Tag: stärkster Rückgang zur Vorwoche)
    const h = span === 'tag' ? null : worstHint(r.fin, targets, r.mm)
    const q = quotesOf(r.fin)
    const dev = Math.max(0, ...COST_KEYS.map((k) => (q[k] === null ? 0 : q[k]! / targets[k])), Math.abs(r.mm ?? 0) / 10)
    const score = span === 'tag' ? (r.prev > 0 ? (r.prev - r.rev) / r.prev : 0) : (h ? (h.level === 'rot' ? 2000 : 1000) : 0) + dev * 100
    return { ...r, score }
  }).sort((a, b) => b.score - a.score || b.rev - a.rev), [db, span, day, ym, today, targets])

  const total = sumFin(rows.map((r) => r.fin))
  const totalRev = rows.reduce((s, r) => s + r.rev, 0)
  const totalPrev = rows.reduce((s, r) => s + r.prev, 0)
  const q = quotesOf(total)
  const quotePeriod = span === 'tag' ? `letzter abgeschlossener Monat (${monthLabel(lastFull)})` : span === 'monat' ? monthLabel(ym) : `Jahr ${year}, Januar bis ${monthLabel(lastFull).split(' ')[0]}`
  const list = all ? rows : rows.slice(0, 8)
  const dayOpts = Array.from({ length: 7 }, (_, i) => addDays(today, -1 - i))

  return (
    <section className="glass card in rc-card" data-tour="revcost">
      <div className="card-head">
        <h2>Umsatz und Kosten</h2>
        <div className="row wrap no-print" style={{ gap: 8 }}>
          <Tabs<Span> value={span} onChange={setSpan} options={[{ value: 'tag', label: 'Tag' }, { value: 'monat', label: 'Monat' }, { value: 'jahr', label: 'Jahr' }]} />
          {span === 'tag' && <select className="select" value={day} onChange={(e) => setDay(e.target.value)} aria-label="Tag">{dayOpts.map((d) => <option key={d} value={d}>{WEEKDAYS_SHORT[weekdayIdx(d)]}, {fmtDate(d)}</option>)}</select>}
          {span === 'monat' && <select className="select" value={ym} onChange={(e) => setYm(e.target.value)} aria-label="Monat">{months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}</select>}
        </div>
      </div>

      <div className="rc-top">
        <div className="rc-total">
          <span className="cap">{span === 'tag' ? `Umsatz am ${WEEKDAYS_SHORT[weekdayIdx(day)]}, ${fmtDate(day)} (netto)` : span === 'monat' ? `Umsatz ${monthLabel(ym)} (netto)` : `Umsatz ${year}, Januar bis ${monthLabel(lastFull).split(' ')[0]} (netto)`}</span>
          <b className="big-num">{fmtEUR(totalRev)}</b>
          {span === 'tag' && totalPrev > 0 && <span className="rc-cmp">{totalRev >= totalPrev ? '▲' : '▼'} {signed(((totalRev - totalPrev) / totalPrev) * 100)} zum {WEEKDAYS_SHORT[weekdayIdx(day)]} der Vorwoche ({fmtEUR(totalPrev)})</span>}
          {span !== 'tag' && <span className="muted small">alle {rows.length} Läden</span>}
        </div>
        <div className="rc-quotes">
          <div className="rc-qhead"><span className="cap">Kostenquoten in % vom Umsatz · {quotePeriod}</span>{total.estimated && <SignalChip level="info" variant="uhr">geschätzt</SignalChip>}<Btn size="sm" kind="glass" onClick={() => setEdit(true)}>Richtwerte ändern</Btn></div>
          <div className="rc-qgrid">
            {COST_KEYS.map((k) => {
              const lv = costLevel(q[k], targets[k])
              return (
                <div key={k} className={`rc-q tint-${lv}`} data-cost={k}>
                  <span className="cap">{COST_LABEL[k]}</span>
                  <b>{pct(q[k])}</b>
                  <span className="muted small">Richtwert {fmtPct(targets[k], 0)}</span>
                  {q[k] !== null && <SignalChip level={lv} />}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="table-wrap">
        <table className="tbl rc-tbl">
          <thead>
            <tr>
              <th>Laden</th>
              <th className="r">Umsatz</th>
              {span === 'tag' ? <><th className="r">Vorwoche</th><th className="r">Veränderung</th></> : <>{COST_KEYS.map((k) => <th key={k} className="r">{COST_SHORT[k]}</th>)}<th>Hinweis</th></>}
            </tr>
          </thead>
          <tbody>
            <tr className="sum-row">
              <td className="strong">Alle Läden</td><td className="r strong">{fmtEUR(totalRev)}</td>
              {span === 'tag' ? <><td className="r">{fmtEUR(totalPrev)}</td><td className="r strong">{totalPrev > 0 ? `${totalRev >= totalPrev ? '▲' : '▼'} ${signed(((totalRev - totalPrev) / totalPrev) * 100)}` : '–'}</td></>
                : <>{COST_KEYS.map((k) => <td key={k} className="r"><QuoteCell value={q[k]} target={targets[k]} /></td>)}<td /></>}
            </tr>
            {list.map(({ s, rev, prev, fin, mm }) => {
              const hint = span === 'tag' ? null : worstHint(fin, targets, mm)
              const sq = quotesOf(fin)
              const d = prev > 0 ? ((rev - prev) / prev) * 100 : null
              return (
                <tr key={s.id} className="clicky" onClick={() => go(`/zentrale/laeden/${s.id}`)} data-store={s.id}>
                  <td className="strong">{s.name}{span !== 'tag' && fin.estimated && !fin.missing && <div className="faint small">Kosten geschätzt</div>}</td>
                  <td className="r">{fmtEUR(rev)}</td>
                  {span === 'tag' ? <><td className="r muted">{fmtEUR(prev)}</td><td className="r">{d === null ? '–' : `${d >= 0 ? '▲' : '▼'} ${signed(d)}`}</td></>
                    : <>{COST_KEYS.map((k) => <td key={k} className="r"><QuoteCell value={sq[k]} target={targets[k]} /></td>)}<td>{fin.missing ? <span className="muted small">noch keine Meldung</span> : hint ? <span className="hint-cell"><SignalChip level={hint.level} /><span className="small muted">{hint.text}</span></span> : <Signal level="gruen" size={18} />}</td></>}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="row" style={{ justifyContent: 'space-between', marginTop: 10, gap: 10, flexWrap: 'wrap' }}>
        <p className="faint small" style={{ maxWidth: 780 }}>Kosten laut Monatsabschluss der Läden; fehlt er, gilt die Quote des Vormonats („geschätzt“). Das HQ sieht nur Summen und Quoten.{span === 'tag' ? ' Umsatz laut Kasse, netto.' : ''}</p>
        {rows.length > 8 && <Btn kind="glass" size="sm" onClick={() => setAll(!all)}>{all ? 'Weniger anzeigen' : `Alle ${rows.length} Läden anzeigen`}</Btn>}
      </div>
      {edit && <TargetsDialog onClose={() => setEdit(false)} />}
    </section>
  )
}
void fmt0
