import { useState } from 'react'
import { actions, useDb } from '../data/repository'
import type { AvailKind, Availability } from '../data/types'
import { addDays, todayISO, WEEKDAYS, weekdayIdx } from '../lib/date'
import { fmtDate, fmtDayMonth, fmtTime } from '../lib/format'
import { isAbsent } from '../logic/hr'
import { openHours, storeOf } from '../logic/history'
import { Btn, Card, Empty, useToast } from '../ui/kit'

const LABEL: Record<AvailKind, string> = { ganztags: 'ganztags', vormittags: 'vormittags', nachmittags: 'nachmittags / abends', nicht: 'nicht verfügbar', frei: 'frei' }
const SHORT = (a?: Availability) => (!a ? '–' : a.kind === 'ganztags' ? 'ganz' : a.kind === 'vormittags' ? 'vorm.' : a.kind === 'nachmittags' ? 'nachm.' : a.kind === 'nicht' ? 'nein' : `${a.from}–${a.to}`)


export function AvailabilityMatrix({ storeId }: { storeId: string }) {
  const db = useDb()
  const today = todayISO()
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i))
  const emps = db.employees.filter((e) => e.storeId === storeId && e.active).sort((a, b) => a.name.localeCompare(b.name, 'de'))
  const get = (id: string, d: string) => db.availability.find((a) => a.empId === id && a.date === d)
  return (
    <Card i={0} tour="avail-matrix">
      <div className="avm"><table>
        <thead><tr><th />{days.map((d) => <th key={d} className={weekdayIdx(d) >= 5 ? 'hl' : ''}>{WEEKDAYS[weekdayIdx(d)].slice(0, 2)}<br />{fmtDayMonth(d)}</th>)}</tr></thead>
        <tbody>
          {emps.map((e) => (
            <tr key={e.id}>
              <td className="name">{e.name}</td>
              {days.map((d) => {
                const ab = isAbsent(db.absences, e.id, d)
                const a = get(e.id, d)
                return <td key={d}><div className={`av ${ab ? 'abwesend' : a ? a.kind : 'none'}`} title={ab ? `${ab.type}${ab.note ? ': ' + ab.note : ''}` : a ? LABEL[a.kind] + (a.kind === 'frei' ? ` ${fmtTime(a.from!)}–${fmtTime(a.to!)}` : '') : 'nicht angegeben'}>{ab ? ab.type.slice(0, 3) + '.' : SHORT(a)}</div></td>
              })}
            </tr>
          ))}
        </tbody>
      </table></div>
      <div className="row wrap small muted" style={{ marginTop: 14, gap: 16 }}>
        <span><i className="legend-dot" style={{ background: 'color-mix(in srgb, var(--ok) 55%, transparent)' }} />ganztags</span>
        <span><i className="legend-dot" style={{ background: 'color-mix(in srgb, var(--warn) 55%, transparent)' }} />teilweise</span>
        <span><i className="legend-dot" style={{ background: 'color-mix(in srgb, var(--bad) 35%, transparent)' }} />nicht verfügbar</span>
        <span><i className="legend-dot" style={{ background: 'color-mix(in srgb, var(--ink) 25%, transparent)' }} />Urlaub / Abwesenheit</span>
        <span>– nicht angegeben (wird nicht eingeplant)</span>
      </div>
    </Card>
  )
}

