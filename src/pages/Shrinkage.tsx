import { useDb } from '../data/repository'
import { go } from '../lib/router'
import { fmt0, fmtDate, fmtDayMonth, fmtPct, fmtQty } from '../lib/format'
import { isUnusual, storeShrinkage, type Flow } from '../logic/shrinkage'
import { storeChecks } from '../logic/checks'
import { storeCases, storeLight } from '../logic/cases'
import { Btn } from '../ui/kit'
import { Icon } from '../icons'
import { Curve } from '../ui/charts'
import { Card, Empty, Info, PageHead, Pill } from '../ui/kit'
import type { Article } from '../data/types'
import type { Light } from '../logic/forecast'

const COLOR: Record<Light, string> = { green: 'var(--ok)', yellow: 'var(--warn)', red: 'var(--bad)' }

/** Balken-Fluss: Geliefert → Verkauft → Pauschale → Sonstige Abgänge → Unerklärt */
export function FlowChart({ f, light, fmt, pauschalePct, tour }: { f: Flow; light: Light; fmt: (n: number) => string; pauschalePct: number; tour?: string }) {
  const D = f.delivered
  const w = (n: number) => `${Math.max(0, (n / D) * 100)}%`
  const rows: { lbl: string; sub?: string; start: number; len: number; color: string; val: string; hot?: boolean }[] = [
    { lbl: 'Geliefert', sub: 'von der Zentrale an die Filiale', start: 0, len: D, color: 'linear-gradient(90deg,#c3cfdf,#8fa0b8)', val: fmt(D) },
    { lbl: 'Verkauft laut Kasse', sub: 'aus allen Kassenbuchungen', start: 0, len: f.sold, color: 'linear-gradient(90deg,var(--accent-soft),var(--accent))', val: fmt(f.sold) },
    { lbl: `Schwund-Pauschale ${new Intl.NumberFormat('de-DE').format(pauschalePct)} %`, sub: 'üblicher Verlust, vom HQ festgelegt', start: f.sold, len: f.pauschale, color: 'linear-gradient(90deg,#ffd27a,#f5a30b)', val: fmt(f.pauschale) },
    { lbl: 'Sonstige Abgänge', sub: 'von der Filiale eingetragen', start: f.sold + f.pauschale, len: f.outflows, color: 'linear-gradient(90deg,#9fc4f5,#4a90e2)', val: fmt(f.outflows) },
    { lbl: 'Unerklärt', sub: `${fmtPct(f.pct)} der Lieferung`, start: f.sold + f.pauschale + f.outflows, len: Math.max(0, f.unexplained), color: `linear-gradient(90deg, ${COLOR[light]}, ${COLOR[light]})`, val: `${fmt(Math.max(0, f.unexplained))}`, hot: light !== 'green' },
  ]
  return (
    <div className="flow" data-tour={tour}>
      {rows.map((r) => (
        <div key={r.lbl} className={`flow-row ${r.hot ? 'hot' : ''}`}>
          <div className="lbl">{r.lbl}<small>{r.sub}</small></div>
          <div className="flow-bar"><span style={{ left: w(r.start), width: w(r.len), background: r.color, boxShadow: r.hot ? `0 0 18px ${COLOR[light]}` : undefined }} /></div>
          <b style={r.hot ? { color: COLOR[light] } : undefined}>{r.val}</b>
        </div>
      ))}
    </div>
  )
}

const SENTENCE_PREFIX = { green: 'Das passt zusammen.', yellow: 'Ein kleiner Hinweis:', red: 'Ein Hinweis zum Nachfragen:' }

