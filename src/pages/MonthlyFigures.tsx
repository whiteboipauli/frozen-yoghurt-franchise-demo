import { useEffect, useState } from 'react'
import { actions, useDb } from '../data/repository'
import { hash01 } from '../data/seedHr'
import { todayISO } from '../lib/date'
import { fmtDate, fmtEUR, fmtPct } from '../lib/format'
import { COST_KEYS, COST_LABEL, costLevel, dueReportMonth, goodsOf, reportOf, storeMonthFin, type CostKey } from '../logic/finance'
import { monthBounds } from '../logic/fees'
import { lastMonthsOf, monthLabel, prevMonth } from '../logic/inventory'
import { Icon } from '../icons'
import { Signal, SignalChip } from '../ui/signal'
import { Btn, Card, Empty, PageHead, useToast } from '../ui/kit'

const num = (t: string) => { const n = parseFloat(t.replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) && n >= 0 ? n : null }
const show = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',')
type Key = 'rev' | CostKey
const EMPTY: Record<Key, string> = { rev: '', goods: '', staff: '', rent: '', other: '' }

/** Monatsabschluss: Umsatz laut Kasse und Kosten melden, mit Summen, Ergebnis und Quoten. Das HQ sieht daraus nur Summen und Quoten. */
export function MonthlyFiguresPage({ storeId }: { storeId: string }) {
  const db = useDb()
  const toast = useToast()
  const today = todayISO()
  const due = dueReportMonth(db, storeId, today)
  const months = lastMonthsOf(prevMonth(today.slice(0, 7)), 4)
  const [ym, setYm] = useState(due ?? months[0])
  const existing = reportOf(db, storeId, ym)
  const [v, setV] = useState<Record<Key, string>>(EMPTY)
  const [datev, setDatev] = useState(false)
  useEffect(() => {
    const r = reportOf(db, storeId, ym)
    setV(r ? { rev: show(r.revenue), goods: show(r.goodsCost), staff: show(r.staffCost), rent: show(r.rent), other: show(r.otherCost) } : EMPTY)
    setDatev(!!r?.datev)
  }, [ym, storeId])

  const n = { rev: num(v.rev), goods: num(v.goods), staff: num(v.staff), rent: num(v.rent), other: num(v.other) }
  const ok = Object.values(n).every((x) => x !== null) && n.rev! > 0
  const total = COST_KEYS.reduce((s, k) => s + (n[k] ?? 0), 0)
  const result = (n.rev ?? 0) - total
  const targets = db.settings.costTargets
  const reports = db.monthlyReports.filter((r) => r.storeId === storeId).sort((a, b) => b.ym.localeCompare(a.ym))

  const fromDatev = () => {
    const [mf, mt] = monthBounds(ym)
    const rev = storeMonthFin(db, storeId, ym, today).revenue
    const sys = goodsOf(db, storeId, mf, mt)
    const h = (k: string) => hash01(storeId + ym + k)
    const goods = sys.goods + sys.packaging > 0 ? sys.goods + sys.packaging : rev * 0.305
    setV({
      rev: show(Math.round(rev * (0.997 + h('r') * 0.006))),
      goods: show(Math.round(goods)),
      staff: show(Math.round(rev * (0.27 + h('s') * 0.035))),
      rent: show(Math.round((rev * (0.065 + h('m') * 0.02)) / 50) * 50),
      other: show(Math.round(rev * (0.043 + h('o') * 0.014))),
    })
    setDatev(true)
    toast('Beispielwerte aus DATEV (Demo) übernommen')
  }
  const save = () => {
    actions.reportMonth(storeId, ym, { revenue: n.rev!, goodsCost: n.goods!, staffCost: n.staff!, rent: n.rent!, otherCost: n.other!, datev })
    toast(`Monatsabschluss ${monthLabel(ym)} gemeldet – danke!`)
  }
  const field = (key: Key, label: string, hint: string) => (
    <div className="field">
      <label>{label}{datev && <span className="datev-chip">aus DATEV (Demo)</span>}</label>
      <div className="eur-field"><input className="input" inputMode="decimal" placeholder="0,00" value={v[key]} onChange={(e) => setV({ ...v, [key]: e.target.value })} aria-label={label} /><span>€</span></div>
      <span className="faint small">{hint}</span>
    </div>
  )
  return (
    <>
      <PageHead title={`Monatsabschluss ${monthLabel(ym)}`} hint="Einmal im Monat, ab dem 1. des Folgemonats. Das HQ sieht daraus nur Summen und Quoten." />
      <div className="stack n-stack">
        <section className="glass card in inv-status" data-tour="monthly-status">
          <Signal level={due ? 'bernstein' : 'gruen'} size={32} pulse={!!due} />
          <div className="grow">
            <h2>{due ? `Monatsabschluss ${monthLabel(due)}: noch nicht gemeldet` : `Monatsabschluss ${monthLabel(prevMonth(today.slice(0, 7)))}: gemeldet`}</h2>
            <p className="muted">{due ? 'Bis dahin rechnet das HQ mit den Quoten des Vormonats und markiert sie als „geschätzt“.' : 'Danke! Die nächste Meldung ist ab dem 1. des nächsten Monats möglich.'}</p>
          </div>
          {due && <SignalChip level="bernstein" variant="uhr">offen</SignalChip>}
        </section>

        <Card title="Zahlen eintragen" tour="monthly-form" right={
          <div className="row" style={{ gap: 10 }}>
            <Btn icon="download" onClick={fromDatev} data-tour="datev">Aus DATEV übernehmen (Demo)</Btn>
            <select className="select" value={ym} onChange={(e) => setYm(e.target.value)} aria-label="Monat">{months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}</select>
          </div>}>
          <p className="faint small" style={{ marginTop: -6, marginBottom: 14 }}><Icon name="info" size={14} /> Später automatisch aus DATEV. Die Werte bleiben editierbar.</p>
          <div className="mf-grid mf-5">
            {field('rev', 'Monatsumsatz laut Kasse', 'Netto-Umsatz aus dem Kassenabschluss.')}
            {field('goods', 'Warenkosten (Einkauf)', 'Pulver, Becher, Toppings und Verpackung.')}
            {field('staff', 'Personalkosten', 'Löhne inkl. Nebenkosten, alles zusammen.')}
            {field('rent', 'Miete', 'Miete inkl. Nebenkosten für den Laden.')}
            {field('other', 'Sonstige Nebenkosten', 'Strom, Wasser, Versicherung, Marketing usw.')}
          </div>

          <div className="mf-sum" data-tour="monthly-sum">
            <div className="mf-total"><span className="cap">Gesamtkosten</span><b>{fmtEUR(total)}</b></div>
            <div className="mf-total"><span className="cap">Ergebnis (Umsatz minus Kosten)</span><b className={result < 0 ? 'neg' : ''}>{fmtEUR(result)}</b></div>
            <div className="mf-quotes">
              {COST_KEYS.map((k) => {
                const pct = n.rev && n[k] !== null ? (n[k]! / n.rev) * 100 : null
                return (
                  <div key={k} className="mf-q">
                    <span className="cap">{COST_LABEL[k]}</span>
                    <b>{pct === null ? '–' : fmtPct(pct)}</b>
                    <span className="muted small">Richtwert {fmtPct(targets[k], 0)}</span>
                    {pct !== null && <SignalChip level={costLevel(pct, targets[k])} />}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: 18, gap: 14, flexWrap: 'wrap' }}>
            <span className="muted">{existing ? `Bereits gemeldet am ${fmtDate(existing.reportedOn)} – du kannst die Zahlen noch ändern.` : 'Noch nichts für diesen Monat gemeldet.'}</span>
            <Btn kind="primary" size="lg" disabled={!ok} onClick={save}>{existing ? 'Zahlen aktualisieren' : 'Zahlen melden'}</Btn>
          </div>
        </Card>

        <Card title="Bisher gemeldet">
          {reports.length === 0 ? <Empty icon="euro">Noch keine Monatsabschlüsse gemeldet.</Empty> : (
            <div className="table-wrap"><table className="tbl">
              <thead><tr><th>Monat</th><th className="r">Umsatz</th><th className="r">Waren</th><th className="r">Personal</th><th className="r">Miete</th><th className="r">Sonstiges</th><th>Gemeldet am</th></tr></thead>
              <tbody>{reports.slice(0, 12).map((r) => <tr key={r.id}><td className="strong">{monthLabel(r.ym)}</td><td className="r">{fmtEUR(r.revenue)}</td><td className="r">{fmtEUR(r.goodsCost)}</td><td className="r">{fmtEUR(r.staffCost)}</td><td className="r">{fmtEUR(r.rent)}</td><td className="r">{fmtEUR(r.otherCost)}</td><td>{fmtDate(r.reportedOn)}</td></tr>)}</tbody>
            </table></div>
          )}
        </Card>
      </div>
    </>
  )
}