/** „Meine Verfügbarkeit“: große Buttons je Tag (im Prototyp ohne Login: oben Person wählen) */
/** „Meine Verfügbarkeit“ für Mitarbeitende: große Buttons je Tag; Einträge erscheinen sofort im Dienstplan */
export function MyAvailability({ storeId, empId: fixed }: { storeId: string; empId: string }) {
  const db = useDb()
  const toast = useToast()
  const today = todayISO()
  const st = storeOf(db, storeId)
  const emps = db.employees.filter((e) => e.storeId === storeId && e.active).sort((a, b) => a.name.localeCompare(b.name, 'de'))
  const empId = fixed
  const [free, setFree] = useState<Record<string, { from: number; to: number }>>({})
  const [ab, setAb] = useState({ from: addDays(today, 7), to: addDays(today, 11), type: 'Urlaub' as 'Urlaub' | 'Abwesenheit' | 'Krank', note: '' })
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i))
  if (!emps.length) return <Card><Empty icon="user">Noch keine Mitarbeitenden.</Empty></Card>
  const emp = emps.find((e) => e.id === empId) ?? emps[0]
  const mine = db.absences.filter((a) => a.empId === emp.id && a.to >= today)
  const set = (date: string, kind: AvailKind, from?: number, to?: number) => { actions.setAvailability(emp.id, date, kind === 'frei' ? { kind, from, to } : { kind }); toast(`${fmtDayMonth(date)}: ${LABEL[kind]}`) }
  const hrs = Array.from({ length: 25 }, (_, i) => 6 + i * 0.5)
  return (
    <div className="stack">
      <Card title="Die nächsten 14 Tage" i={1} tour="my-avail">
        {days.map((d) => {
          const cur = db.availability.find((a) => a.empId === emp.id && a.date === d)
          const absent = isAbsent(db.absences, emp.id, d)
          const { open, close } = openHours(st, d)
          const f = free[d] ?? { from: cur?.from ?? 14, to: cur?.to ?? 19 }
          return (
            <div key={d} className="day-row">
              <div className="row between"><b style={{ fontSize: 18 }}>{WEEKDAYS[weekdayIdx(d)]}, {fmtDate(d)}</b><span className="muted small">geöffnet {open}–{close} Uhr{absent ? ` · ${absent.type}` : ''}</span></div>
              <div className="avbtns">
                {(['ganztags', 'vormittags', 'nachmittags', 'nicht'] as AvailKind[]).map((k) => <button key={k} className="avbtn" aria-pressed={cur?.kind === k} onClick={() => set(d, k)}>{k === 'nachmittags' ? 'nachmittags / abends' : k === 'nicht' ? 'nicht verfügbar' : k}</button>)}
              </div>
              <div className="row wrap small">
                <span className="muted">oder eine Uhrzeit:</span>
                <select className="select" value={f.from} onChange={(e) => setFree({ ...free, [d]: { ...f, from: Number(e.target.value) } })} aria-label="von">{hrs.map((h) => <option key={h} value={h}>{fmtTime(h)}</option>)}</select><span>bis</span>
                <select className="select" value={f.to} onChange={(e) => setFree({ ...free, [d]: { ...f, to: Number(e.target.value) } })} aria-label="bis">{hrs.map((h) => <option key={h} value={h}>{fmtTime(h)}</option>)}</select>
                <Btn size="sm" kind={cur?.kind === 'frei' ? 'primary' : 'glass'} disabled={f.to <= f.from} onClick={() => set(d, 'frei', f.from, f.to)}>von–bis übernehmen</Btn>
                {cur && <Btn size="sm" kind="ghost" onClick={() => actions.setAvailability(emp.id, d, null)}>zurücksetzen</Btn>}
              </div>
            </div>
          )
        })}
      </Card>
      <Card title="Urlaub und Abwesenheit" i={2}>
        <div className="row wrap" style={{ alignItems: 'flex-end', gap: 14 }}>
          <div className="field"><label>Von</label><input type="date" className="input" value={ab.from} onChange={(e) => setAb({ ...ab, from: e.target.value, to: e.target.value > ab.to ? e.target.value : ab.to })} /></div>
          <div className="field"><label>Bis</label><input type="date" className="input" min={ab.from} value={ab.to} onChange={(e) => setAb({ ...ab, to: e.target.value })} /></div>
          <div className="field"><label>Art</label><select className="select" value={ab.type} onChange={(e) => setAb({ ...ab, type: e.target.value as typeof ab.type })}><option>Urlaub</option><option>Abwesenheit</option><option>Krank</option></select></div>
          <div className="field" style={{ flex: 1, minWidth: 160 }}><label>Notiz</label><input className="input wide" value={ab.note} onChange={(e) => setAb({ ...ab, note: e.target.value })} placeholder="optional" /></div>
          <Btn kind="primary" disabled={!ab.from || !ab.to || ab.to < ab.from} onClick={() => { actions.addAbsence({ empId: emp.id, ...ab }); toast(`${ab.type} eingetragen`) }}>Eintragen</Btn>
        </div>
        {mine.length > 0 && <table className="tbl" style={{ marginTop: 14 }}><tbody>{mine.map((a) => <tr key={a.id}><td className="strong">{a.type}</td><td>{fmtDate(a.from)} – {fmtDate(a.to)}</td><td className="muted">{a.note}</td><td className="r"><Btn size="sm" kind="danger" onClick={() => actions.removeAbsence(a.id)}>Löschen</Btn></td></tr>)}</tbody></table>}
      </Card>
    </div>
  )
}
