import { useRef, useState } from 'react'
import { actions, useDb } from '../data/repository'
import type { Article, Inventory } from '../data/types'
import { fmtDate } from '../lib/format'
import { toBase } from '../logic/consumption'
import { INV_TOLERANCE, inventoriesOf, inventoryState, isYearEnd, lineDiffs, countedLate, stichtagOf, monthLabel, periodOf, prevMonth, zentraleArticles } from '../logic/inventory'
import { StoreUsageCard } from './Usage'
import { diffDays, todayISO } from '../lib/date'
import { Signal, SignalChip, TimeChip, type Level } from '../ui/signal'
import { Icon } from '../icons'
import { ArtIcon } from '../ui/art'
import { Btn, Card, Empty, NumInput, PageHead, Pill, useToast } from '../ui/kit'
import { OutflowsSection } from './Outflows'
import { CountGridCard } from './CountGrid'

const parse = (t: string | undefined) => { const n = parseFloat((t ?? '').replace(',', '.')); return Number.isFinite(n) && n >= 0 ? n : null }
/** Schrittweite: Pulver 1 Karton, Stückartikel 10 */
const stepOf = (a: Article) => (a.unit === 'kg' ? 1 : 10)
/** Pulver wird in Kartons gezählt (kg je Karton aus dem Artikelstamm) */
const inCartons = (a: Article) => a.unit === 'kg' && a.source === 'zentrale'
const baseOf = (a: Article, v: number) => Math.round(inCartons(a) ? v * a.packSize * 1000 : toBase(a, v))

/** Zählzeile: Name, kleiner Stepper (direkt tippbar, Pfeiltasten) und Einheit – ohne Vorgabewert (blind) */
function CountTile({ a, value, onChange }: { a: Article; value: string; onChange: (v: string) => void }) {
  const n = parse(value)
  return (
    <div className={`count-tile ${n !== null ? 'done' : ''}`} data-count={a.id}>
      <span className="count-ico"><ArtIcon article={a} size={22} /></span>
      <b className="count-name" title={a.name}>{a.name.replace('Frozen-Yoghurt-', '')}</b>
      <NumInput label={`${a.name} gezählt`} value={n} step={stepOf(a)} onChange={(v) => onChange(String(v).replace('.', ','))} width={64} />
      <span className="count-unit">{inCartons(a) ? 'Karton' : a.unit === 'kg' ? 'kg' : 'Stück'}</span>
      <span className="count-ok">{n !== null && <Icon name="check" size={16} stroke={3} />}</span>
    </div>
  )
}

