import { useState } from 'react'
import { actions, useDb } from '../data/repository'
import type { Employee } from '../data/types'
import { todayISO } from '../lib/date'
import { fmtEUR } from '../lib/format'
import { belowMinWage, contractOf, hourAccount, maxMonthHours, valueOn } from '../logic/hr'
import { Avatar, Btn, Card, Modal, NumInput, PageHead, Pill, Ring, Switch, useToast } from '../ui/kit'
import { SignalChip } from '../ui/signal'
import { Icon } from '../icons'
import { readImage } from '../lib/image'

const FLAG = {
  ok: { color: 'var(--ok)', label: '' },
  ueber: { color: 'var(--warn)', label: 'Überstunden' },
  minus: { color: 'var(--warn)', label: 'Minusstunden' },
  grenze: { color: 'var(--bad)', label: 'Minijob-Grenze fast erreicht' },
}

/** Mitarbeitende der Filiale mit Stundenkonto (Soll, geplant, gearbeitet, Saldo) */
export function EmployeesPage({ storeId }: { storeId: string }) {
  const db = useDb()
  const today = todayISO()
  const hr = db.settings.hr
  const [edit, setEdit] = useState<Employee | null>(null)
  const emps = db.employees.filter((e) => e.storeId === storeId).sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'de'))
  const flags = emps.filter((e) => e.active).map((e) => hourAccount(db, e, today).flag)
  const n = (f: string) => flags.filter((x) => x === f).length
  const plural = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`
  const sumChips: { t: string; tone: 'yellow' | 'red' }[] = [
    ...(n('ueber') ? [{ t: `${plural(n('ueber'), 'Person', 'Personen')} mit Überstunden`, tone: 'yellow' as const }] : []),
    ...(n('minus') ? [{ t: `${plural(n('minus'), 'Person', 'Personen')} mit Minusstunden`, tone: 'yellow' as const }] : []),
    ...(n('grenze') ? [{ t: `${plural(n('grenze'), 'Person', 'Personen')} nahe der Minijob-Grenze`, tone: 'red' as const }] : []),
  ]
  const blank = (): Employee => ({ id: '', storeId, name: '', contractId: 'minijob', targetHours: 36, maxWeekHours: 16, wage: valueOn(hr.minWage, today), quals: [], phone: '', email: '', active: true, under18: false })
  const nfm = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 })
  return (
    <>
      <Card title="Mitarbeitende" tour="employees" right={<div className="row wrap">
        {sumChips.length === 0 ? <SignalChip level="gruen">Alle Stunden in Ordnung</SignalChip> : sumChips.map((c) => <Pill key={c.t} tone={c.tone}>{c.t}</Pill>)}
        <Btn icon="plus" onClick={() => setEdit(blank())}>Person anlegen</Btn>
      </div>}>
        <div className="n-list">
          {emps.map((e) => {
            const a = hourAccount(db, e, today)
            const c = contractOf(hr, e)
            const total = a.gearbeitet + (a.geplant - sumPastPlanned(db, e, today))
            const f = FLAG[a.flag]
            return (
              <div key={e.id} className="n-row emp" style={{ opacity: e.active ? 1 : 0.55 }}>
                <Avatar name={e.name} photoUrl={e.photoUrl} size={42} />
                <div className="n-main"><b>{e.name}</b><span className="muted small">{c?.name ?? e.contractId}{e.under18 ? ' · unter 18' : ''}{e.quals.length ? ` · ${e.quals.join(', ')}` : ''}{!e.active ? ' · inaktiv' : ''}</span></div>
                {c?.kind === 'minijob'
                  ? <><Ring value={total * e.wage} max={valueOn(hr.minijobLimit, today)} size={52} stroke={6} color={f.color}><span className="emp-ring">{Math.round((total * e.wage / valueOn(hr.minijobLimit, today)) * 100)}%</span></Ring>
                    <div className="emp-hours"><b>{nfm.format(total * e.wage)} von {nfm.format(valueOn(hr.minijobLimit, today))} €</b><span className="muted small">Verdienst im Monat</span></div></>
                  : <><Ring value={total} max={Math.max(1, e.targetHours)} size={52} stroke={6} color={f.color}><span className="emp-ring">{Math.round((total / Math.max(1, e.targetHours)) * 100)}%</span></Ring>
                    <div className="emp-hours"><b>{nfm.format(total)} von {nfm.format(e.targetHours)}</b><span className="muted small">Std. diesen Monat</span></div></>}
                <div className="emp-flags">
                  {f.label && <Pill tone={a.flag === 'grenze' ? 'red' : 'yellow'}>{f.label}</Pill>}
                  {belowMinWage(hr, e, today) && <Pill tone="red">unter Mindestlohn</Pill>}
                </div>
                <Btn onClick={() => setEdit(e)}>Bearbeiten</Btn>
              </div>
            )
          })}
        </div>
      </Card>
      {edit && <EmployeeModal key={edit.id || 'neu'} emp={edit} onClose={() => setEdit(null)} />}
    </>
  )
}
function sumPastPlanned(db: ReturnType<typeof useDb>, e: Employee, today: string) {
  // geplante Nettostunden bereits vergangener Tage des Monats (sind in „gearbeitet“ enthalten)
  const ym = today.slice(0, 7)
  let s = 0
  for (const sh of db.shifts) if (sh.empId === e.id && sh.date < today && sh.date.slice(0, 7) === ym) s += Math.max(0, sh.end - sh.start - (sh.end - sh.start > 9 ? 0.75 : sh.end - sh.start > 6 ? 0.5 : 0))
  return s
}

function EmployeeModal({ emp, onClose }: { emp: Employee; onClose: () => void }) {
  const db = useDb()
  const toast = useToast()
  const hr = db.settings.hr
  const [e, setE] = useState(emp)
  const isNew = !emp.id
  const c = contractOf(hr, e)
  const mm = maxMonthHours(hr, e, todayISO())
  const [qual, setQual] = useState('')
  const set = (p: Partial<Employee>) => setE({ ...e, ...p })
  return (
    <Modal onClose={onClose} wide>
      <h2>{isNew ? 'Person anlegen' : e.name}</h2>
      <div className="stack" style={{ marginTop: 14, gap: 14 }}>
        <div className="row wrap">
          <div className="field" style={{ flex: 1 }}><label>Name</label><input className="input wide" value={e.name} onChange={(ev) => set({ name: ev.target.value })} autoFocus /></div>
          <div className="field"><label>Vertragsart</label>
            <select className="select" value={e.contractId} onChange={(ev) => { const k = hr.contracts.find((x) => x.id === ev.target.value)!; set({ contractId: k.id, targetHours: k.defaultTarget, maxWeekHours: k.defaultMaxWeek }) }}>
              {hr.contracts.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
            </select></div>
        </div>
        <div className="row wrap">
          <div className="field"><label>Soll-Stunden pro Monat</label><NumInput width={110} step={0.5} value={e.targetHours} onChange={(v) => set({ targetHours: v })} /></div>
          <div className="field"><label>Höchststunden pro Woche</label><NumInput width={110} step={1} value={e.maxWeekHours} onChange={(v) => set({ maxWeekHours: v })} /></div>
          <div className="field"><label>Stundenlohn (€)</label><NumInput width={110} step={0.1} value={e.wage} onChange={(v) => set({ wage: v })} /></div>
        </div>
        {belowMinWage(hr, e) && <div className="note" role="alert"><Icon name="warn" /><div><b>Warnung:</b> Der Stundenlohn liegt unter dem Mindestlohn ({fmtEUR(valueOn(hr.minWage, todayISO()))}).</div></div>}
        {c?.kind === 'minijob' && mm !== null && <div className="note"><Icon name="info" /><div>Minijob: bei {fmtEUR(e.wage)}/Std. und {fmtEUR(valueOn(hr.minijobLimit, todayISO()))} Verdienstgrenze sind höchstens <b>{new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(mm)} Stunden pro Monat</b> möglich (automatisch berechnet).{e.targetHours > mm && <> <b>Das Soll liegt darüber.</b></>}</div></div>}
        {c?.kind === 'werkstudent' && <div className="note"><Icon name="info" /><div>Werkstudent: höchstens {c.weekHoursTerm ?? 20} Stunden pro Woche in der Vorlesungszeit, in den Semesterferien bis {c.weekHoursBreak ?? 40} Stunden.</div></div>}
        <div className="field"><label>Qualifikationen</label>
          <div className="chips">
            {['Schichtleitung', ...e.quals.filter((q) => q !== 'Schichtleitung')].map((q) => { const on = e.quals.includes(q); return <button key={q} className="chip" aria-pressed={on} style={{ height: 34, fontSize: 13.5, padding: '0 13px' }} onClick={() => set({ quals: on ? e.quals.filter((x) => x !== q) : [...e.quals, q] })}>{q}</button> })}
            <input className="input" style={{ width: 150, height: 34 }} placeholder="+ weitere" value={qual} onChange={(ev) => setQual(ev.target.value)} onKeyDown={(ev) => { if (ev.key === 'Enter' && qual.trim()) { set({ quals: [...e.quals, qual.trim()] }); setQual('') } }} />
          </div>
        </div>
        <div className="row" style={{ gap: 14 }}>
          <Avatar name={e.name || '?'} photoUrl={e.photoUrl} size={56} />
          <label className="btn glass sm" style={{ cursor: 'pointer' }}>Eigenes Foto hochladen<input type="file" accept="image/*" hidden onChange={async (ev) => { const f = ev.target.files?.[0]; if (f) try { set({ photoUrl: await readImage(f, 200) }) } catch { toast('Das Bild konnte nicht gelesen werden') } }} /></label>
          {e.photoUrl && <Btn size="sm" kind="ghost" onClick={() => set({ photoUrl: undefined })}>Foto entfernen</Btn>}
          <span className="faint small">Ohne Foto erscheinen Initialen.</span>
        </div>
        <div className="row wrap">
          <div className="field"><label>Telefon</label><input className="input" value={e.phone} onChange={(ev) => set({ phone: ev.target.value })} /></div>
          <div className="field" style={{ flex: 1 }}><label>E-Mail</label><input className="input wide" value={e.email} onChange={(ev) => set({ email: ev.target.value })} /></div>
        </div>
        <div className="row wrap" style={{ gap: 28 }}>
          <label className="row"><Switch on={e.active} onChange={(v) => set({ active: v })} label="aktiv" /><span>aktiv</span></label>
          <label className="row"><Switch on={e.under18} onChange={(v) => set({ under18: v })} label="unter 18" /><span>unter 18 (strengere Arbeitszeitregeln)</span></label>
        </div>
      </div>
      <div className="actions">
        <Btn onClick={onClose}>Abbrechen</Btn>
        <Btn kind="primary" disabled={!e.name.trim()} onClick={() => { actions.saveEmployee({ ...e, id: e.id || `${e.storeId}-m${Date.now().toString(36)}`, name: e.name.trim() }); onClose(); toast(isNew ? 'Person angelegt' : 'Gespeichert') }}>Speichern</Btn>
      </div>
    </Modal>
  )
}
