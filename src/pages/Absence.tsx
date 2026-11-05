import { useMemo, useState } from 'react'
import { actions, useDb } from '../data/repository'
import type { Callout } from '../data/types'
import { addDays, todayISO, WEEKDAYS, weekdayIdx } from '../lib/date'
import { fmtDate, fmtDayMonth } from '../lib/format'
import { absentOn as _a, closedCallouts, countdownText, openCallouts, openShifts, range, suggestionsFor, type Suggestion } from '../logic/callouts'
import { Icon } from '../icons'
import { Avatar, Btn, Modal, useToast } from '../ui/kit'
import { IconTile, Signal, SignalChip, TimeChip } from '../ui/signal'
import { planUi } from '../lib/plan-ui'
import { go } from '../lib/router'

void _a
const when = (iso: string) => new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) + ' Uhr'
const NOTE = 'Hinweis (kein Rechtsrat): Krankheitsstunden werden weiter bezahlt (Entgeltfortzahlung) und zählen zur Verdienstgrenze. Die Krankmeldung gilt unverzüglich, die Krankschreibung (eAU) ist ab dem 4. Kalendertag nötig.'

/** Ausfall-Karte oben auf „Heute“ (nur, wenn ein Ausfall offen ist) – und ein grüner Hinweis, wenn er geschlossen wurde */
export function AbsenceCard({ storeId, onOpen }: { storeId: string; onOpen: (calloutId: string) => void }) {
  const db = useDb()
  const today = todayISO()
  const open = openCallouts(db, storeId, today)
  const closed = closedCallouts(db, storeId, today).filter((c) => c.reportedAt.slice(0, 10) === today)
  if (!open.length && !closed.length) return null
  return (
    <>
      {open.map((c) => {
        const e = db.employees.find((x) => x.id === c.empId)
        const sh = openShifts(db, c, today)
        const first = sh[0]
        const cd = countdownText(first)
        const asked = c.requests.find((r) => r.status === 'angefragt')
        return (
          <section key={c.id} className="glass card in absence-card" data-tour="absence">
            <Signal level="rot" size={52} pulse />
            <div className="absence-main">
              <div className="cap">Ausfall</div>
              <h2>{e?.name} fällt aus</h2>
              <p className="muted">{c.via === 'mitarbeiter' ? 'Selbst gemeldet' : 'Von der Ladenleitung eingetragen'} am {when(c.reportedAt)} · {first.date === today ? 'heute' : `${WEEKDAYS[weekdayIdx(first.date)]}, ${fmtDayMonth(first.date)}`} {range(first.start, first.end)}{sh.length > 1 ? ` und ${sh.length - 1} weitere` : ''}</p>
              <div className="row wrap" style={{ gap: 8 }}>
                <TimeChip level={cd.level}>{cd.text}</TimeChip>
                {asked && <SignalChip level="bernstein" variant="uhr">{`Angefragt: ${db.employees.find((x) => x.id === asked.empId)?.name.split(' ')[0]}`}</SignalChip>}
              </div>
            </div>
            <Btn kind="primary" icon="person-plus" onClick={() => onOpen(c.id)}>Ersatz finden</Btn>
          </section>
        )
      })}
      {!open.length && closed.map((c) => (
        <section key={c.id} className="glass card in absence-card ok">
          <Signal level="gruen" size={44} />
          <div className="absence-main"><h2>Ausfall geschlossen</h2><p className="muted">{db.employees.find((x) => x.id === c.empId)?.name}: alle Schichten sind neu besetzt.</p></div>
        </section>
      ))}
    </>
  )
}

