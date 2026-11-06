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
import { dayWxIcon } from '../logic/today'
import { range } from '../logic/callouts'
import { Icon } from '../icons'
import { Avatar, Btn, Modal, Segmented, useToast } from '../ui/kit'
import { IconTile, Signal, SignalChip, type Level } from '../ui/signal'
import { PlanCalendar, ShiftDialog, type ShiftInit } from './PlanCalendar'
import { GapDialog } from './GapDialog'
import { ReplaceDialog, SickDialog } from './Absence'

type View = 'woche' | 'monat' | 'tag'
const short = (name: string) => { const p = name.split(' '); return p.length > 1 ? `${p[0]} ${p[p.length - 1][0]}.` : name }
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
  const hoursList = Array.from({ length: Math.max(1, info[0].sd.close - info[0].sd.open) }, (_, i) => info[0].sd.open + i)
  const meanCups = info.reduce((n, x) => n + x.sd.cups, 0) / 7
  let gapMarked = false

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
        <div className="glass card pgrid dense" data-tour="week-grid">
          <div className="tg">
            <span />
            {info.map(({ d, sd, ds }) => {
              const hol = holidayOn(db, storeId, d), fer = schoolHolidayOn(db, storeId, d)
              return (
                <button key={d} className={`pg-h ${d === today ? 'today' : ''} ${focus === d ? 'today' : ''} ${d >= today && ds.gaps.length ? 'gap' : ''} ${d < today ? 'past' : ''}`} onClick={() => setDayDlg(d)} title={hol?.name ?? (fer ? 'Schulferien' : '')}>
                  <span>{WEEKDAYS_SHORT[weekdayIdx(d)]} {fmtDayMonth(d)}</span>
                  <small><Icon name={dayWxIcon(sd.wx, sd.cups, meanCups)} size={16} />{Math.round(sd.cups / 10) * 10} Becher{(hol || fer) && <Icon name="kalender-warnung" size={14} />}</small>
                </button>
              )
            })}
            {hoursList.map((h) => [
              <div key={`h${h}`} className="tg-hour">{h}–{h + 1}</div>,
              ...info.map(({ d, sd, ds }) => {
                const need = sd.need[h] ?? 0
                const cov = ds.cov[h - sd.open] ?? 0
                const miss = need - cov
                const state = miss > 0 ? 'gap' : miss < 0 ? 'over' : 'ok'
                const here = db.shifts.filter((s) => s.storeId === storeId && s.date === d && s.start <= h && s.end > h)
                const win = miss > 0 && d >= today ? ds.gaps.find((g) => g.from <= h && h < g.to) : undefined
                const firstGap = win && !gapMarked && ((gapMarked = true))
                return (
                  <div key={`${d}${h}`} className={`tg-cell ${state} ${d < today ? 'past' : ''} ${win ? 'click' : ''}`} data-tour={firstGap ? 'gap-block' : undefined}
                    role={win ? 'button' : undefined} tabIndex={win ? 0 : undefined} onClick={() => win && setGapDlg({ date: d, gap: win })} onKeyDown={(e) => win && e.key === 'Enter' && setGapDlg({ date: d, gap: win })}
                    title={`${WEEKDAYS_SHORT[weekdayIdx(d)]} ${h}–${h + 1} Uhr: Bedarf ${need}`}>
                    {here.map((s) => {
                      const e = db.employees.find((x) => x.id === s.empId)
                      const sick = s.status === 'ausfall'
                      return (
                        <button key={s.id} className={`tg-chip ${sick ? 'krank' : ''}`} title={`${e?.name ?? ''}: ${range(s.start, s.end)}${sick ? ' – krank' : ''}`}
                          onClick={(ev) => { ev.stopPropagation(); if (sick && s.calloutId && (db.callouts ?? []).some((c) => c.id === s.calloutId && !c.covered[s.id])) setCallout(s.calloutId); else if (d >= today) setDlg({ shiftId: s.id, date: d, start: s.start, end: s.end, empId: s.empId }) }}>
                          {short(e?.name ?? '?')}{sick && ' · krank'}
                        </button>
                      )
                    })}
                    {state === 'gap' && d >= today && <span className="tg-flag gap"><Signal level="rot" size={13} />fehlt {miss}</span>}
                    {state === 'over' && d >= today && <span className="tg-flag over"><Signal level="bernstein" size={13} />+{-miss}</span>}
                  </div>
                )
              }),
            ])}
          </div>
          <p className="faint small" style={{ marginTop: 10 }}>Grün: Bedarf erfüllt · rot: Lücke (Klick schließt sie) · gelb: überbesetzt. Auf einen Namen klicken zum Ändern der Schicht.</p>
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
