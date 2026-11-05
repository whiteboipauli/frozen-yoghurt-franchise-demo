import { useEffect, useMemo, useRef, useState } from 'react'
import { actions, useDb } from '../data/repository'
import type { Employee, Shift } from '../data/types'
import { addDays, todayISO, WEEKDAYS, WEEKDAYS_SHORT, weekdayIdx } from '../lib/date'
import { fmtDate, fmtDayMonth, fmtTime } from '../lib/format'
import { planUi, usePlanUi } from '../lib/plan-ui'
import { availWindow, gapText, hourAccount, isAbsent, netOf, type Gap } from '../logic/hr'
import { openHours } from '../logic/history'
import { warningsFor } from '../logic/staffplan'
import { dayStaffing, gapCount, staffDay } from '../logic/staffing'
import { wxKind } from '../logic/weather'
import { weekStart } from '../logic/weekly'
import { Icon } from '../icons'
import { Avatar, Btn, Modal, Segmented, Switch, useToast } from '../ui/kit'
import { GapDialog } from './GapDialog'
import { useAutoFill } from './AutoFill'

const HOUR_PX = 44
const missingText = (n: number) => `${n} ${n === 1 ? 'fehlt' : 'fehlen'}`
const short = (h: number) => fmtTime(h).replace(':00', '').replace(/^0/, '')
const half = (h: number) => Math.round(h * 2) / 2

/** Lücken, Überbesetzung und Deckung eines Tages in zusammenhängenden Abschnitten */
function overSegments(need: Record<number, number>, cov: number[], open: number) {
  const out: { from: number; to: number }[] = []
  cov.forEach((c, i) => {
    const h = open + i
    if (c > (need[h] ?? 0)) {
      const last = out[out.length - 1]
      if (last && last.to === h) last.to = h + 1
      else out.push({ from: h, to: h + 1 })
    }
  })
  return out
}

type Seg = { from: number; to: number; state: 'ok' | 'gap' | 'over'; n: number }
/** Besetzung eines Tages in zusammenhängende Abschnitte: gedeckt, Lücke (mit Anzahl), Überbesetzung */
export function segments(sd: { open: number; need: Record<number, number> }, cov: number[]): Seg[] {
  const out: Seg[] = []
  for (let i = 0; i < cov.length; i++) {
    const h = sd.open + i
    const need = sd.need[h] ?? 0
    const c = cov[i]
    const state: Seg['state'] = c < need ? 'gap' : c > need ? 'over' : 'ok'
    const n = state === 'gap' ? need - c : state === 'over' ? c - need : need
    const last = out[out.length - 1]
    if (last && last.state === state && last.to === h && (state === 'ok' || last.n === n)) last.to = h + 1
    else out.push({ from: h, to: h + 1, state, n })
  }
  return out
}

/** Nebeneinander liegende Schichten: Gruppen sich überschneidender Schichten, innerhalb der Gruppe in Spuren */
function lanes(shifts: Shift[]) {
  const sorted = [...shifts].sort((a, b) => a.start - b.start || a.end - b.end)
  const res: { s: Shift; lane: number; n: number; from: number; to: number }[] = []
  let cluster: typeof res = []
  let clusterEnd = -1
  const flush = () => {
    const n = Math.max(1, ...cluster.map((c) => c.lane + 1))
    const from = Math.min(...cluster.map((c) => c.s.start)), to = Math.max(...cluster.map((c) => c.s.end))
    cluster.forEach((c) => { c.n = n; c.from = from; c.to = to }); res.push(...cluster); cluster = []
  }
  const laneEnd: number[] = []
  for (const s of sorted) {
    if (cluster.length && s.start >= clusterEnd) { flush(); laneEnd.length = 0 }
    let l = laneEnd.findIndex((e) => e <= s.start)
    if (l < 0) l = laneEnd.length
    laneEnd[l] = s.end
    cluster.push({ s, lane: l, n: 1, from: s.start, to: s.end })
    clusterEnd = Math.max(clusterEnd, s.end)
  }
  if (cluster.length) flush()
  return res
}

export interface ShiftInit { shiftId?: string; empId?: string; date: string; start: number; end: number }

