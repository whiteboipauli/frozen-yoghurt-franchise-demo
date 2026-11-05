import { useMemo, useState } from 'react'
import { actions, useDb } from '../data/repository'
import { todayISO, WEEKDAYS, weekdayIdx } from '../lib/date'
import { fmtDayMonth } from '../lib/format'
import type { Gap } from '../logic/hr'
import { shiftsOf, suggestFor, timeRange, weekHours } from '../logic/gapfill'
import { isAbsent, monthHours } from '../logic/hr'
import type { Employee } from '../data/types'
import { Icon } from '../icons'
import { Avatar, Btn, Modal, useToast } from '../ui/kit'
import { Signal, SignalChip } from '../ui/signal'

/** Lücke schließen: Kopf, wer schon eingeplant ist, bis zu drei Vorschläge (ganze Karte klickbar), „Einplanen“ */
const nf = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 })
export function GapDialog({ storeId, date, gap, onClose }: { storeId: string; date: string; gap: Gap; onClose: () => void }) {
  const db = useDb()
  const toast = useToast()
  const today = todayISO()
  const valid = useMemo(() => suggestFor(db, storeId, date, gap, today), [db, storeId, date, gap, today])
  const picks = valid.slice(0, 3)
  const hoursOf = (e: Employee) => `${nf.format(Math.round(weekHours(db, e, date) * 10) / 10)} Std. diese Woche · ${nf.format(Math.round(monthHours(db, e, today) * 10) / 10)} Std. im Monat`
  const others = db.employees.filter((e) => e.storeId === storeId && e.active && !picks.some((p) => p.emp.id === e.id)).map((e) => {
    const ok = valid.some((p) => p.emp.id === e.id)
    let reason = ''
    if (!ok) {
      const abs = isAbsent(db.absences, e.id, date)
      reason = abs ? (abs.type === 'Krank' ? 'krank' : 'frei') : db.shifts.some((s) => s.empId === e.id && s.date === date && s.status !== 'ausfall') ? 'schon eingeplant' : 'nicht verfügbar'
    }
    return { e, ok, reason }
  }).sort((x, y) => Number(y.ok) - Number(x.ok) || x.e.name.localeCompare(y.e.name, 'de'))
  const [sel, setSel] = useState<string[] | null>(null)
  const chosen = sel ?? picks.slice(0, gap.missing).map((p) => p.emp.id)
  const planned = db.shifts.filter((s) => s.storeId === storeId && s.date === date && s.status !== 'ausfall').sort((a, b) => a.start - b.start)
  const toggle = (id: string) => {
    const cur = chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id]
    setSel(cur.length > gap.missing ? cur.slice(cur.length - gap.missing) : cur)
  }
  const apply = () => {
    const list = valid.filter((p) => chosen.includes(p.emp.id))
    if (!list.length) return
    actions.saveShifts(shiftsOf(storeId, date, list, 'Eingeplant'))
    toast(list.length > 1 ? `${list.length} Personen eingeplant` : `${list[0].emp.name.split(' ')[0]} ist ${timeRange(gap.from, gap.to)} eingeplant`)
    onClose()
  }
  return (
    <Modal onClose={onClose}>
      <div className="gap-dlg" data-tour="gap-dialog">
        <h2>Lücke schließen</h2>
        <p className="gap-head"><Signal level="rot" size={22} /> {WEEKDAYS[weekdayIdx(date)]} {fmtDayMonth(date)} · {timeRange(gap.from, gap.to).replace(' Uhr', '')} Uhr · es {gap.missing === 1 ? 'fehlt 1 Person' : `fehlen ${gap.missing} Personen`}</p>

        <div className="cap" style={{ margin: '16px 0 8px' }}>Schon eingeplant</div>
        {planned.length === 0 ? <p className="muted">Noch niemand an diesem Tag.</p> : (
          <div className="gap-planned">
            {planned.map((s) => { const e = db.employees.find((x) => x.id === s.empId); return <span key={s.id} className="gap-tag"><b>{e?.name.split(' ')[0]}</b> {timeRange(s.start, s.end).replace(' Uhr', '')}</span> })}
          </div>
        )}

        <div className="cap" style={{ margin: '16px 0 8px' }}>Vorschlag vom System</div>
        {picks.length === 0 ? <p className="note"><Icon name="warn" /> Niemand verfügbar.</p> : (
          <div className="gap-picks">
            {picks.map((p) => {
              const on = chosen.includes(p.emp.id)
              return (
                <button key={p.emp.id} type="button" className={`gap-pick ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => toggle(p.emp.id)} data-pick={p.emp.id}>
                  <Avatar name={p.emp.name} photoUrl={p.emp.photoUrl} size={40} />
                  <span className="grow"><b>{p.emp.name}</b><span className="muted">{hoursOf(p.emp)}</span></span>
                  <SignalChip level="gruen">passt</SignalChip>
                </button>
              )
            })}
          </div>
        )}

        <div className="cap" style={{ margin: '16px 0 8px' }}>Andere Mitarbeitende</div>
        <div className="gap-others">
          {others.map(({ e, ok, reason }) => (
            <button key={e.id} type="button" className={`gap-pick ${chosen.includes(e.id) ? 'on' : ''} ${ok ? '' : 'off'}`} disabled={!ok} aria-pressed={chosen.includes(e.id)} onClick={() => toggle(e.id)}>
              <Avatar name={e.name} photoUrl={e.photoUrl} size={32} />
              <span className="grow"><b>{e.name}</b><span className="muted small">{hoursOf(e)}</span></span>
              {ok ? <SignalChip level="gruen">passt</SignalChip> : <span className="gap-why">{reason}</span>}
            </button>
          ))}
        </div>
      </div>
      <div className="actions">
        <Btn onClick={onClose}>Schließen</Btn>
        <Btn kind="primary" icon="check" disabled={!chosen.length || !picks.length} data-tour="apply-pick" onClick={apply}>Einplanen</Btn>
      </div>
    </Modal>
  )
}