/** „Ersatz finden“: Rangliste, Anfrage, Antwort (Demo-Testbuttons), Notlösungen */
export function ReplaceDialog({ calloutId, onClose }: { calloutId: string; onClose: () => void }) {
  const db = useDb()
  const toast = useToast()
  const today = todayISO()
  const c = (db.callouts ?? []).find((x) => x.id === calloutId)
  const [idx, setIdx] = useState(0)
  const [own, setOwn] = useState(false)
  const [calls, setCalls] = useState(false)
  const shifts = c ? openShifts(db, c, today) : []
  const shift = shifts[Math.min(idx, shifts.length - 1)]
  const sug = useMemo(() => (shift ? suggestionsFor(db, shift, today) : { ranked: [], warned: [] }), [db, shift, today])
  if (!c) return null
  const sick = db.employees.find((e) => e.id === c.empId)
  if (!shift) {
    return (
      <Modal onClose={onClose}>
        <div className="done-box"><Signal level="gruen" size={56} /><h2>Ausfall geschlossen</h2><p className="muted">Alle Schichten von {sick?.name} sind neu besetzt. Das Signal ist grün.</p></div>
        <div className="actions"><Btn kind="primary" icon="haken" onClick={onClose}>Fertig</Btn></div>
      </Modal>
    )
  }
  const reqs = c.requests.filter((r) => r.shiftId === shift.id)
  const pending = reqs.find((r) => r.status === 'angefragt')
  const declined = new Set(reqs.filter((r) => r.status === 'abgesagt').map((r) => r.empId))
  const ranked = sug.ranked.filter((s) => !declined.has(s.emp.id))
  const best = ranked[0]
  const statusOf = (s: Suggestion) => reqs.find((r) => r.empId === s.emp.id)
  const ask = (s: Suggestion) => { actions.requestCover(c.id, shift.id, s.emp.id, s.start, s.end); toast(`Anfrage an ${s.emp.name.split(' ')[0]} gesendet`) }
  const answer = (a: 'zugesagt' | 'abgesagt') => {
    if (!pending) return
    const name = db.employees.find((e) => e.id === pending.empId)?.name.split(' ')[0]
    actions.answerCover(c.id, pending.id, a)
    toast(a === 'zugesagt' ? `${name} hat zugesagt – der Ausfall ist geschlossen` : `${name} hat abgesagt – der nächste Vorschlag rückt nach`, { tone: a === 'zugesagt' ? 'ok' : 'warn' })
    if (a === 'zugesagt' && shifts.length === 1) onClose()
  }
  const row = (s: Suggestion, primary: boolean, label?: string) => {
    const st = statusOf(s)
    return (
      <div key={s.emp.id} className={`rep-row ${primary ? 'best' : ''}`}>
        <Avatar name={s.emp.name} photoUrl={s.emp.photoUrl} size={42} />
        <div className="rep-main">
          <b>{s.emp.name} {label && <SignalChip level="gruen">{label}</SignalChip>}</b>
          <span className="muted" title={s.reason}>{s.reason}</span>
          {!s.full && <span className="small warn-text">deckt {Math.round(s.hours)} von {Math.round(s.of)} Stunden</span>}
          {s.warnings.map((w) => <span key={w} className="cand-warn"><Signal level="bernstein" size={14} />{w}</span>)}
        </div>
        {st?.status === 'angefragt' ? <SignalChip level="bernstein" variant="uhr">Angefragt</SignalChip>
          : st?.status === 'abgesagt' ? <SignalChip level="info">Abgesagt</SignalChip>
            : <Btn size="sm" kind={primary ? 'primary' : 'glass'} disabled={!!pending} onClick={() => ask(s)}>Anfragen</Btn>}
      </div>
    )
  }
  const others = db.employees.filter((e) => e.storeId === c.storeId && e.active && e.id !== c.empId)
  return (
    <Modal onClose={onClose} wide>
      <div className="rep-head">
        <IconTile icon="person-ausfall" level="rot" tile={52} size={28} />
        <div><h2>Wer kann für {sick?.name.split(' ')[0]} einspringen?</h2>
          <p className="muted">{shift.date === today ? 'Heute' : `${WEEKDAYS[weekdayIdx(shift.date)]}, ${fmtDate(shift.date)}`} · {range(shift.start, shift.end)} · {countdownText(shift).text}</p></div>
      </div>
      {shifts.length > 1 && (
        <div className="row wrap" style={{ gap: 8, margin: '12px 0 0' }}>
          {shifts.map((s, i) => <Btn key={s.id} size="sm" kind={i === Math.min(idx, shifts.length - 1) ? 'primary' : 'glass'} onClick={() => setIdx(i)}>{s.date === today ? 'Heute' : `${WEEKDAYS[weekdayIdx(s.date)].slice(0, 2)}, ${fmtDayMonth(s.date)}`} {range(s.start, s.end)}</Btn>)}
        </div>
      )}
      <div className="cap" style={{ margin: '16px 0 8px' }}>Vorschläge, beste zuerst</div>
      {ranked.length === 0 && !pending ? (
        <div className="note"><Signal level="bernstein" size={22} /><div><b>Niemand verfügbar.</b> Für diese Schicht kann laut Verfügbarkeit, Ruhezeit und Verdienstgrenze gerade niemand einspringen.</div></div>
      ) : <div className="rep-list">{ranked.map((s, i) => row(s, i === 0 && !pending, i === 0 ? 'Beste Wahl' : undefined))}</div>}

      {pending && (
        <div className="demo-sim">
          <span className="cap">Demo: Antwort simulieren</span>
          <Btn size="sm" icon="haken" onClick={() => answer('zugesagt')}>Antwort simulieren: zugesagt</Btn>
          <Btn size="sm" icon="kreuz" onClick={() => answer('abgesagt')}>Antwort simulieren: abgelehnt</Btn>
        </div>
      )}

      <div className="row wrap" style={{ gap: 8, marginTop: 14 }}>
        <Btn size="sm" icon="personen" onClick={() => setOwn(!own)}>Selbst jemanden wählen</Btn>
        {ranked.length === 0 && !pending && <>
          <Btn size="sm" icon="uhr" onClick={() => { actions.leaveOpen(c.id, shift.id); toast('Schicht bleibt unbesetzt – der Laden ist unterbesetzt', { tone: 'warn' }); if (shifts.length <= 1) onClose() }}>Schicht bleibt unbesetzt (Laden unterbesetzt)</Btn>
          <Btn size="sm" icon="glocke" onClick={() => setCalls(!calls)}>Selbst anrufen</Btn>
        </>}
      </div>
      {own && (
        <div className="rep-list" style={{ marginTop: 10 }}>
          {others.map((e) => {
            const s = [...sug.ranked, ...sug.warned].find((x) => x.emp.id === e.id)
            const sg: Suggestion = s ?? { emp: e, start: shift.start, end: shift.end, hours: 0, of: shift.end - shift.start, reason: 'laut Verfügbarkeit nicht frei oder schon eingeplant', warnings: ['nicht verfügbar'], full: false, rank: 0 }
            return row(sg, false)
          })}
        </div>
      )}
      {calls && <div className="rep-list" style={{ marginTop: 10 }}>{others.map((e) => <div key={e.id} className="rep-row"><Avatar name={e.name} photoUrl={e.photoUrl} size={36} /><div className="rep-main"><b>{e.name}</b><span className="muted">{e.phone}</span></div></div>)}</div>}
      <p className="faint small" style={{ marginTop: 14 }}><Icon name="info" size={14} /> {NOTE}</p>
      <div className="actions">
        <Btn onClick={() => { planUi.openDay(shift.date); onClose(); go('/filiale/team/dienstplan') }}>Im Dienstplan ansehen</Btn>
        <Btn kind={best || pending ? 'glass' : 'primary'} onClick={onClose}>Schließen</Btn>
      </div>
    </Modal>
  )
}

