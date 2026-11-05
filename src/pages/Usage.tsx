import { Fragment, useMemo, useState } from 'react'
import { useDb } from '../data/repository'
import { go } from '../lib/router'
import { todayISO } from '../lib/date'
import { fmt0, fmt1, fmtDate, fmtPct } from '../lib/format'
import { MONTHS, monthLabel, prevMonth, stichtagOf } from '../logic/inventory'
import { lastMonths, USAGE_GROUPS, usageGroupMonth, usageGroupYear, usageInterim, usageLevel } from '../logic/usage'
import { UsageChart, type UsageBar } from '../ui/UsageChart'
import { SignalChip } from '../ui/signal'
import { Card, Empty, Tabs } from '../ui/kit'

const num = (unit: string, n: number) => (unit === 'Kartons' ? fmt1(n) : fmt0(n))
const short = (ym: string) => MONTHS[+ym.slice(5, 7) - 1].slice(0, 3)

type Mode = 'pulver' | 'becher'
type Range = '6' | 'jahr'
const MODE_PARTS: Record<Mode, { id: string; label: string }[]> = { pulver: [{ id: 'pulver', label: 'Pulver' }], becher: [{ id: 'becher-l', label: 'L' }, { id: 'becher-m', label: 'M' }, { id: 'becher-s', label: 'S' }] }

/** Verbrauch: große Zahl, Vergleich zum Vormonat und ruhiges Balkendiagramm. Im HQ zusätzlich mit „erwartet aus Verkäufen“. Verbrauch ist neutral (keine Signalfarben). */
export function UsagePanel({ storeId, hq }: { storeId: string; hq?: boolean }) {
  const db = useDb()
  const today = todayISO()
  const [mode, setMode] = useState<Mode>('pulver')
  const [range, setRange] = useState<Range>('jahr')
  const unit = mode === 'pulver' ? 'Kartons' : 'Stück'
  const parts = MODE_PARTS[mode]
  const ids = parts.map((p) => p.id)
  const nMonths = range === '6' ? 6 : Math.max(3, Math.min(10, +today.slice(5, 7) - 1))
  const { bars, last, prev, year } = useMemo(() => {
    const bars: UsageBar[] = []
    const used: { ym: string; total: number }[] = []
    for (const ym of lastMonths(nMonths, today)) {
      const per = parts.map((p) => ({ key: p.id, label: p.label, u: usageGroupMonth(db, storeId, [p.id], ym) }))
      if (per.every((x) => x.u.months === 0)) continue
      const total = per.reduce((s, x) => s + x.u.used, 0)
      used.push({ ym, total })
      bars.push({ key: ym, label: short(ym), long: monthLabel(ym), parts: per.map((x) => ({ key: x.key, label: x.label, value: x.u.used })), expected: hq ? per.reduce((s, x) => s + x.u.expected, 0) : undefined })
    }
    const it = usageInterim(db, storeId, ids, today)
    if (it) bars.push({ key: 'interim', label: short(today.slice(0, 7)), long: monthLabel(today.slice(0, 7)), interimUntil: fmtDate(it.until), parts: parts.map((p) => ({ key: p.id, label: p.label, value: it.used[p.id] ?? 0 })) })
    const last = used[used.length - 1], prev = used[used.length - 2]
    return { bars, last, prev: last && prev && prev.ym === prevMonth(last.ym) ? prev : undefined, year: usageGroupYear(db, storeId, ids, +today.slice(0, 4), today) }
  }, [db, storeId, mode, range, hq])
  const d = last && prev && prev.total > 0 ? ((last.total - prev.total) / prev.total) * 100 : null
  const full = bars.filter((b) => !b.interimUntil)
  const avg = full.length ? full.reduce((s, b) => s + b.parts.reduce((a, p) => a + p.value, 0), 0) / full.length : 0
  return (
    <div className="upanel" data-usage={mode}>
      <div className="upanel-head">
        <h2>Verbrauch</h2>
        <div className="row no-print" style={{ gap: 10 }}>
          <Tabs<Mode> value={mode} onChange={setMode} options={[{ value: 'pulver', label: 'Pulver' }, { value: 'becher', label: 'Becher' }]} />
          <Tabs<Range> value={range} onChange={setRange} options={[{ value: '6', label: '6 Monate' }, { value: 'jahr', label: 'Jahr' }]} />
        </div>
      </div>
      {!last ? <Empty icon="chart">Der Verbrauch erscheint, sobald zwei Monatsinventuren gezählt sind.</Empty> : (
        <div className="upanel-body">
          <div className="upanel-big">
            <span className="cap">{monthLabel(last.ym)}</span>
            <b className="ubig">{num(unit, last.total)}<small> {unit}</small></b>
            {d !== null && <span className="neutral-chip">{d > 0 ? '▲' : d < 0 ? '▼' : '●'} {fmtPct(Math.abs(d))} zum Vormonat</span>}
            <span className="usub">Ø {num(unit, avg)} {unit} pro Monat<br />seit Januar {num(unit, year.used)} {unit}</span>
          </div>
          <UsageChart bars={bars} unit={unit} showExpected={hq} />
        </div>
      )}
    </div>
  )
}

