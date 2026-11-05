import { useMemo, useState } from 'react'
import { useDb } from '../data/repository'
import { STATE_NAMES } from '../data/stores'
import { go } from '../lib/router'
import { fmt0, fmtEUR, fmtNum2, fmtPct } from '../lib/format'
import { storeKpi, type Kpi } from '../logic/kpi'
import { Icon } from '../icons'
import { Btn, Card, PageHead, Pill } from '../ui/kit'

type Key = 'name' | 'revWeek' | 'revMonth' | 'cupsPerHour' | 'avgBon' | 'growth' | 'growthAdj' | 'lShare' | 'toppingsPerCup' | 'cogsPerCup' | 'staffQuote' | 'onTime' | 'overdueInv'
const COLS: { key: Key; label: string; fmt: (k: Kpi) => string; tip?: string }[] = [
  { key: 'revWeek', label: 'Woche', fmt: (k) => `${fmt0(k.revWeek)} €` },
  { key: 'revMonth', label: 'Monat', fmt: (k) => `${fmt0(k.revMonth)} €` },
  { key: 'cupsPerHour', label: 'Becher/Std.', fmt: (k) => fmtNum2(k.cupsPerHour) },
  { key: 'avgBon', label: 'Ø Bon', fmt: (k) => fmtEUR(k.avgBon) },
  { key: 'growthAdj', label: 'Vorjahr*', fmt: (k) => (k.growthAdj === null ? '–' : `${k.growthAdj > 0 ? '+' : ''}${fmtPct(k.growthAdj)}`) },
  { key: 'cogsPerCup', label: 'Wareneinsatz', fmt: (k) => fmtEUR(k.cogsPerCup) },
  { key: 'staffQuote', label: 'Personal', fmt: (k) => fmtPct(k.staffQuote) },
  { key: 'onTime', label: 'Pünktlich', fmt: (k) => (k.onTime === null ? '–' : fmtPct(k.onTime, 0)) },
  { key: 'overdueInv', label: 'Überf.', fmt: (k) => (k.overdueInv ? `${k.overdueInv}` : '–') },
]