/** Ladenleitung trägt eine Krankmeldung ein (z. B. nach Anruf oder WhatsApp) */
export function SickDialog({ storeId, empId, onClose, onDone }: { storeId: string; empId?: string; onClose: () => void; onDone?: (calloutId: string) => void }) {
  const db = useDb()
  const toast = useToast()
  const today = todayISO()
  const emps = db.employees.filter((e) => e.storeId === storeId && e.active)
  const [who, setWho] = useState(empId ?? emps[0]?.id ?? '')
  const [span, setSpan] = useState<'heute' | 'bis'>('heute')
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(addDays(today, 2))
  const [eau, setEau] = useState<Callout['eau']>('folgt')
  const [note, setNote] = useState('')
  const nowT = new Date()
  const [time, setTime] = useState(`${String(nowT.getHours()).padStart(2, '0')}:${String(nowT.getMinutes()).padStart(2, '0')}`)
  const via: Callout['via'] = empId ? 'mitarbeiter' : 'leitung'
  const last = span === 'heute' ? from : to < from ? from : to
  const hit = db.shifts.filter((s) => s.empId === who && s.date >= from && s.date <= last && s.status !== 'ausfall')
  const send = () => {
    const [h, m] = time.split(':').map(Number)
    const at = new Date(); at.setHours(h || 0, m || 0, 0, 0)
    const id = actions.reportSick({ storeId, empId: who, from, to: last, eau, note: note.trim(), via, at: at.toISOString() })
    toast(hit.length ? `Krankmeldung gespeichert – ${hit.length === 1 ? '1 Schicht ist' : `${hit.length} Schichten sind`} jetzt ein Ausfall` : 'Krankmeldung gespeichert – keine Schicht betroffen', { tone: hit.length ? 'warn' : 'ok' })
    onDone?.(id)
    onClose()
  }
  return (
    <Modal onClose={onClose}>
      <div className="rep-head"><IconTile icon="person-ausfall" level="rot" tile={52} size={28} /><div><h2>{empId ? 'Ich bin krank' : 'Krankmeldung eintragen'}</h2><p className="muted">{empId ? 'Dein Laden sieht es sofort und sucht Ersatz.' : 'Zum Beispiel nach einem Anruf oder einer Nachricht.'}</p></div></div>
      <div className="field-grid">
        {!empId && <div className="field"><label>Wer ist krank?</label><select className="select" value={who} onChange={(e) => setWho(e.target.value)}>{emps.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></div>}
        <div className="field"><label>Welcher Tag, wie lange?</label>
          <div className="row wrap" style={{ gap: 8 }}>
            <input className="input" type="date" min={today} value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Krank ab Tag" />
            <Btn size="sm" kind={span === 'heute' ? 'primary' : 'glass'} onClick={() => setSpan('heute')}>Nur dieser Tag</Btn>
            <Btn size="sm" kind={span === 'bis' ? 'primary' : 'glass'} onClick={() => setSpan('bis')}>Bis Datum</Btn>
            {span === 'bis' && <input className="input" type="date" min={from} value={to} onChange={(e) => setTo(e.target.value)} aria-label="Bis Datum" />}
          </div>
        </div>
        {!empId && <div className="field"><label>Gemeldet um</label><input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>}
        <div className="field"><label>Krankschreibung folgt?</label>
          <div className="row wrap" style={{ gap: 8 }}>
            <Btn size="sm" kind={eau === 'folgt' ? 'primary' : 'glass'} onClick={() => setEau('folgt')}>Ja, folgt</Btn>
            <Btn size="sm" kind={eau === 'nicht-noetig' ? 'primary' : 'glass'} onClick={() => setEau('nicht-noetig')}>Nein</Btn>
          </div>
        </div>
        <div className="field"><label>Kurzer Hinweis (freiwillig)</label><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="z. B. Erkältung" /></div>
      </div>
      <p className="muted small" style={{ marginTop: 10 }}>{hit.length ? `${hit.length === 1 ? '1 Schicht' : `${hit.length} Schichten`} betroffen: ${hit.slice(0, 3).map((s) => `${WEEKDAYS[weekdayIdx(s.date)].slice(0, 2)} ${range(s.start, s.end)}`).join(', ')}` : 'In diesem Zeitraum ist keine Schicht eingeplant.'}</p>
      <p className="faint small" style={{ marginTop: 6 }}><Icon name="info" size={14} /> {NOTE}</p>
      <div className="actions"><Btn onClick={onClose}>Abbrechen</Btn><Btn kind="primary" icon="haken" disabled={!who} onClick={send}>Krankmeldung speichern</Btn></div>
    </Modal>
  )
}