/** Echte Kalenderansicht (wie im Apple-Kalender): Spalten Mo–So, Zeilen = Uhrzeit */
export function PlanCalendar({ storeId }: { storeId: string }) {
  const db = useDb()
  const { week, focus } = usePlanUi()
  const today = todayISO()
  const [dlg, setDlg] = useState<ShiftInit | null>(null)
  const [gapDlg, setGapDlg] = useState<{ date: string; gap: Gap } | null>(null)
  const start = addDays(weekStart(today), week * 7)
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  const autoFill = useAutoFill(storeId, days)
  const info = days.map((d) => ({ d, sd: staffDay(db, storeId, d, today), ds: dayStaffing(db, storeId, d, today) }))
  const min = Math.min(...info.map((x) => x.sd.open)), max = Math.max(...info.map((x) => x.sd.close))
  const hours = Array.from({ length: max - min }, (_, i) => min + i)
  const st = db.stores.find((s) => s.id === storeId)!
  void st
  const focusRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => { if (focus) { focusRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }); const t = setTimeout(() => planUi.clearFocus(), 2600); return () => clearTimeout(t) } }, [focus, week])
  const gapsTotal = gapCount(db, storeId, days, today)
  const wk0 = weekStart(today)
  const gapsA = gapCount(db, storeId, Array.from({ length: 7 }, (_, i) => addDays(wk0, i)), today)
  const gapsB = gapCount(db, storeId, Array.from({ length: 7 }, (_, i) => addDays(wk0, 7 + i)), today)

  return (
    <div className="cal-wrap" data-tour="week-plan">
      <div className="row between wrap" style={{ marginBottom: 12 }}>
        <div className="legend legend-card cal-legend" role="list" aria-label="Legende" data-tour="plan-legend">
          <span role="listitem"><i className="lg-sw shiftsw" />Schicht</span>
          <span role="listitem"><i className="lg-sw gapsw" />Lücke – hier fehlt jemand</span>
          <span role="listitem"><i className="lg-sw stripe" />Überbesetzung</span>
          <span role="listitem"><Icon name="lock" size={12} stroke={2.4} /> gesperrt</span>
        </div>
        <div className="row wrap no-print">
          <span className={`pill ${gapsA + gapsB ? 'red' : 'green'}`}>{gapsA + gapsB ? `${gapsA} ${gapsA === 1 ? 'Lücke' : 'Lücken'} diese Woche · ${gapsB} nächste Woche` : 'Alles besetzt'}</span>
          <Segmented value={String(week)} onChange={(v) => planUi.setWeek(Number(v))} options={[{ value: '0', label: 'Diese Woche' }, { value: '1', label: 'Nächste Woche' }]} />
          <Btn icon="plus" data-tour="add-shift" onClick={() => setDlg({ date: days.find((d) => d >= today) ?? days[0], start: info[0].sd.open, end: info[0].sd.open + 4 })}>Schicht hinzufügen</Btn>
          <Btn kind="primary" icon="sparkle" data-tour="fill-all" disabled={!gapsTotal} onClick={autoFill.run}>Alle Lücken automatisch füllen</Btn>
        </div>
      </div>

      <div className="cal glass">
        <div className="cal-head">
          <span />
          {info.map(({ d, sd, ds }) => {
            const k = sd.wx ? wxKind(sd.wx) : null
            return (
              <div key={d} className={`cal-dh ${d === today ? 'today' : ''} ${d < today ? 'past' : ''} ${focus === d ? 'focus' : ''}`}>
                <b>{WEEKDAYS_SHORT[weekdayIdx(d)]} {fmtDayMonth(d)}</b>
                <span className="cal-wx"><Icon name={k?.icon ?? 'wx-none'} size={17} stroke={1.6} />{sd.wx ? `${Math.round(sd.wx.tmax)}°` : '–'}</span>
                {ds.gaps.length > 0 && <i className="cal-dot" title="Lücke" />}
              </div>
            )
          })}
        </div>
        <div className="cal-body" style={{ height: hours.length * HOUR_PX }}>
          <div className="cal-axis">{hours.map((h, i) => <span key={h} style={{ top: i * HOUR_PX }}>{fmtTime(h)}</span>)}</div>
          {info.map(({ d, sd, ds }) => {
            const shifts = db.shifts.filter((s) => s.storeId === storeId && s.date === d && db.employees.find((e) => e.id === s.empId)?.active !== false)
            const placed = lanes(shifts)
            const over = overSegments(sd.need, ds.cov, sd.open)
            const y = (h: number) => (h - min) * HOUR_PX
            const hasGap = (a: number, b: number) => ds.gaps.some((g) => g.from < b && g.to > a)
            const hasShift = (g: Gap) => shifts.some((s) => s.start < g.to && s.end > g.from)
            const past = d < today
            return (
              <div key={d} ref={focus === d ? focusRef : undefined} className={`cal-col ${d === today ? 'today' : ''} ${past ? 'past' : ''} ${focus === d ? 'focus' : ''}`} data-day={d}
                style={{ backgroundSize: `100% ${HOUR_PX}px` }}
                onClick={(e) => {
                  if (past || e.target !== e.currentTarget) return
                  const r = e.currentTarget.getBoundingClientRect()
                  const h = Math.min(sd.close - 1, Math.max(sd.open, Math.floor((min + (e.clientY - r.top) / HOUR_PX) * 2) / 2))
                  setDlg({ date: d, start: h, end: Math.min(sd.close, h + 4) })
                }}>
                {/* außerhalb der Öffnungszeit */}
                {sd.open > min && <span className="cal-closed" style={{ top: 0, height: y(sd.open) }} />}
                {sd.close < max && <span className="cal-closed" style={{ top: y(sd.close), height: (max - sd.close) * HOUR_PX }} />}
                {over.map((o, i) => <span key={i} className="cal-over" style={{ top: y(o.from), height: (o.to - o.from) * HOUR_PX }} title="Überbesetzung" />)}
                {ds.gaps.map((g) => (
                  <button key={`${g.from}-${g.to}`} className={`cal-gap ${hasShift(g) ? 'side' : ''}`} style={{ top: y(g.from) + 1, height: (g.to - g.from) * HOUR_PX - 2 }} disabled={past}
                    title={gapText(d, g)} data-tour="gap-block" onClick={(e) => { e.stopPropagation(); setGapDlg({ date: d, gap: g }) }}>
                    <b>{missingText(g.missing)}</b><span>{short(g.from)}–{short(g.to)}</span>
                  </button>
                ))}
                {placed.map(({ s, lane, n, from, to }) => {
                  const e = db.employees.find((x) => x.id === s.empId)!
                  const area = hasGap(from, to) ? 56 : 100
                  return (
                    <button key={s.id} className={`cal-shift ${s.locked ? 'locked' : ''} ${n >= 3 ? 'l3' : ''}`} onClick={(ev) => { ev.stopPropagation(); setDlg({ shiftId: s.id, date: d, start: s.start, end: s.end }) }}
                      style={{ top: y(s.start) + 1, height: (s.end - s.start) * HOUR_PX - 2, left: `calc(${(lane / n) * area}% + 2px)`, width: `calc(${area / n}% - 4px)` }}
                      title={`${e.name}: ${fmtTime(s.start)}–${fmtTime(s.end)} Uhr (${netOf(db.settings.hr, e, s)} Std. netto) – zum Bearbeiten anklicken`}>
                      <b>{s.locked && <Icon name="lock" size={10} />}{e.name.split(' ')[0]}</b>
                      <span>{short(s.start)}–{short(s.end)}</span>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
      <p className="faint small" style={{ marginTop: 8 }}>Tipp: Auf eine rote Lücke oder eine freie Stelle klicken, um eine Schicht hinzuzufügen. Auf eine Schicht klicken, um sie zu ändern.</p>
      {gapDlg && <GapDialog key={`${gapDlg.date}${gapDlg.gap.from}${gapDlg.gap.to}`} storeId={storeId} date={gapDlg.date} gap={gapDlg.gap} onClose={() => setGapDlg(null)} />}
      {autoFill.node}
      {dlg && <ShiftDialog key={`${dlg.shiftId ?? 'neu'}${dlg.date}${dlg.start}`} storeId={storeId} init={dlg} onClose={() => setDlg(null)} />}
    </div>
  )
}

interface Cand { e: Employee; cover: 'voll' | 'teil' | 'nein'; text: string; open: number; warnings: string[]; score: number }

/** „Schicht hinzufügen“ / bearbeiten: links Tag, Zeit und gewählte Person, rechts die Verfügbarkeiten für genau diese Zeit */
export function ShiftDialog({ storeId, init, onClose }: { storeId: string; init: ShiftInit; onClose: () => void }) {
  const db = useDb()
  const toast = useToast()
  const today = todayISO()
  const existing = init.shiftId ? db.shifts.find((s) => s.id === init.shiftId) : undefined
  const [date, setDate] = useState(init.date)
  const [from, setFrom] = useState(init.start)
  const [to, setTo] = useState(init.end)
  const [empId, setEmpId] = useState(init.empId ?? existing?.empId ?? '')
  const [locked, setLocked] = useState(existing?.locked ?? true)
  const st = db.stores.find((s) => s.id === storeId)!
  const { open, close } = openHours(st, date)
  const dayOpts = Array.from({ length: 14 }, (_, i) => addDays(today, i))
  if (!dayOpts.includes(date)) dayOpts.unshift(date)
  const step = Array.from({ length: Math.round((close - open) * 2) + 1 }, (_, i) => open + i / 2)
  const valid = to > from && !!empId
  const dbWithout = useMemo(() => (existing ? { ...db, shifts: db.shifts.filter((s) => s.id !== existing.id) } : db), [db, existing])

  const cands = useMemo<Cand[]>(() => {
    const list: Cand[] = []
    for (const e of db.employees.filter((x) => x.storeId === storeId && (x.active || x.id === existing?.empId))) {
      const abs = isAbsent(db.absences, e.id, date)
      let w = abs ? null : availWindow(db.availability.find((a) => a.empId === e.id && a.date === date), open, close)
      if (w && e.under18) w = [w[0], Math.min(w[1], db.settings.hr.under18.latestEnd)]
      const cover: Cand['cover'] = !w ? 'nein' : w[0] <= from && w[1] >= to ? 'voll' : w[0] < to && w[1] > from ? 'teil' : 'nein'
      const warnings = to > from ? warningsFor(dbWithout, storeId, e, { id: 'tmp', storeId, empId: e.id, date, start: from, end: to, locked: true, why: '' }) : []
      if (cover === 'teil' && w) warnings.unshift(`verfügbar nur ${fmtTime(w[0])}–${fmtTime(w[1])} Uhr`)
      if (cover === 'nein') warnings.unshift(abs ? `${abs.type}` : 'laut Verfügbarkeit nicht da')
      const acc = hourAccount(db, e, today)
      const load = acc.gearbeitet + db.shifts.filter((s) => s.empId === e.id && s.id !== existing?.id && s.date >= today && s.date.slice(0, 7) === today.slice(0, 7)).reduce((a, s) => a + netOf(db.settings.hr, e, s), 0)
      const openH = Math.max(0, e.targetHours - load)
      const text = abs ? abs.type : w ? `verfügbar ${fmtTime(w[0])}–${fmtTime(w[1])} Uhr` : 'nicht verfügbar'
      const score = (cover === 'voll' ? 0 : cover === 'teil' ? 2 : 4) + (warnings.length > (cover === 'voll' ? 0 : 1) ? 1 : 0)
      list.push({ e, cover, text, open: openH, warnings, score })
    }
    return list.sort((a, b) => a.score - b.score || b.open - a.open || a.e.name.localeCompare(b.e.name, 'de'))
  }, [db, dbWithout, storeId, date, from, to, open, close, existing, today])

  const sel = cands.find((c) => c.e.id === empId)
  const save = () => {
    actions.saveShift({ id: existing?.id ?? `sh${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, storeId, empId, date, start: from, end: to, locked, why: existing ? 'manuell angepasst' : 'zugeteilt (Schicht hinzugefügt)' })
    toast(`${sel?.e.name.split(' ')[0] ?? 'Schicht'}: ${fmtTime(from)}–${fmtTime(to)} Uhr eingeplant`)
    onClose()
  }
  return (
    <Modal onClose={onClose} wide light>
      <div className="shift-dlg" data-tour="shift-dialog">
        <div className="sd-left">
          <h2>{existing ? 'Schicht bearbeiten' : 'Schicht hinzufügen'}</h2>
          <p className="muted small">{WEEKDAYS[weekdayIdx(date)]}, {fmtDate(date)}</p>
          <div className="field"><label>Tag</label>
            <select className="select" value={date} onChange={(e) => { setDate(e.target.value); const o = openHours(st, e.target.value); setFrom((f) => Math.max(o.open, Math.min(f, o.close - 1))); setTo((t) => Math.min(o.close, Math.max(t, o.open + 1))) }}>
              {dayOpts.map((d) => <option key={d} value={d}>{WEEKDAYS[weekdayIdx(d)]}, {fmtDayMonth(d)}</option>)}
            </select></div>
          <div className="row">
            <div className="field grow"><label>Beginn</label><select className="select" value={from} onChange={(e) => setFrom(Number(e.target.value))}>{step.slice(0, -1).map((h) => <option key={h} value={h}>{fmtTime(h)} Uhr</option>)}</select></div>
            <div className="field grow"><label>Ende</label><select className="select" value={to} onChange={(e) => setTo(Number(e.target.value))}>{step.slice(1).map((h) => <option key={h} value={h}>{fmtTime(h)} Uhr</option>)}</select></div>
          </div>
          <div className="field"><label>Gewählte Person</label>
            {sel ? (
              <div className={`pick ${sel.warnings.length ? 'warn' : ''}`}>
                <Avatar name={sel.e.name} photoUrl={sel.e.photoUrl} size={38} />
                <div className="grow"><b>{sel.e.name}</b><div className="small muted">{to > from ? `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(netOf(db.settings.hr, sel.e, { start: from, end: to }))} Std. netto` : 'Ende nach Beginn wählen'}</div>
                  {sel.warnings.map((w) => <div key={w} className="cand-warn"><Icon name="warn" size={13} stroke={2.4} />{w}</div>)}</div>
              </div>
            ) : <div className="pick empty-pick">Noch niemand gewählt – rechts eine Person anklicken.</div>}
          </div>
          <label className="row small"><Switch on={locked} onChange={setLocked} label="Schicht sperren" /><span>Sperren – bleibt beim automatischen Erstellen erhalten</span></label>
        </div>
        <div className="sd-right">
          <div className="cap">Verfügbar {fmtTime(from)}–{fmtTime(to)} Uhr</div>
          <div className="sd-list">
            {cands.map((c) => (
              <button key={c.e.id} className={`cand-row ${c.cover} ${c.e.id === empId ? 'on' : ''}`} onClick={() => setEmpId(c.e.id)} aria-pressed={c.e.id === empId}>
                <Avatar name={c.e.name} photoUrl={c.e.photoUrl} size={34} />
                <span className="cand-main">
                  <b>{c.e.name}</b>
                  <span className="small muted">{c.text} · noch {new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(c.open)} Std. offen</span>
                  {c.warnings.filter((_, i) => c.cover === 'voll' || i > 0 || c.cover === 'nein' ? true : true).slice(0, 2).map((w) => <span key={w} className="cand-warn"><Icon name="warn" size={12} stroke={2.4} />{w}</span>)}
                </span>
                <span className={`cand-tag ${c.cover === 'voll' && !c.warnings.length ? 'ok' : c.cover === 'nein' ? 'no' : 'warn'}`}>{c.cover === 'voll' && !c.warnings.length ? 'passt' : c.cover === 'nein' ? 'nicht da' : 'Warnung'}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="actions">
        {existing && <Btn kind="danger" onClick={() => { actions.removeShift(existing.id); toast('Schicht gelöscht'); onClose() }}>Löschen</Btn>}
        <Btn onClick={onClose}>Abbrechen</Btn>
        <Btn kind="primary" disabled={!valid} onClick={save}>Schicht speichern</Btn>
      </div>
    </Modal>
  )
}