export function StoreUsageCard({ storeId }: { storeId: string }) {
  return <Card className="usage-card"><div data-tour="usage"><UsagePanel storeId={storeId} /></div></Card>
}

type Span = 'monat' | 'jahr'
/** HQ: Verbrauch je Laden pro Monat bzw. seit Januar, Summe über alle Läden, erwartet aus den Verkäufen und Abweichung mit Signal */
export function HqUsageCard() {
  const db = useDb()
  const today = todayISO()
  const months = lastMonths(6, today)
  const [span, setSpan] = useState<Span>('monat')
  const [ym, setYm] = useState(months[months.length - 1])
  const [gid, setGid] = useState('pulver')
  const [open, setOpen] = useState<string | null>(null)
  const g = USAGE_GROUPS.find((x) => x.id === gid)!
  const rows = useMemo(() => db.stores.map((s) => ({ s, u: span === 'monat' ? usageGroupMonth(db, s.id, g.ids, ym) : usageGroupYear(db, s.id, g.ids, +today.slice(0, 4), today) }))
    .sort((a, b) => (b.u.months ? Math.abs(b.u.pct ?? 0) : -1) - (a.u.months ? Math.abs(a.u.pct ?? 0) : -1) || a.s.name.localeCompare(b.s.name, 'de')), [db, span, ym, gid])
  const have = rows.filter((r) => r.u.months > 0)
  const sum = { used: have.reduce((s, r) => s + r.u.used, 0), expected: have.reduce((s, r) => s + r.u.expected, 0) }
  const sumPct = sum.expected > 0 ? ((sum.used - sum.expected) / sum.expected) * 100 : null
  const label = span === 'monat' ? monthLabel(ym) : `seit Januar ${today.slice(0, 4)}`
  return (
    <Card title="Verbrauch je Laden" tour="hq-usage" right={
      <div className="row wrap no-print" style={{ gap: 8 }}>
        <select className="select" value={gid} onChange={(e) => setGid(e.target.value)} aria-label="Artikel">{USAGE_GROUPS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select>
        <Tabs<Span> value={span} onChange={setSpan} options={[{ value: 'monat', label: 'Monat' }, { value: 'jahr', label: 'Jahr' }]} />
        {span === 'monat' && <select className="select" value={ym} onChange={(e) => setYm(e.target.value)} aria-label="Monat">{months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}</select>}
      </div>}>
      {span === 'jahr' && <p className="small muted" style={{ marginBottom: 8 }}>Das Jahr beginnt mit der Jahresinventur vom 31.12.{+today.slice(0, 4) - 1}: {db.stores.filter((s) => db.inventories.some((i) => i.storeId === s.id && stichtagOf(i) === `${+today.slice(0, 4) - 1}-12-31`)).length} von {db.stores.length} Läden haben sie gezählt. „Seit Januar“ rechnet von dort bis {monthLabel(lastMonths(1, today)[0])}.</p>}
      <div className="table-wrap">
        <table className="tbl usage-tbl">
          <thead><tr><th>Laden</th><th className="r">Verbrauch ({g.unit})</th><th className="r">Erwartet aus Verkäufen</th><th className="r">Abweichung</th><th>Signal</th></tr></thead>
          <tbody>
            <tr className="sum-row"><td className="strong">Alle Läden · {label}</td><td className="r strong">{num(g.unit, sum.used)}</td><td className="r">{num(g.unit, sum.expected)}</td><td className="r strong">{sumPct === null ? '–' : `${sumPct > 0 ? '+' : ''}${fmtPct(sumPct)}`}</td><td>{sumPct !== null && <SignalChip level={usageLevel(sumPct)} />}</td></tr>
            {rows.map(({ s, u }) => (
              <Fragment key={s.id}>
                <tr className={`clicky ${open === s.id ? 'open' : ''}`} onClick={() => setOpen(open === s.id ? null : s.id)} aria-expanded={open === s.id}>
                  <td className="strong">{s.name}</td>
                  {u.months ? <>
                    <td className="r">{num(g.unit, u.used)}</td><td className="r">{num(g.unit, u.expected)}</td>
                    <td className="r">{u.pct === null ? '–' : `${u.pct > 0 ? '+' : ''}${fmtPct(u.pct)}`}</td>
                    <td><SignalChip level={usageLevel(u.pct)} /></td>
                  </> : <><td className="r muted">–</td><td className="r muted">–</td><td className="r muted">–</td><td><span className="muted small">nicht gezählt</span></td></>}
                </tr>
                {open === s.id && <tr className="uopen"><td colSpan={5}><UsagePanel storeId={s.id} hq /><div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}><button className="btn glass sm" onClick={() => go(`/zentrale/laeden/${s.id}/inventuren`)}>Kontroll-Ansicht öffnen</button></div></td></tr>}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="faint small" style={{ marginTop: 10 }}>Verbrauch = Anfangsbestand + Wareneingang − Endbestand aus den Monatsinventuren. Klicke einen Laden, um sein Diagramm zu öffnen. Erwartet = Kasse, Schwund-Pauschale und gemeldete Abgänge. Bis 5 % Abweichung In Ordnung, bis 10 % Bald, darüber Dringend.</p>
    </Card>
  )
}
const usageWord = (pct: number | null) => ('')

/** HQ, ein Laden: Verbrauch der letzten Monate und seit Januar mit erwartetem Wert, Abweichung und Signal */
export function StoreUsageHq({ storeId }: { storeId: string }) {
  const db = useDb()
  const today = todayISO()
  const months = lastMonths(3, today)
  return (
    <Card title="Verbrauch und erwarteter Verbrauch" tour="usage-hq">
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>Artikel</th>{months.map((m) => <th key={m} className="r">{monthLabel(m)}</th>)}<th className="r">Seit Januar</th></tr></thead>
          <tbody>
            {USAGE_GROUPS.map((g) => {
              const cell = (u: { used: number; expected: number; pct: number | null; months: number }) => u.months === 0 ? <span className="muted">–</span> : (
                <span className="use-cell"><b>{num(g.unit, u.used)} {g.unit}</b><span className="muted small">erwartet {num(g.unit, u.expected)}</span><span className="small">{u.pct === null ? '' : `${u.pct > 0 ? '+' : ''}${fmtPct(u.pct)}`}</span><SignalChip level={usageLevel(u.pct)} /></span>
              )
              return <tr key={g.id}><td className="strong">{g.label}</td>{months.map((m) => <td key={m} className="r">{cell(usageGroupMonth(db, storeId, g.ids, m))}</td>)}<td className="r">{cell(usageGroupYear(db, storeId, g.ids, +today.slice(0, 4), today))}</td></tr>
            })}
          </tbody>
        </table>
      </div>
      <p className="faint small" style={{ marginTop: 10 }}>Verbrauch = Anfangsbestand + Wareneingang − Endbestand. Bis 5 % Abweichung In Ordnung, bis 10 % Bald, darüber Dringend.</p>
    </Card>
  )
}
