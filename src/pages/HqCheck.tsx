import { useState } from 'react'
import { useDb } from '../data/repository'
import { go } from '../lib/router'
import { todayISO } from '../lib/date'
import { fmt0, fmtCartons, fmtDate, fmtPct } from '../lib/format'
import { groupDiffs, inventoriesOf, inventoryState, stichtagOf } from '../logic/inventory'
import { HqUsageCard } from './Usage'
import { storeCases } from '../logic/cases'
import { ART_LABEL, ART_ICON, ART_ORDER, type ReportArt } from '../logic/meldungen'
import { Btn, Card, Empty, PageHead } from '../ui/kit'
import { IconTile, SignalChip, worstLevel, type Level } from '../ui/signal'
import { Icon } from '../icons'

const unit = (key: string, v: number, packKg: number) => (key === 'powder' ? fmtCartons(v, packKg) : `${fmt0(v)} Stück`)
const lv = (l: string): Level => (l === 'red' ? 'rot' : l === 'yellow' ? 'bernstein' : 'gruen')

/** Warenabgleich: pro Laden, was da sein sollte und was gezählt wurde */
export function HqWarenabgleichPage() {
  const db = useDb()
  const today = todayISO()
  const packKg = db.articles.find((x) => x.id === 'pulver')?.packSize ?? 10
  const rows = db.stores.map((s) => {
    const last = inventoriesOf(db, s.id)[0] ?? null
    const groups = groupDiffs(db, last)
    const level = last ? worstLevel(groups.map((g) => lv(g.light))) : 'bernstein'
    const late = inventoryState(db, s.id, today).status === 'überfällig'
    return { s, last, groups, level: (late && level === 'gruen' ? 'bernstein' : level) as Level, late }
  }).sort((a, b) => ['rot', 'bernstein', 'info', 'gruen'].indexOf(a.level) - ['rot', 'bernstein', 'info', 'gruen'].indexOf(b.level) || a.s.name.localeCompare(b.s.name, 'de'))
  return (
    <>
      <PageHead title="Warenabgleich" hint="Passt die Monatsinventur zu dem, was geliefert und verkauft wurde? Auffällige Läden stehen oben, darunter der Verbrauch je Laden." />
      <div className="stack n-stack">
      <Card title="Alle Läden" className="dense" tour="checks">
        <div className="hq-rows">
          {rows.map(({ s, last, groups, level, late }) => (
            <button key={s.id} className={`hq-row tint-${level}`} onClick={() => go(`/zentrale/laeden/${s.id}/warenabgleich`)}>
              <IconTile icon="klemmbrett" level={level} />
              <div className="hq-row-main"><b title={s.name}>{s.name}</b>
                <span className="muted">{!last ? 'Noch keine Monatsinventur gezählt.' : groups.length ? `${last.kind === 'sonder' ? `Zwischenzählung ${fmtDate(last.date)}` : `Monatsinventur ${fmtDate(stichtagOf(last))}`}: ` + groups.map((g) => `${g.label} sollte da sein ${unit(g.key, g.expected, packKg)}, ist da ${unit(g.key, g.counted, packKg)} (${g.pct > 0 ? '+' : g.pct < 0 ? '−' : ''}${fmtPct(Math.abs(g.pct))})`).join(' · ') : 'Keine Daten.'}</span>
              </div>
              <SignalChip level={level} soon>{level === 'gruen' ? 'Passt' : late ? 'Monatsinventur fehlt' : level === 'rot' ? 'Unterschied zu groß' : 'Bitte prüfen'}</SignalChip>
            </button>
          ))}
        </div>
      </Card>
      <HqUsageCard />
      </div>
    </>
  )
}

/** Meldungen: alles, was das HQ klären sollte – automatisch erkannt oder vom Laden gesendet. Filter nach Art, Status und Laden. */
export function MeldungenPage({ storeFilter }: { storeFilter?: string }) {
  const db = useDb()
  const today = todayISO()
  const [fStore, fArt] = (storeFilter ?? '').split('~')
  const [art, setArt] = useState<ReportArt | 'alle'>((fArt as ReportArt) || 'alle')
  const [status, setStatus] = useState<'offen' | 'alle' | 'erledigt'>('offen')
  const [store, setStore] = useState(fStore || 'alle')
  const all = db.stores.flatMap((s) => storeCases(db, s.id, today)).filter((c) => c.level !== 'green')
  const name = (id: string) => db.stores.find((s) => s.id === id)?.name ?? id
  const rank = { red: 0, yellow: 1, green: 2 } as const
  const list = all.filter((c) => (art === 'alle' || c.art === art) && (store === 'alle' || c.storeId === store) && (status === 'alle' || (status === 'offen' ? c.status !== 'geklärt' : c.status === 'geklärt')))
    .sort((a, b) => Number(a.status === 'geklärt') - Number(b.status === 'geklärt') || rank[a.level] - rank[b.level] || b.createdOn.localeCompare(a.createdOn))
  const stLevel = (c: { status: string; level: string }): Level => (c.status === 'geklärt' ? 'gruen' : c.status === 'in Klärung' ? 'bernstein' : 'rot')
  const stWord = (s: string) => (s === 'geklärt' ? 'Erledigt' : s === 'in Klärung' ? 'In Klärung' : 'Offen')
  const nOpen = all.filter((c) => c.status !== 'geklärt').length
  return (
    <>
      <PageHead title="Meldungen" hint="Automatisch erkannte Auffälligkeiten und Nachrichten der Läden an das HQ." />
      <Card title={`${nOpen} offene ${nOpen === 1 ? 'Meldung' : 'Meldungen'}`} className="dense" tour="meldungen" right={
        <div className="row wrap no-print" style={{ gap: 8 }}>
          <select className="select" value={art} onChange={(e) => setArt(e.target.value as ReportArt | 'alle')} aria-label="Art"><option value="alle">Alle Arten</option>{ART_ORDER.map((a) => <option key={a} value={a}>{ART_LABEL[a]}</option>)}</select>
          <select className="select" value={store} onChange={(e) => setStore(e.target.value)} aria-label="Laden"><option value="alle">Alle Läden</option>{db.stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value as 'offen' | 'alle' | 'erledigt')} aria-label="Status"><option value="offen">Offen und in Klärung</option><option value="erledigt">Erledigt</option><option value="alle">Alle</option></select>
        </div>}>
        {list.length === 0 ? <Empty icon="haken-kreis">Keine Meldungen für diese Auswahl.</Empty> : (
          <div className="hq-rows">
            {list.map((c) => (
              <div key={c.id} className={`hq-row mrow tint-${stLevel(c)}`} role="button" tabIndex={0} onClick={() => go(`/zentrale/fall/${c.storeId}/${c.kind}`)} onKeyDown={(e) => e.key === 'Enter' && go(`/zentrale/fall/${c.storeId}/${c.kind}`)} data-meldung={c.id}>
                <IconTile icon={ART_ICON[c.art]} level={c.level === 'red' ? 'rot' : 'bernstein'} />
                <div className="hq-row-main">
                  <b title={name(c.storeId)}>{name(c.storeId)}</b>
                  <span className="mchips"><span className="art-chip">{ART_LABEL[c.art]}</span>{c.auto && <span className="art-chip auto">automatisch erkannt</span>}<span className="faint small">{fmtDate(c.createdOn)}</span></span>
                  <span className="muted">{c.auto ? `Begründung: ${c.reason ?? c.text}` : c.text}</span>
                </div>
                <SignalChip level={stLevel(c)}>{stWord(c.status)}</SignalChip>
                <span className="task-go" aria-hidden><Icon name="arrow" size={18} /></span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  )
}