/** Monatsinventur: blind zählen (kein Rechenwert, keine Differenz im Laden), Verbrauch, Verlauf, Abgänge melden */
export function InventoryPage({ storeId }: { storeId: string }) {
  const db = useDb()
  const toast = useToast()
  const today = todayISO()
  const st = inventoryState(db, storeId, today)
  const yo = zentraleArticles(db)
  const [txt, setTxt] = useState<Record<string, string>>({})
  const [openInv, setOpenInv] = useState<string | null>(null)
  const hist = inventoriesOf(db, storeId)
  const missing = yo.filter((a) => parse(txt[a.id]) === null)
  const entered = yo.filter((a) => parse(txt[a.id]) !== null)
  const monthly = st.status === 'offen' || st.status === 'überfällig'
  const canCount = monthly || !!st.special
  const [counting, setCounting] = useState(false)
  const formRef = useRef<HTMLDivElement>(null)
  const showForm = counting || canCount
  const late = monthly && (st.status === 'überfällig' || st.period < today.slice(0, 7))
  const saves = monthly
    ? `Das wird als Monatsinventur ${monthLabel(st.period)} gespeichert${late ? ` (Stichtag ${fmtDate(st.due)}, gezählt am ${fmtDate(today)})` : ''}.`
    : 'Das wird als Zwischenzählung gespeichert. Die Monatsinventur folgt zum Monatsende.'
  const daysLeft = diffDays(st.due, today)
  const yearEnd = isYearEnd(st.due)

  const tile = st.special
    ? { lvl: 'rot' as Level, title: 'Sonder-Inventur vom HQ: bitte jetzt zählen', sub: 'Das HQ bittet um eine zusätzliche Zählung der von der Zentrale bezogenen Artikel.' }
    : st.status === 'überfällig'
      ? { lvl: 'rot' as Level, title: `Monatsinventur ${monthLabel(st.period)} überfällig – bitte jetzt zählen`, sub: `Sie war bis zum ${fmtDate(st.deadline)} fällig. Letzte Monatsinventur: ${st.last ? fmtDate(stichtagOf(st.last)) : 'noch nie'}.` }
      : st.status === 'offen'
        ? { lvl: 'bernstein' as Level, title: `Monatsinventur ${monthLabel(st.period)}: jetzt zählen`, sub: `Stichtag ist der ${fmtDate(st.due)}. Zähle alle Artikel der Zentrale. Du siehst bewusst keine Vorgabe.${yearEnd ? ' Diese Inventur gilt zugleich als Jahresinventur.' : ''}` }
        : st.doneOn
          ? { lvl: 'gruen' as Level, title: `Monatsinventur ${monthLabel(prevMonth(st.period))}: erledigt am ${fmtDate(st.doneOn)}`, sub: `Danke! Die nächste Inventur hat den Stichtag ${fmtDate(st.due)} – zählen kannst du ab dem ${fmtDate(st.from)}.${yearEnd ? ' Sie gilt zugleich als Jahresinventur.' : ''}` }
          : { lvl: 'gruen' as Level, title: 'Keine Inventur fällig', sub: `Die nächste Monatsinventur hat den Stichtag ${fmtDate(st.due)} – zählen kannst du ab dem ${fmtDate(st.from)}.` }

  const save = () => {
    const out: Record<string, number> = {}
    entered.forEach((a) => (out[a.id] = baseOf(a, parse(txt[a.id])!)))
    actions.saveInventory(storeId, out)
    setTxt({})
    toast('Monatsinventur gespeichert – danke!')
  }

  return (
    <>
      <PageHead title="Einmal im Monat zählen" hint="Stichtag ist der letzte Tag des Monats, zählen kannst du ab dem drittletzten Tag. Du siehst bewusst keine Vorgabe, so zählt jeder wirklich." />
      <div className="stack n-stack">
        <section className="glass card in inv-status" data-tour="inv-status">
          <Signal level={tile.lvl} size={32} pulse={tile.lvl !== 'gruen'} />
          <div className="grow"><h2>{tile.title}</h2><p className="muted">{tile.sub}</p></div>
          {st.reminder && <SignalChip level="bernstein" variant="uhr">Erinnerung vom HQ</SignalChip>}
          <Btn kind={canCount ? 'primary' : 'glass'} icon="inventory" onClick={() => { setCounting(true); setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50) }} data-tour="count-now">Jetzt zählen</Btn>
          {tile.lvl !== 'gruen' && <TimeChip level={tile.lvl} progress={Math.max(0.05, Math.min(1, 1 - daysLeft / 3))}>{st.special ? 'jetzt' : st.status === 'überfällig' ? 'überfällig' : daysLeft <= 0 ? 'heute Stichtag' : `noch ${daysLeft} ${daysLeft === 1 ? 'Tag' : 'Tage'}`}</TimeChip>}
        </section>

        {showForm && <div ref={formRef}><Card title="Zählen" tour="inv-form" right={<span className="muted">{missing.length ? `${yo.length - missing.length} von ${yo.length} eingetragen` : 'Alles eingetragen'}</span>}>
          <p className="count-note"><Icon name="info" size={15} /> {saves}</p>
          <div className="count-grid">
            {yo.map((a) => <CountTile key={a.id} a={a} value={txt[a.id] ?? ''} onChange={(v) => setTxt((x) => ({ ...x, [a.id]: v }))} />)}
          </div>
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 18, gap: 14 }}>
            {missing.length > 0 && <span className="muted">Noch offen: {missing.map((a) => a.name).slice(0, 3).join(', ')}{missing.length > 3 ? ` und ${missing.length - 3} weitere` : ''}</span>}
            <Btn kind="primary" size="lg" disabled={missing.length > 0} onClick={save}>Inventur speichern</Btn>
          </div>
        </Card></div>}

        <StoreUsageCard storeId={storeId} />

        <CountGridCard storeId={storeId} />

        <OutflowsSection storeId={storeId} />

      </div>
    </>
  )
}