/** HQ-Kennzahlen: Tabelle aller Läden (sortierbar, filterbar) und Detail je Laden */
export function KennzahlenPage({ storeId }: { storeId: string | null }) {
  const db = useDb()
  const [sort, setSort] = useState<{ key: Key; dir: 1 | -1 }>({ key: 'revMonth', dir: -1 })
  const [state, setState] = useState('alle')
  const [city, setCity] = useState('alle')
  const rows = useMemo(() => db.stores.map((s) => ({ s, k: storeKpi(db, s.id) })), [db])
  const states = [...new Set(db.stores.map((s) => s.state))]
  const cities = [...new Set(db.stores.filter((s) => state === 'alle' || s.state === state).map((s) => s.city))].sort((a, b) => a.localeCompare(b, 'de'))
  const list = rows.filter((r) => (state === 'alle' || r.s.state === state) && (city === 'alle' || r.s.city === city))
    .sort((a, b) => (sort.key === 'name' ? a.s.name.localeCompare(b.s.name, 'de') * sort.dir : (((a.k[sort.key] as number | null) ?? -1e9) - ((b.k[sort.key] as number | null) ?? -1e9)) * sort.dir))
  const th = (key: Key, label: string, r = true) => (
    <th key={key} className={`${r ? 'r' : ''} sortable`} aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button onClick={() => setSort({ key, dir: sort.key === key ? (sort.dir === 1 ? -1 : 1) : key === 'name' ? 1 : -1 })}>{label}{sort.key === key ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}</button>
    </th>
  )

  return (
    <>
      <PageHead title="Kennzahlen" hint="Alle Läden im Vergleich: Umsatz, verkaufte Becher und Rechnungen. Klicke eine Spalte zum Sortieren oder einen Laden für Details." />
      <Card title={`${list.length} Läden`} tour="kpi-table" right={
        <div className="row wrap no-print">
          <select className="select" value={state} onChange={(e) => { setState(e.target.value); setCity('alle') }} aria-label="Bundesland"><option value="alle">Alle Bundesländer</option>{states.map((s) => <option key={s} value={s}>{STATE_NAMES[s]}</option>)}</select>
          <select className="select" value={city} onChange={(e) => setCity(e.target.value)} aria-label="Stadt"><option value="alle">Alle Städte</option>{cities.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        </div>}>
        <div className="table-wrap">
          <table className="tbl kpi-tbl">
            <thead><tr>{th('name', 'Laden', false)}{COLS.map((c) => th(c.key, c.label))}<th /></tr></thead>
            <tbody>
              {list.map(({ s, k }) => (
                <tr key={s.id} className="clicky" onClick={() => go(`/zentrale/laeden/${s.id}`)} data-store={s.id}>
                  <td className="strong">{s.name}{s.own && <em className="demo-tag">eigen</em>}{s.demo && <em className="demo-tag">Demo</em>}<div className="faint small">{s.city} · {s.state}</div></td>
                  {COLS.map((c) => <td key={c.key} className={`r ${k.flags.some((f) => f.key === flagOf(c.key)) ? 'warn-cell' : ''}`}>{c.fmt(k)}</td>)}
                  <td className="r"><Icon name="arrow" size={15} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="faint small" style={{ marginTop: 10 }}>Umsatz netto aus der Kasse (Demo-Daten): „Woche“ = 7 Tage, „Monat“ = 30 Tage. *„Vorjahr“ vergleicht den Ist-Wert mit der Prognose für vergleichbare Tage – das Wetter ist herausgerechnet.</p>
      </Card>
    </>
  )
}
const flagOf = (k: Key) => ({ onTime: 'onTime', overdueInv: 'pay', staffQuote: 'staff', growthAdj: 'growth' } as Record<string, string>)[k]

function avgOf(ks: Kpi[]): Kpi {
  const m = (f: (k: Kpi) => number) => ks.reduce((s, k) => s + f(k), 0) / Math.max(1, ks.length)
  return { ...ks[0], revWeek: m((k) => k.revWeek), revMonth: m((k) => k.revMonth), cupsPerHour: m((k) => k.cupsPerHour), avgBon: m((k) => k.avgBon), growth: m((k) => k.growth ?? 0), growthAdj: m((k) => k.growthAdj ?? 0), lShare: m((k) => k.lShare), toppingsPerCup: m((k) => k.toppingsPerCup), cogsPerCup: m((k) => k.cogsPerCup), staffQuote: m((k) => k.staffQuote), onTime: m((k) => k.onTime ?? 100), deviations: m((k) => k.deviations), overdueInv: m((k) => k.overdueInv) }
}

function Stat({ label, value, sub, bad }: { label: string; value: string; sub?: string; bad?: boolean }) {
  return <div className={`kstat ${bad ? 'bad' : ''}`}><span className="cap">{label}</span><b>{value}</b>{sub && <span className="faint small">{sub}</span>}</div>
}

export function KpiBody({ s }: { s: { id: string; name: string; city: string; state: keyof typeof STATE_NAMES; own?: boolean } }) {
  const db = useDb()
  const rows = useMemo(() => db.stores.map((x) => ({ s: x, k: storeKpi(db, x.id) })), [db])
  const cur = rows.find((r) => r.s.id === s.id)
  if (!cur) return null
  return <KpiCards s={s} k={cur.k} avg={avgOf(rows.map((r) => r.k))} />
}

function KpiCards({ s, k, avg }: { s: { id: string; name: string; city: string; state: keyof typeof STATE_NAMES; own?: boolean }; k: Kpi; avg: Kpi }) {
  const flag = (key: string) => k.flags.some((f) => f.key === key)
  const db = useDb()
  const best = useMemo(() => {
    const cut = new Date(Date.now() - 28 * 864e5).toISOString().slice(0, 10)
    const sizeIds = new Set(db.recipes.filter((r) => r.kind === 'size').map((r) => r.id))
    const sums: Record<string, number> = {}
    for (const d of db.saleDays) if (d.storeId === s.id && d.date >= cut) for (const [id, n] of Object.entries(d.counts)) if (sizeIds.has(id)) sums[id] = (sums[id] ?? 0) + n
    const top = Object.entries(sums).sort((a, b) => b[1] - a[1])[0]
    return { label: top ? `Größe ${top[0].slice(-1).toUpperCase()}` : '–', n: top?.[1] ?? 0, total: Object.values(sums).reduce((x, y) => x + y, 0) }
  }, [db, s.id])
  const pm = (n: number | null) => (n === null ? '–' : `${n > 0 ? '+' : ''}${fmtPct(n)}`)
  return (
    <>
      <div className="stack">
        {k.flags.length > 0 && <div className="note warn"><Icon name="warn" /><div><b>Auffällig:</b> {k.flags.map((f) => f.text).join(' · ')}</div></div>}
        <Card title="1 · Umsatz" i={0}>
          <div className="kgrid">
            <Stat label="Umsatz netto, 7 Tage" value={fmtEUR(k.revWeek)} />
            <Stat label="Umsatz netto, 30 Tage" value={fmtEUR(k.revMonth)} sub={`Ø aller Läden ${fmtEUR(avg.revMonth)}`} />
            <Stat label="Becher pro Öffnungsstunde" value={fmtNum2(k.cupsPerHour)} sub={`Ø ${fmtNum2(avg.cupsPerHour)}`} />
            <Stat label="Durchschnittsbon" value={fmtEUR(k.avgBon)} sub="brutto, Demo-Schätzung" />
            <Stat label="Wachstum zum Vorjahr" value={pm(k.growth)} sub="28 Tage, gleiche Wochentage" />
            <Stat label="Wetterbereinigt" value={pm(k.growthAdj)} sub="Ist gegenüber Prognose für vergleichbare Tage" bad={flag('growth')} />
          </div>
        </Card>
        <div className="grid g2">
          <Card title="2 · Bestseller-Becher" i={1}>
            <div className="kgrid two"><Stat label="Meistverkaufte Größe (28 Tage)" value={best.label} sub={best.n ? `${fmt0(best.n)} Becher` : 'noch keine Verkäufe'} /><Stat label="Verkaufte Becher (28 Tage)" value={fmt0(best.total)} /></div>
          </Card>
          <Card title="3 · Kontrollbereiche" i={1}>
            <div className="row wrap" style={{ gap: 8 }}>
              <Btn size="sm" icon="klemmbrett" onClick={() => go(`/zentrale/laeden/${s.id}/inventuren`)}>Inventur</Btn>
              <Btn size="sm" icon="lupe" onClick={() => go(`/zentrale/laeden/${s.id}/warenabgleich`)}>Warenabgleich</Btn>
              <Btn size="sm" icon="paket" onClick={() => go(`/zentrale/laeden/${s.id}/bestellungen`)}>Bestellungen</Btn>
              <Btn size="sm" icon="klemmbrett" onClick={() => go(`/zentrale/laeden/${s.id}/meldungen`)}>Meldungen</Btn>
            </div>
          </Card>
        </div>
        <Card title="4 · Rechnungen" i={3}>
          <div className="kgrid"><Stat label="Offene Rechnungen" value={String(k.openInv)} /><Stat label="Überfällige Rechnungen" value={String(k.overdueInv)} sub={k.overdueInv ? fmtEUR(k.overdueSum) : 'keine'} bad={flag('pay')} /></div>
          <div className="row" style={{ marginTop: 12 }}><Btn kind="glass" size="sm" onClick={() => go('/zentrale/finanzen/rechnungen')}>Zu den Rechnungen</Btn>{!s.own && <Pill>Franchise</Pill>}</div>
        </Card>
      </div>
    </>
  )
}
