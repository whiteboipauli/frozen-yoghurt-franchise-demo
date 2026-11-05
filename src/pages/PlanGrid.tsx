import { useMemo, useState } from 'react'
import { actions, useDb } from '../data/repository'
import { addDays, todayISO, WEEKDAYS, WEEKDAYS_SHORT, weekdayIdx } from '../lib/date'
import { fmtDayMonth, fmtEUR } from '../lib/format'
import { planUi, usePlanUi } from '../lib/plan-ui'
import { gapText, hourAccount, isAbsent, validateShifts, valueOn, type Gap } from '../logic/hr'
import { useAutoFill } from './AutoFill'
import { holidayOn, schoolHolidayOn } from '../logic/history'
import { dayStaffing, gapCount, staffDay } from '../logic/staffing'
import { wxKind } from '../logic/weather'
import { weekStart } from '../logic/weekly'
import { range } from '../logic/callouts'
import { Icon } from '../icons'
import { Avatar, Btn, Modal, Segmented, useToast } from '../ui/kit'
import { IconTile, Signal, SignalChip, type Level } from '../ui/signal'
import { PlanCalendar, ShiftDialog, type ShiftInit } from './PlanCalendar'
import { GapDialog } from './GapDialog'
import { ReplaceDialog, SickDialog } from './Absence'

type View = 'woche' | 'monat' | 'tag'
const KIND_LABEL: Record<string, string> = { minijob: 'Minijob', werkstudent: 'Werkstudent', teilzeit: 'Teilzeit', vollzeit: 'Vollzeit' }