export function ShrinkagePage({ storeId }: { storeId: string | null }) {
  const db = useDb()
  const all = db.stores.map((s) => ({ s, sh: { ...storeShrinkage(db, s.id), light: storeLight(db, s.id) } }))
  const cur = all.find((x) => x.s.id === storeId) ?? all.find((x) => x.sh.light !== 'green') ?? all[0]
  const { s, sh } = cur
  const cupsA = db.articles.find((a) => a.id === 'becher-m') as Article
  const powA = db.articles.find((a) => a.id === 'pulver') as Article
  const cupFmt = (n: number) => `${fmt0(n)} Becher`
  const powFmt = (n: number) => fmtQty(powA, n)
  const trend = sh.trend
  const checks = storeChecks(db, s.id)
  const cases = storeCases(db, s.id)
  void cupsA
  return (
    <>
      <PageHead
        title="Warenabgleich"
        hint="Hier siehst du, ob die gelieferte Ware zu dem passt, was an der Kasse verkauft wurde – automatisch, ohne Zählen."
        right={
          <select className="select" value={s.id} onChange={(e) => go(`/zentrale/warenabgleich/${e.target.value}`)} aria-label="Laden wählen" data-tour="wa-select">
            {[...all].sort((x, y) => ({ red: 0, yellow: 1, green: 2 }[x.sh.light] - { red: 0, yellow: 1, green: 2 }[y.sh.light]) || x.s.name.localeCompare(y.s.name, 'de')).map((x) => <option key={x.s.id} value={x.s.id}>{x.sh.light === 'green' ? '' : x.sh.light === 'red' ? '● ' : '○ '}{x.s.name}{x.sh.light === 'green' ? '' : x.sh.light === 'red' ? ' (rot)' : ' (gelb)'}</option>)}
          </select>
        }
      />
      <div className="stack">
        <Card title={<>{s.name}: Becher<Info text="Ein Becher wird geliefert und entweder verkauft, geht als üblicher Schwund verloren (Pauschale) oder wird als sonstiger Abgang eingetragen. Was übrig bleibt, ist „unerklärt“." /></>} i={0}
          right={sh.cups && <span className="fx-chip">{fmtDayMonth(sh.cups.from)} – {fmtDayMonth(sh.cups.to)} · letzte 6 Wochen</span>}>
          {sh.cups ? (
            <div className="grid" style={{ gridTemplateColumns: '1fr 320px', gap: 34, alignItems: 'center' }}>
              <FlowChart f={sh.cups} light={sh.cupsLight} fmt={cupFmt} pauschalePct={db.settings.shrink['becher-m'] ?? 0} tour="flow-cups" />
              <div className="say"><b style={{ color: COLOR[sh.cupsLight] }}>{SENTENCE_PREFIX[sh.cupsLight]}</b><br />{sentence(sh.cupsLight, 'Becher', sh.cups.pct)}</div>
            </div>
          ) : <Empty icon="chart">Noch nicht genug Lieferungen für eine Auswertung.</Empty>}
        </Card>

        <Card title={`${s.name}: Pulver`} i={1} right={sh.powder && <span className="fx-chip">{fmtDayMonth(sh.powder.from)} – {fmtDayMonth(sh.powder.to)}</span>}>
          {sh.powder ? (
            <div className="grid" style={{ gridTemplateColumns: '1fr 320px', gap: 34, alignItems: 'center' }}>
              <FlowChart f={sh.powder} light={sh.powderLight} fmt={powFmt} pauschalePct={db.settings.shrink['pulver'] ?? 0} />
              <div className="say"><b style={{ color: COLOR[sh.powderLight] }}>{SENTENCE_PREFIX[sh.powderLight]}</b><br />{sentence(sh.powderLight, 'Pulver', sh.powder.pct)}</div>
            </div>
          ) : <Empty icon="chart">Noch nicht genug Lieferungen.</Empty>}
        </Card>

        <Card title={<>Rollierender Mehrbezug<Info text="Mehrbezug = der Anteil der Lieferung, den Kasse, Pauschale und sonstige Abgänge nicht erklären. Die Kurve zeigt ihn für die letzten 6 Wochen, Tag für Tag. Das grüne Band ist der Bereich, der als normal gilt." /></>} i={2}
          right={<span className="fx-chip">Becher · grün bis {db.settings.greenUntil} % · rot ab {db.settings.yellowUntil} %</span>}>
          <Curve points={trend.map((p) => ({ x: p.x, y: p.y, tip: <><b>{fmtPct(p.y)} unerklärt</b>{fmtDate(p.x)}</> }))} height={250} color={COLOR[sh.cupsLight]} band={[-1, db.settings.greenUntil]} hlines={[{ y: db.settings.yellowUntil, label: `Rot ab ${db.settings.yellowUntil} %` }]} xLabel={fmtDayMonth} unit="%" />
        </Card>

        <Card title={<>Weitere Prüfungen<Info text="Sieben zusätzliche Prüfungen pro Laden, jeweils mit Ampel. Gelb und rot sind Hinweise zum Nachfragen, kein Urteil. Bei echten Läden gibt es höchstens harmlose Hinweise." /></>} i={3} tour="checks" right={<span className="fx-chip">{checks.filter((c) => c.light !== 'green').length} auffällig</span>}>
          <div className="checks-grid">
            {checks.map((c) => {
              const cs = cases.find((x) => x.kind === c.kind)
              return (
                <div key={c.kind} className={`check-card ${c.light}`}>
                  <div className="row between"><b>{c.title}</b><span className={`pill ${c.light}`}><span className="dot" />{c.light === 'green' ? 'in Ordnung' : c.light === 'yellow' ? 'Hinweis' : 'auffällig'}</span></div>
                  <div className="check-val">{c.value}</div>
                  <p className="small muted">{c.text}</p>
                  {c.note && <p className="faint small"><Icon name="info" size={13} /> {c.note}</p>}
                  {cs ? <Btn size="sm" kind="glass" onClick={() => go(`/zentrale/fall/${s.id}/${cs.kind}`)}>Meldung öffnen ({cs.status})</Btn> : c.light !== 'green' ? <span className="faint small">Nur ein Hinweis – kein Fall</span> : null}
                </div>
              )
            })}
          </div>
        </Card>

        <Card title="Sonstige Abgänge dieser Filiale" i={4} right={<span className="small muted">letzte 30 Tage</span>}>
          {db.outflows.filter((o) => o.storeId === s.id).length === 0 ? <Empty icon="sparkle">Keine sonstigen Abgänge eingetragen.</Empty> : db.outflows.filter((o) => o.storeId === s.id).sort((a, b) => b.date.localeCompare(a.date)).map((o) => {
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
    </>
  )
}

function sentence(l: Light, what: string, pct: number) {
  const p = fmtPct(pct)
  if (l === 'green') return `Die Abweichung bei ${what} liegt bei ${p} – das ist im üblichen Rahmen.`
  return `Hier wurden rund ${p} mehr ${what} geliefert, als Kasse, Pauschale und eingetragene Abgänge erklären. Das System zeigt es automatisch – ohne Zählen.`
}
