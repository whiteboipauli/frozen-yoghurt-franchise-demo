import { useState, type ReactNode } from 'react'
import { actions, useDb } from '../data/repository'
import { todayISO } from '../lib/date'
import { planAllGaps } from '../logic/gapfill'
import { gapCount } from '../logic/staffing'
import { Btn, Modal, useToast } from '../ui/kit'
import { Signal } from '../ui/signal'
import { fmtDayMonth } from '../lib/format'
import { timeRange } from '../logic/gapfill'

/** „Alle Lücken automatisch füllen“: füllt sofort, zeigt „x von y Lücken gefüllt“ mit „Rückgängig“; nicht füllbare Lücken bleiben rot mit Grund */
export function useAutoFill(storeId: string, dates: string[]): { run: () => void; node: ReactNode } {
  const db = useDb()
  const toast = useToast()
  const today = todayISO()
  const [res, setRes] = useState<{ ids: string[]; filled: number; total: number; left: { date: string; from: number; to: number }[] } | null>(null)
  const run = () => {
    const before = gapCount(db, storeId, dates, today)
    const r = planAllGaps(db, storeId, dates.filter((d) => d >= today), today)
    if (r.shifts.length) actions.saveShifts(r.shifts)
    const unresolved = new Set(r.unresolved.map((u) => `${u.date}|${u.gap.from}|${u.gap.to}`)).size
    setRes({ ids: r.shifts.map((s) => s.id), filled: Math.max(0, before - unresolved), total: before, left: r.unresolved.map((u) => ({ date: u.date, from: u.gap.from, to: u.gap.to })) })
  }
  const undo = () => { res?.ids.forEach((id) => actions.removeShift(id)); toast('Rückgängig gemacht'); setRes(null) }
  const node = res && (
    <Modal onClose={() => setRes(null)}>
      <div className="done-box">
        <Signal level={res.filled === res.total ? 'gruen' : 'bernstein'} size={56} />
        <h2>{res.filled} von {res.total} {res.total === 1 ? 'Lücke' : 'Lücken'} gefüllt</h2>
        {res.left.length > 0 && <div className="gap-left">{res.left.map((l, i) => <p key={i} className="muted"><Signal level="rot" size={16} /> {fmtDayMonth(l.date)} · {timeRange(l.from, l.to).replace(' Uhr', '')} Uhr: niemand verfügbar</p>)}</div>}
        {res.left.length === 0 && <p className="muted">Alle Schichten sind eingeplant.</p>}
      </div>
      <div className="actions">{res.ids.length > 0 && <Btn icon="pfeil-zurueck" onClick={undo}>Rückgängig</Btn>}<Btn kind="primary" icon="haken" onClick={() => setRes(null)}>Fertig</Btn></div>
    </Modal>
  )
  return { run, node }
}
