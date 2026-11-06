import { actions, useDb } from '../data/repository'
import { STATE_NAMES } from '../data/stores'
import { go } from '../lib/router'
import { addDays, todayISO } from '../lib/date'
import { fmt0, fmtCartons, fmtDate, fmtDayMonth, fmtEUR, fmtPct, fmtQty } from '../lib/format'
import { packsOf } from '../logic/invoice'
import { invoiceState } from '../logic/invoice'
import { countedLate, stichtagOf, groupDiffs, INV_GREEN, INV_YELLOW, monthlyOf, inventoryState, monthLabel, zentraleArticles } from '../logic/inventory'
import { StoreUsageHq } from './Usage'
import { cupsSoldBetween, isUnusual, storeShrinkage } from '../logic/shrinkage'
import { storeCases } from '../logic/cases'
import { stockNow } from '../logic/stock'
import { Icon } from '../icons'
import { Curve } from '../ui/charts'
import { Btn, Card, EmbedCtx, Empty, PageHead, Pill, Tabs, useToast } from '../ui/kit'
import { KpiBody } from './Kennzahlen'
import { ShrinkagePage } from './Shrinkage'
import { CoSteps, coNet, InvoicePill } from '../ui/misc'

/** HQ: Kontroll-Ansicht eines Ladens – nur Kontrolldaten (keine Toppings, keine eigenen Lieferanten, kein Personal) */
export type CtlTab = 'uebersicht' | 'warenabgleich' | 'inventuren' | 'bestellungen' | 'meldungen'
export function StoreControlPage({ storeId, tab = 'uebersicht' }: { storeId: string; tab?: CtlTab }) {
  const db = useDb()
  const toast = useToast()
  const today = todayISO()
  const s = db.stores.find((x) => x.id === storeId)
  if (!s) return <><PageHead title="Laden" hint="Diesen Laden gibt es nicht." /><Card><Empty icon="box">Nicht gefunden.</Empty></Card></>
  const st = inventoryState(db, s.id, today)
  const sh = storeShrinkage(db, s.id, today)
  const allCases = storeCases(db, s.id, today)
  const cases = allCases.filter((c) => c.status !== 'geklärt')
  const invs = monthlyOf(db, s.id)
  const yo = zentraleArticles(db)
  const lastInv = invs[0] ?? null
  const gd = groupDiffs(db, lastInv)
  const cupsPct = [...invs].reverse().map((inv) => ({ inv, g: groupDiffs(db, inv).find((x) => x.key === 'cups') })).filter((x) => x.g)
  const pctVals = cupsPct.map((x) => x.g!.pct)
  const sold7 = cupsSoldBetween(db, s.id, addDays(today, -6), today)
  const sold30 = cupsSoldBetween(db, s.id, addDays(today, -29), today)
  const spark = Array.from({ length: 28 }, (_, i) => { const d = addDays(today, i - 27); return { x: d, y: cupsSoldBetween(db, s.id, d, d), tip: <><b>{fmt0(cupsSoldBetween(db, s.id, d, d))} Becher</b>{fmtDayMonth(d)}</> } })
  const outs = db.outflows.filter((o) => o.storeId === s.id).sort((a, b) => b.date.localeCompare(a.date))
  const cos = db.centralOrders.filter((o) => o.storeId === s.id).sort((a, b) => b.no.localeCompare(a.no)).slice(0, 8)
  const ships = db.centralOrders.filter((o) => o.storeId === s.id && o.shippedOn).sort((a, b) => (b.shippedOn ?? '').localeCompare(a.shippedOn ?? '')).slice(0, 6)
  const invoices = db.invoices.filter((i) => i.storeId === s.id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6)
  const sonderOpen = db.requests.some((r) => r.storeId === s.id && r.kind === 'sonder-inventur' && !r.doneOn)
  const remindOpen = db.requests.some((r) => r.storeId === s.id && r.kind === 'erinnerung' && !r.doneOn)
  const pulverKg = db.articles.find((x) => x.id === 'pulver')?.packSize ?? 10
  const dfmt = (x: { key: string; diff: number }) => `${x.diff > 0 ? '+' : x.diff < 0 ? '−' : ''}${x.key === 'powder' ? fmtCartons(Math.abs(x.diff), pulverKg) : new Intl.NumberFormat('de-DE').format(Math.abs(x.diff))}`

  return (
    <>
      <PageHead title={s.name} hint={`${s.city} · ${STATE_NAMES[s.state]} · ${s.own ? 'HQ-eigen' : 'Franchisenehmer'} – Kontroll-Ansicht des HQ.`}
        right={<div className="row wrap no-print" data-tour="store-actions">
          <Btn kind="primary" icon="inventory" disabled={sonderOpen} onClick={() => { actions.requestFromStore(s.id, 'sonder-inventur'); toast('Sonder-Inventur angefordert – sie erscheint beim Laden als fällige Inventur') }}>{sonderOpen ? 'Sonder-Inventur angefordert' : 'Sonder-Inventur anfordern'}</Btn>
          <Btn kind="glass" icon="bell" disabled={remindOpen} onClick={() => { actions.requestFromStore(s.id, 'erinnerung'); toast('Erinnerung gesendet – sie erscheint beim Laden als Alarm') }}>{remindOpen ? 'Erinnerung gesendet' : 'Erinnerung senden'}</Btn>
          {s.own && <Btn kind="glass" onClick={() => go(`/zentrale/eigene/${s.id}/heute`)}>Laden komplett öffnen</Btn>}
        </div>} />
      <div style={{ marginBottom: 18 }}><Tabs<CtlTab> value={tab} onChange={(t) => go(`/zentrale/laeden/${s.id}/${t}`)} tour="ctl-tabs" options={[{ value: 'uebersicht', label: 'Übersicht' }, { value: 'warenabgleich', label: 'Warenabgleich' }, { value: 'inventuren', label: 'Inventuren' }, { value: 'bestellungen', label: 'Bestellungen & Rechnungen' }, { value: 'meldungen', label: cases.length ? `Meldungen (${cases.length})` : 'Meldungen' }]} /></div>
      <EmbedCtx.Provider value>
        <div className="stack n-stack">
        {tab === 'uebersicht' && <>
        <div className="grid g3">
          <Card title="Monatsinventur" i={0}>
            <Pill tone={st.status === 'erledigt' || st.status === 'noch nicht' ? 'green' : st.status === 'offen' ? 'yellow' : 'red'}>{st.status === 'erledigt' ? `${monthLabel(st.period)}: erledigt am ${fmtDate(st.doneOn!)}` : st.status === 'offen' ? `${monthLabel(st.period)}: offen – Stichtag ${fmtDayMonth(st.due)}` : st.status === 'überfällig' ? `${monthLabel(st.period)}: überfällig` : `nächster Stichtag ${fmtDayMonth(st.due)}`}</Pill>
            <p className="muted small" style={{ marginTop: 10 }}>Letzte Monatsinventur: {st.last ? `Stichtag ${fmtDate(stichtagOf(st.last))}${countedLate(st.last) ? `, gezählt am ${fmtDate(st.last.date)}` : ''}` : 'noch nie'}{st.special ? ' · Sonder-Inventur angefordert' : ''}</p>
          </Card>
          <Card title="Verkaufte Becher laut Kasse" i={1}>
            <div className="row" style={{ gap: 28 }}><div><div className="big" style={{ fontSize: 34 }}>{fmt0(sold7)}</div><span className="muted small">letzte 7 Tage</span></div><div><div className="big" style={{ fontSize: 34 }}>{fmt0(sold30)}</div><span className="muted small">letzte 30 Tage</span></div></div>
          </Card>
          <Card title="Offene Meldungen" i={2}>
            {cases.length === 0 ? <Pill tone="green">keine</Pill> : cases.map((c) => <button key={c.id} className="att-mini" onClick={() => go(`/zentrale/fall/${c.storeId}/${c.kind}`)}><i className={c.level} />{c.title}<Icon name="arrow" size={14} /></button>)}
          </Card>
        </div>

          <KpiBody s={s} />
        </>}
        {tab === 'warenabgleich' && <div data-tour="checks-wrap"><ShrinkagePage storeId={s.id} /></div>}
        {tab === 'inventuren' && <>
        <Card title="Vom Headquarter bezogene Artikel: gezählt und rechnerisch" i={3} right={lastInv && <span className="fx-chip">Monatsinventur vom {fmtDate(stichtagOf(lastInv))}{countedLate(lastInv) ? ` · gezählt am ${fmtDate(lastInv.date)}` : ''}</span>}>
          <table className="tbl">
            <thead><tr><th>Artikel</th><th className="r">Gezählt</th><th className="r">Soll am Zähltag</th><th className="r">Differenz</th><th className="r">Rechnerisch jetzt</th></tr></thead>
            <tbody>
              {yo.map((a) => {
                const l = lastInv?.lines.find((x) => x.articleId === a.id)
                const d = l ? l.counted - l.expected : null
                const p = l ? (d! / Math.max(1, Math.abs(l.expected))) * 100 : 0
                return (
                  <tr key={a.id}>
                    <td className="strong">{a.name}</td>
                    <td className="r">{l ? fmtQty(a, l.counted) : '–'}</td>
                    <td className="r">{l ? fmtQty(a, Math.max(0, l.expected)) : '–'}</td>
                    <td className="r">{d === null ? '–' : <Pill tone={Math.abs(p) <= INV_GREEN ? 'green' : Math.abs(p) <= INV_YELLOW ? 'yellow' : 'red'}>{d > 0 ? '+' : d < 0 ? '−' : ''}{a.unit === 'kg' && a.source === 'zentrale' ? fmtCartons(Math.abs(d), a.packSize) : a.unit === 'kg' ? `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(Math.abs(d) / 1000)} kg` : fmt0(Math.abs(d))} · {fmtPct(Math.abs(p))}</Pill>}</td>
                    <td className="r muted">{fmtQty(a, Math.max(0, stockNow(db, s.id, a.id)))}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {gd.length > 0 && <p className="faint small" style={{ marginTop: 10 }}>Zusammengefasst: {gd.map((x) => `${x.label} ${dfmt(x)} (${fmtPct(Math.abs(x.pct))})`).join(' · ')}</p>}
        </Card>

        <StoreUsageHq storeId={s.id} />

        <div className="grid g2">
          <Card title="Inventur-Differenzen je Monat (Becher)" i={4} right={<span className="fx-chip">grünes Band: bis ±5 %</span>}>
            {cupsPct.length < 2 ? <Empty icon="chart">Noch zu wenige Monatsinventuren.</Empty> : (
              <Curve height={220} band={[-5, 5]} yMin={Math.min(-8, Math.floor(Math.min(...pctVals)) - 2)} yMax={Math.max(6, Math.ceil(Math.max(...pctVals)) + 2)} unit="%" xLabel={fmtDayMonth}
                color={cupsPct[cupsPct.length - 1].g!.light === 'green' ? 'var(--ok)' : cupsPct[cupsPct.length - 1].g!.light === 'yellow' ? 'var(--warn)' : 'var(--bad)'}
                points={cupsPct.map((x) => ({ x: stichtagOf(x.inv), y: x.g!.pct, tip: <><b>{fmtPct(x.g!.pct)}</b>Differenz zum {fmtDate(stichtagOf(x.inv))} ({x.g!.diff > 0 ? '+' : ''}{fmt0(x.g!.diff)} Becher)</> }))} />
            )}
          </Card>
          <Card title="Becher pro Tag laut Kasse" i={5}>
            <Curve points={spark} height={220} unit="Becher" xLabel={fmtDayMonth} />
          </Card>
        </div>

        <div className="grid g2">
          <Card title="Sonstige Abgänge" i={7}>
            {outs.length === 0 ? <Empty icon="sparkle">Keine sonstigen Abgänge eingetragen.</Empty> : outs.slice(0, 8).map((o) => {
              const why = isUnusual(sh.unusualOutflows, o.id)
              return (
                <div className="wx-row" key={o.id}>
                  <div style={{ flex: 1 }}><b>{o.label} {db.articles.find((x) => x.id === o.articleId)?.name}</b><p>{fmtDate(o.date)} · {o.reason}{o.note ? ` · ${o.note}` : ''}</p></div>
                  {why ? <span title={why}><Pill tone="yellow">auffällig</Pill></span> : <Pill tone="green">unauffällig</Pill>}
                </div>
              )
            })}
          </Card>
        </div>
        </>}
        {tab === 'bestellungen' && <>
        <div className="grid g2">
          <Card title="Lieferungen" i={8}>
            {ships.length === 0 ? <Empty icon="box">Keine Lieferungen.</Empty> : ships.map((o) => (
              <div className="wx-row" key={o.id}>
                <span className="wx-ico"><Icon name="truck" size={26} stroke={1.6} /></span>
                <div style={{ flex: 1 }}><b>{o.no} · {o.carrier ?? '–'}</b><p>Sendung {o.trackingNo ?? '–'} · versendet {fmtDate(o.shippedOn!)}</p></div>
                <Pill tone={o.status === 'versendet' ? 'blue' : 'green'}>{o.status === 'versendet' ? 'unterwegs' : 'angekommen'}</Pill>
              </div>
            ))}
          </Card>
        </div>
        <div className="grid g2">
          <Card title="Bestellungen beim HQ" i={9}>
            {cos.length === 0 ? <Empty icon="box">Keine Bestellungen.</Empty> : cos.map((o) => (
              <div key={o.id} className="co-row">
                <div className="row between wrap"><b>{o.no} <span className="muted small" style={{ fontWeight: 500 }}>vom {fmtDate(o.createdOn)}</span></b><span className="strong">{fmtEUR(coNet(db, o))} netto</span></div>
                <CoSteps status={o.status} />
                <p className="muted small">{o.lines.map((l) => `${packsOf(l)} × ${db.articles.find((a) => a.id === l.articleId)?.name}`).join(' · ')}</p>
              </div>
            ))}
          </Card>
          <Card title="Rechnungen" i={10}>
            {invoices.length === 0 ? <Empty icon="invoice">Keine Rechnungen.</Empty> : invoices.map((i) => (
              <button key={i.id} className="wx-row att-btn" onClick={() => go(`/zentrale/rechnungen/${i.id}`)}>
                <div style={{ flex: 1, textAlign: 'left' }}><b>{i.number}</b><p>{fmtDate(i.date)} · {fmtEUR(i.gross)} brutto</p></div>
                <InvoicePill state={invoiceState(i, today)} />
              </button>
            ))}
          </Card>
        </div>
        </>}
        {tab === 'meldungen' && (
          <Card title="Meldungen dieses Ladens">
            {allCases.length === 0 ? <Empty icon="check">Keine Meldungen – alles unauffällig.</Empty> : allCases.map((c) => (
              <div key={c.id} className="att" data-case={c.id}>
                <i className={`att-dot ${c.level}`} />
                <div className="att-main"><b>{c.title}</b><span>{c.text}</span></div>
                <Pill tone={c.status === 'geklärt' ? 'green' : c.status === 'in Klärung' ? 'blue' : ''}>{c.status}</Pill>
                <Btn onClick={() => go(`/zentrale/fall/${c.storeId}/${c.kind}`)}>Meldung öffnen</Btn>
              </div>
            ))}
          </Card>
        )}
        </div>
      </EmbedCtx.Provider>
    </>
  )
}
