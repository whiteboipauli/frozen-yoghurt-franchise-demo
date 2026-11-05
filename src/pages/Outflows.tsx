import { useState } from 'react'
import { actions, useDb } from '../data/repository'
import { OUTFLOW_REASONS, type OutflowReason } from '../data/types'
import { fmtDate } from '../lib/format'
import { isUnusual, unusualOutflows } from '../logic/shrinkage'
import { Btn, Card, Empty, Info, NumInput, Pill, useToast } from '../ui/kit'

/** „Sonstige Abgänge“ – Bereich innerhalb der Inventur: Abgang melden plus Liste */
export function OutflowsSection({ storeId }: { storeId: string }) {
  const db = useDb()
  const toast = useToast()
  const [articleId, setArticleId] = useState('becher-m')
  const [qty, setQty] = useState(1)
  const [unit, setUnit] = useState<'einheit' | 'karton'>('karton')
  const [reason, setReason] = useState<OutflowReason>('an Dritte verkauft')
  const [note, setNote] = useState('')
  const a = db.articles.find((x) => x.id === articleId)!
  const list = db.outflows.filter((o) => o.storeId === storeId).sort((x, y) => y.date.localeCompare(x.date))
  const flagged = unusualOutflows(db, storeId)
  return (
    <>
      <h2 className="sec-title" data-tour="outflows">Sonstige Abgänge</h2>
      <p className="muted" style={{ margin: '-8px 4px 16px' }}>Nur für Ausnahmen, die nicht über die Kasse laufen – zum Beispiel Becher an Dritte verkauft. Normalen Schwund musst du nicht eintragen.</p>
      <div className="grid g-7-5" style={{ alignItems: 'start' }}>
        <Card title={<>Abgang melden<Info text="Das HQ sieht jeden Eintrag. So bleibt nachvollziehbar, wohin Ware gegangen ist, die nicht an der Kasse verkauft wurde." /></>} i={0}>
          <div className="stack" style={{ gap: 18 }}>
            <div className="field"><label>Artikel</label>
              <select className="select" value={articleId} onChange={(e) => { setArticleId(e.target.value); setUnit('karton') }}>
                {db.articles.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select></div>
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <div className="field"><label>Menge</label><NumInput label="Menge" value={qty} onChange={setQty} min={0} step={unit === 'karton' ? 1 : a.unit === 'kg' ? 0.5 : 10} width={64} /></div>
              <div className="field" style={{ flex: 1 }}><label>Einheit</label>
                <select className="select" value={unit} onChange={(e) => setUnit(e.target.value as 'einheit' | 'karton')}>
                  <option value="karton">Karton / Packung (à {a.packSize} {a.unit === 'kg' ? 'kg' : 'Stück'})</option>
                  <option value="einheit">{a.unit === 'kg' ? 'Kilogramm' : 'Stück'}</option>
                </select></div>
            </div>
            <div className="field"><label>Grund</label>
              <div className="chips">{OUTFLOW_REASONS.map((r) => <button key={r} className="chip" aria-pressed={reason === r} onClick={() => setReason(r)}>{r}</button>)}</div></div>
            <div className="field"><label>Notiz (optional)</label><textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="z. B. an Stand auf dem Nachtmarkt" /></div>
            <Btn kind="primary" size="lg" disabled={qty <= 0} onClick={() => { actions.addOutflow(storeId, articleId, qty, unit, reason, note); setNote(''); toast('Abgang eingetragen – das HQ sieht ihn') }}>Abgang eintragen</Btn>
          </div>
        </Card>
        <Card title="Liste der Abgänge" i={1}>
          {list.length === 0 ? <Empty icon="sparkle">Noch keine sonstigen Abgänge.</Empty> : list.slice(0, 10).map((o) => {
            const why = isUnusual(flagged, o.id)
            return (
              <div className="wx-row" key={o.id}>
                <div style={{ flex: 1 }}>
                  <b>{o.label} {db.articles.find((x) => x.id === o.articleId)?.name}</b>
                  <p>{fmtDate(o.date)} · {o.reason}{o.note ? ` · ${o.note}` : ''}</p>
                </div>
                {why ? <span title={why}><Pill tone="yellow">auffällig</Pill></span> : <Pill tone="green">unauffällig</Pill>}
              </div>
            )
          })}
        </Card>
      </div>
    </>
  )
}