/** Dienstplan: Raster Personen × Tage, mit Besetzungszeile, Monats- und Tagesansicht */
export function PlanPage({ storeId }: { storeId: string }) {
  const db = useDb()
  const toast = useToast()
  const { week, focus } = usePlanUi()
  const today = todayISO()
  const [view, setView] = useState<View>(() => planUi.takePageView() ?? 'woche')
  const [dlg, setDlg] = useState<ShiftInit | null>(null)
  const [gapDlg, setGapDlg] = useState<{ date: string; gap: Gap } | null>(null)
  const [dayDlg, setDayDlg] = useState<string | null>(null)
  const [callout, setCallout] = useState<string | null>(null)
  const [sick, setSick] = useState(false)
  const [month, setMonth] = useState(today.slice(0, 7))
  const start = addDays(weekStart(today), week * 7)
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  const emps = db.employees.filter((e) => e.storeId === storeId && e.active)
  const viol = useMemo(() => validateShifts(db, storeId, days[0], days[6]), [db, storeId, days[0]])
  const info = days.map((d) => ({ d, sd: staffDay(db, storeId, d, today), ds: dayStaffing(db, storeId, d, today) }))
  const gapsTotal = gapCount(db, storeId, days, today)
  const wk0 = weekStart(today)
  const gapsA = gapCount(db, storeId, Array.from({ length: 7 }, (_, i) => addDays(wk0, i)), today)
  const gapsB = gapCount(db, storeId, Array.from({ length: 7 }, (_, i) => addDays(wk0, 7 + i)), today)
  const hr = db.settings.hr

  const autoFill = useAutoFill(storeId, days)
  const wk = (d: string) => `${WEEKDAYS_SHORT[weekdayIdx(d)]} ${fmtDayMonth(d)}`

  return (
    <div className="stack" data-tour="week-plan">
      <div className="row between wrap">
        <div className="row wrap" style={{ gap: 10 }}>
          <Segmented<View> value={view} onChange={setView} options={[{ value: 'woche', label: 'Woche', icon: 'kalender' }, { value: 'monat', label: 'Monat' }, { value: 'tag', label: 'Tag' }]} />
          {view === 'woche' && <Segmented value={String(week)} onChange={(v) => planUi.setWeek(Number(v))} options={[{ value: '0', label: 'Diese Woche' }, { value: '1', label: 'Nächste Woche' }]} />}
          {view === 'woche' && (gapsA + gapsB ? <SignalChip level="rot">{`${gapsA} ${gapsA === 1 ? 'Lücke' : 'Lücken'} diese Woche · ${gapsB} nächste Woche`}</SignalChip> : <SignalChip level="gruen">Alles besetzt</SignalChip>)}
        </div>
        <div className="row wrap no-print" style={{ gap: 10 }}>
          <Btn icon="person-ausfall" onClick={() => setSick(true)}>Krankmeldung</Btn>
          <Btn icon="plus" data-tour="add-shift" onClick={() => setDlg({ date: days.find((d) => d >= today) ?? days[0], start: info[0].sd.open, end: info[0].sd.open + 4 })}>Schicht hinzufügen</Btn>
          <Btn kind="primary" icon="sparkle" data-tour="fill-all" disabled={!gapsTotal} onClick={autoFill.run}>Alle Lücken automatisch füllen</Btn>
        </div>
      </div>

      {viol.slice(0, 3).map((v, i) => (
        <div key={i} className="note" role="alert"><Signal level="bernstein" size={22} variant="uhr" /><div><b>Bitte prüfen:</b> {v.text} ({fmtDayMonth(v.date)})</div></div>
      ))}

      {view === 'woche' && (
        <div className="glass card pgrid dense">
          <div className="pg">
            <span />
            {info.map(({ d, sd, ds }) => {
              const hol = holidayOn(db, storeId, d), fer = schoolHolidayOn(db, storeId, d)
              return (
                <button key={d} className={`pg-h ${d === today ? 'today' : ''} ${focus === d ? 'today' : ''} ${d >= today && ds.gaps.length ? 'gap' : ''}`} onClick={() => setDayDlg(d)} title={hol?.name ?? (fer ? 'Schulferien' : '')}>
                  <span>{WEEKDAYS_SHORT[weekdayIdx(d)]} {fmtDayMonth(d)}</span>
                  <small><Icon name={sd.wx ? wxKind(sd.wx).icon : 'wx-none'} size={16} />{sd.wx ? `${Math.round(sd.wx.tmax)}°` : '–'}{(hol || fer) && <Icon name="kalender-warnung" size={15} />}</small>
                </button>
              )
            })}
            {emps.map((e) => {
              const acc = hourAccount(db, e, today)
              void acc
              return [
                <div key={e.id} className="pg-name"><Avatar name={e.name} photoUrl={e.photoUrl} size={32} /><div><b title={e.name}>{e.name}</b><span>{KIND_LABEL[e.contractId] ?? e.contractId}</span></div></div>,
                ...info.map(({ d, sd }) => {
                  const shifts = db.shifts.filter((s) => s.empId === e.id && s.date === d)
                  const abs = isAbsent(db.absences, e.id, d)
                  const bad = viol.some((v) => v.empId === e.id && v.date === d)
                  return (
                    <div key={`${e.id}${d}`} className={`pg-cell ${abs && !shifts.length ? 'na' : ''}`} role="button" tabIndex={0}
                      onClick={() => { if (d < today) return; if (!shifts.length && !abs) setDlg({ date: d, empId: e.id, start: sd.open + 2, end: Math.min(sd.close, sd.open + 8) }) }}>
                      {shifts.map((s) => (
                        <button key={s.id} className={`pg-chip ${s.status === 'ausfall' ? 'ausfall' : bad ? 'warn' : ''}`}
                          title={s.status === 'ausfall' ? 'Ausfall – krank gemeldet' : `${e.name}: ${range(s.start, s.end)}`}
                          onClick={(ev) => { ev.stopPropagation(); if (s.status === 'ausfall' && s.calloutId && (db.callouts ?? []).some((c) => c.id === s.calloutId && !c.covered[s.id])) setCallout(s.calloutId); else setDlg({ shiftId: s.id, date: d, start: s.start, end: s.end }) }}>
                          {s.status === 'ausfall' ? <><Icon name="person-ausfall" size={15} /><span>krank</span></> : <span>{range(s.start, s.end).replace(' Uhr', '')}</span>}
                        </button>
                      ))}
                      {!shifts.length && (abs ? <span className="small">{abs.type === 'Krank' ? 'krank' : 'frei'}</span> : d >= today ? <span className="pg-plus"><Icon name="plus" size={16} /></span> : null)}
                    </div>
                  )
                }),
              ]
            })}
            <div className="pg-name"><IconTile icon="personen" tile={34} size={18} /><div><b>Besetzung</b><span>pro Tag</span></div></div>
            {info.map(({ d, sd, ds }) => {
              void sd
              const gap = d >= today ? ds.gaps[0] : undefined
              const lvl: Level = gap ? 'rot' : 'gruen'
              return (
                <div key={d} data-tour={gap ? 'gap-block' : undefined} className={`pg-need tint-${lvl}`} role="button" tabIndex={0} onClick={() => (gap && d >= today ? setGapDlg({ date: d, gap }) : setDayDlg(d))}>
                  {gap ? <span className="pg-gap"><Signal level="rot" size={18} />Lücke {range(gap.from, gap.to).replace(' Uhr', '')} · fehlt {gap.missing}</span> : d < today ? <span className="faint small">vorbei</span> : <SignalChip level="gruen">besetzt</SignalChip>}
                </div>
              )
            })}
          </div>
          <p className="faint small" style={{ marginTop: 10 }}>Auf eine Schicht klicken zum Ändern, auf eine rote Lücke zum Schließen.</p>
        </div>
      )}

      {view === 'monat' && (
        <div className="glass card dense">
          <div className="row between" style={{ marginBottom: 12 }}>
            <Btn size="sm" icon="pfeil-zurueck" onClick={() => setMonth(addDays(month + '-01', -1).slice(0, 7))}>Zurück</Btn>
            <h2>{new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' }).format(new Date(month + '-01T12:00'))}</h2>
            <Btn size="sm" icon="pfeil-rechts" onClick={() => setMonth(addDays(month + '-28', 5).slice(0, 7))}>Weiter</Btn>
          </div>
          <div className="mgrid">
            {WEEKDAYS_SHORT.map((w) => <b key={w} className="cap" style={{ textAlign: 'center' }}>{w}</b>)}
            {Array.from({ length: weekdayIdx(month + '-01') }, (_, i) => <span key={`p${i}`} />)}
            {Array.from({ length: 31 }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`).filter((d) => d.slice(0, 7) === month && !Number.isNaN(Date.parse(d))).map((d) => {
              const n = db.shifts.filter((s) => s.storeId === storeId && s.date === d && s.status !== 'ausfall').length
              const out = db.shifts.some((s) => s.storeId === storeId && s.date === d && s.status === 'ausfall' && !(db.callouts ?? []).some((c) => c.covered[s.id]))
              const ds = d >= today ? dayStaffing(db, storeId, d, today) : null
              const lvl: Level | null = out || ds?.gaps.length ? 'rot' : null
              const hol = holidayOn(db, storeId, d)
              return (
                <button key={d} className={`mday ${d === today ? 'today' : ''} ${lvl ? `tint-${lvl}` : ''}`} onClick={() => setDayDlg(d)}>
                  <b>{+d.slice(8)}</b>
                  <span><Icon name="personen" size={14} />{n} Schichten</span>
                  {lvl ? <SignalChip level={lvl}>{lvl === 'rot' ? 'Ausfall' : 'Lücke'}</SignalChip> : d >= today ? <Signal level="gruen" size={18} /> : null}
                  {(hol || schoolHolidayOn(db, storeId, d)) && <span title={hol?.name}><Icon name="kalender-warnung" size={14} />{hol?.name ?? 'Ferien'}</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {view === 'tag' && <PlanCalendar storeId={storeId} />}

      {dlg && <ShiftDialog key={`${dlg.shiftId ?? 'neu'}${dlg.date}${dlg.empId}`} storeId={storeId} init={dlg} onClose={() => setDlg(null)} />}
      {gapDlg && <GapDialog storeId={storeId} date={gapDlg.date} gap={gapDlg.gap} onClose={() => setGapDlg(null)} />}
      {callout && <ReplaceDialog calloutId={callout} onClose={() => setCallout(null)} />}
      {sick && <SickDialog storeId={storeId} onClose={() => setSick(false)} />}
      {dayDlg && <DayDialog storeId={storeId} date={dayDlg} onClose={() => setDayDlg(null)} onGap={(g) => { setDayDlg(null); setGapDlg({ date: dayDlg, gap: g }) }} onShift={(i) => { setDayDlg(null); setDlg(i) }} />}
      {autoFill.node}
      <span hidden>{wk(today)}{gapText.length}{WEEKDAYS.length}</span>
    </div>
  )
}

function DayDialog({ storeId, date, onClose, onGap, onShift }: { storeId: string; date: string; onClose: () => void; onGap: (g: Gap) => void; onShift: (i: ShiftInit) => void }) {
  const db = useDb()
  const today = todayISO()
  const ds = dayStaffing(db, storeId, date, today)
  const sd = staffDay(db, storeId, date, today)
  const shifts = db.shifts.filter((s) => s.storeId === storeId && s.date === date).sort((a, b) => a.start - b.start)
  const hol = holidayOn(db, storeId, date)
  return (
    <Modal onClose={onClose} wide>
      <h2>{WEEKDAYS[weekdayIdx(date)]}, {fmtDayMonth(date)}</h2>
      <p className="muted">{Math.round(sd.cups)} Becher erwartet{hol ? ` · ${hol.name}` : ''} · geöffnet {range(sd.open, sd.close)}</p>
      <div className="cap" style={{ margin: '14px 0 8px' }}>Schichten</div>
      <div className="rep-list">
        {shifts.length === 0 && <span className="muted">Noch keine Schichten.</span>}
        {shifts.map((s) => {
          const e = db.employees.find((x) => x.id === s.empId)
          return (
            <button key={s.id} className="rep-row" onClick={() => onShift({ shiftId: s.id, date, start: s.start, end: s.end })}>
              <Avatar name={e?.name ?? '?'} size={34} /><div className="rep-main"><b>{e?.name}</b><span>{range(s.start, s.end)}</span></div>
              {s.status === 'ausfall' ? <SignalChip level="rot">Ausfall</SignalChip> : <SignalChip level="gruen">Eingeplant</SignalChip>}
            </button>
          )
        })}
      </div>
      {ds.gaps.length > 0 && <>
        <div className="cap" style={{ margin: '14px 0 8px' }}>Lücken</div>
        <div className="rep-list">{ds.gaps.map((g) => <button key={`${g.from}`} className="rep-row tint-bernstein" disabled={date < today} onClick={() => onGap(g)}><Icon name="person-plus" size={22} /><div className="rep-main"><b>{gapText(date, g)}</b><span>Klicken: Wer kann einspringen?</span></div><SignalChip level="bernstein" soon /></button>)}</div>
      </>}
      <div className="actions"><Btn icon="plus" disabled={date < today} onClick={() => onShift({ date, start: sd.open, end: sd.open + 4 })}>Schicht hinzufügen</Btn><Btn kind="primary" onClick={onClose}>Schließen</Btn></div>
    </Modal>
  )
}
