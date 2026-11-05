import { useMemo, useState } from 'react'
import { actions, useDb } from '../data/repository'
import type { Shift } from '../data/types'
import { addDays, todayISO, WEEKDAYS, weekdayIdx } from '../lib/date'
import { fmtDate, fmtDayMonth, fmtTime } from '../lib/format'
import { gapText, netOf, validateShifts } from '../logic/hr'
import { openHours, storeOf } from '../logic/history'
import { dayStaffing } from '../logic/staffing'
import { Icon } from '../ui/icons'
import { DemandStrip } from '../ui/StaffCharts'
import { Btn, Card, Modal, Segmented, Switch, useToast } from '../ui/kit'

const HOUR_PX = 40

export function ShiftModal({ shift, onClose }: { shift: Shift; onClose: () => void }) {
  const db = useDb()
  const toast = useToast()
  const [s, setS] = useState(shift)
  const isNew = !shift.id
  const emps = db.employees.filter((e) => e.storeId === shift.storeId && (e.active || e.id === shift.empId))
  const hoursOpts = Array.from({ length: 29 }, (_, i) => 6 + i * 0.5)
  const e = emps.find((x) => x.id === s.empId)
  const ok = s.end > s.start && !!e
  return (
    <Modal onClose={onClose}>
      <h2>{isNew ? 'Schicht hinzufügen' : 'Schicht ändern'}</h2>
      <p className="muted small" style={{ margin: '4px 0 14px' }}>{WEEKDAYS[weekdayIdx(s.date)]}, {fmtDate(s.date)}{!isNew && s.why ? ` · ${s.why}` : ''}</p>
      <div className="stack" style={{ gap: 14 }}>
        <div className="field"><label>Person</label><select className="select" value={s.empId} onChange={(ev) => setS({ ...s, empId: ev.target.value })}>{emps.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
        <div className="row wrap">
          <div className="field"><label>Beginn</label><select className="select" value={s.start} onChange={(ev) => setS({ ...s, start: Number(ev.target.value) })}>{hoursOpts.map((h) => <option key={h} value={h}>{fmtTime(h)} Uhr</option>)}</select></div>
          <div className="field"><label>Ende</label><select className="select" value={s.end} onChange={(ev) => setS({ ...s, end: Number(ev.target.value) })}>{hoursOpts.map((h) => <option key={h} value={h}>{fmtTime(h)} Uhr</option>)}</select></div>
        </div>
        <label className="row"><Switch on={s.locked} onChange={(v) => setS({ ...s, locked: v })} label="Schicht sperren" /><span>Sperren – bleibt beim erneuten „Dienstplan erstellen“ erhalten</span></label>
        {e && s.end > s.start && <p className="small muted">Netto {netOf(db.settings.hr, e, s)} Std. (nach Pause)</p>}
      </div>
      <div className="actions">
        {!isNew && <Btn kind="danger" onClick={() => { actions.removeShift(shift.id); onClose(); toast('Schicht gelöscht') }}>Löschen</Btn>}
        <Btn onClick={onClose}>Abbrechen</Btn>
        <Btn kind="primary" disabled={!ok} onClick={() => { actions.saveShift({ ...s, id: s.id || `sh${Date.now().toString(36)}`, why: isNew || s.empId !== shift.empId || s.start !== shift.start || s.end !== shift.end ? 'manuell angepasst' : s.why }); onClose(); toast('Schicht gespeichert') }}>Speichern</Btn>
      </div>
    </Modal>
  )
}

/** Druckansicht A4 quer (14 Tage) */
export function PrintSchedule({ storeId }: { storeId: string }) {
  const db = useDb()
  const today = todayISO()
  const st = storeOf(db, storeId)
  const emps = db.employees.filter((e) => e.storeId === storeId)
  const printFrom = today, printDays = Array.from({ length: 14 }, (_, i) => addDays(printFrom, i))
  return (
    <>
      {/* Druckansicht A4 quer */}
      <div className="print-only print-sched">
        <h1>Dienstplan – {st.name}</h1>
        <p>{fmtDate(printFrom)} bis {fmtDate(printDays[13])}</p>
        <table>
          <thead><tr><th>Mitarbeiter/in</th>{printDays.map((d) => <th key={d}>{WEEKDAYS[weekdayIdx(d)].slice(0, 2)} {fmtDayMonth(d)}</th>)}</tr></thead>
          <tbody>
            {emps.filter((e) => db.shifts.some((s) => s.empId === e.id && s.date >= printFrom && s.date <= printDays[13])).map((e) => (
              <tr key={e.id}><td><b>{e.name}</b></td>{printDays.map((d) => <td key={d}>{db.shifts.filter((s) => s.empId === e.id && s.date === d).map((s) => `${s.start}–${s.end}`).join(', ')}</td>)}</tr>
            ))}
            <tr><td><b>Lücken</b></td>{printDays.map((d) => <td key={d}>{dayStaffing(db, storeId, d, today).gaps.map((g) => `${g.from}–${g.to}: −${g.missing}`).join(', ')}</td>)}</tr>
          </tbody>
        </table>
      </div>
    </>
  )
}
