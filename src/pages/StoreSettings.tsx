import { useState } from 'react'
import { actions, useDb } from '../data/repository'
import type { ContractKind, ContractType, DatedValue } from '../data/types'
import { fmtEUR } from '../lib/format'
import { storeOf } from '../logic/history'
import { Btn, Card, Info, NumInput, PageHead, Pill, Segmented } from '../ui/kit'

type Tab = 'filiale' | 'vertraege' | 'regeln'
const KIND: Record<ContractKind, string> = { minijob: 'Minijob', werkstudent: 'Werkstudent', teilzeit: 'Teilzeit', vollzeit: 'Vollzeit', sonstig: 'Sonstiges' }

/** Filial-Einstellungen: Öffnungszeiten, Personalbedarf, Vertragsarten, Mindestlohn, Arbeitszeitregeln */
export function StoreSettingsPage({ storeId }: { storeId: string }) {
  const [tab, setTab] = useState<Tab>('filiale')
  const db = useDb()
  const st = storeOf(db, storeId)
  return (
    <>
      <PageHead title={`Einstellungen · ${st.name}`} hint="Öffnungszeiten, Personalbedarf und Personal-Regeln. Alle Werte sind Demo-Werte und änderbar." />
      <div style={{ marginBottom: 20 }}><Segmented<Tab> value={tab} onChange={setTab} options={[{ value: 'filiale', label: 'Öffnungszeiten & Bedarf' }, { value: 'vertraege', label: 'Vertragsarten & Löhne' }, { value: 'regeln', label: 'Arbeitszeitregeln' }]} /></div>
      <div className="note" style={{ marginBottom: 18 }}><span>⚠️</span><div><b>Werte Stand 2026 – gesetzliche Vorgaben bitte prüfen.</b> Mindestlohn, Minijob-Grenze und Arbeitszeitregeln sind Demo-Werte für Deutschland und ersetzen keine Rechts- oder Steuerberatung.</div></div>
      {tab === 'filiale' && <StoreTab storeId={storeId} />}
      {tab === 'vertraege' && <ContractsTab />}
      {tab === 'regeln' && <RulesTab />}
    </>
  )
}

function StoreTab({ storeId }: { storeId: string }) {
  const db = useDb()
  const st = storeOf(db, storeId)
  const h = st.hours
  const set = (p: Partial<typeof h>) => actions.updateStore(storeId, { hours: { ...h, ...p } })
  return (
    <div className="grid g2" style={{ alignItems: 'start' }}>
      <Card title="Öffnungszeiten" i={0}>
        <div className="row wrap" style={{ gap: 24 }}>
          <div className="field"><label>Öffnet um (Uhr)</label><NumInput width={90} value={h.open} min={0} onChange={(v) => set({ open: Math.min(23, Math.round(v)) })} /></div>
          <div className="field"><label>Schließt um (Uhr)</label><NumInput width={90} value={h.close} min={1} onChange={(v) => set({ close: Math.max(h.open + 1, Math.min(24, Math.round(v))) })} /></div>
          <div className="field"><label>Sommer bis (Uhr)</label><NumInput width={90} value={h.summerClose} min={1} onChange={(v) => set({ summerClose: Math.max(h.open + 1, Math.min(24, Math.round(v))) })} /></div>
        </div>
        <p className="faint small" style={{ marginTop: 10 }}>Sommer = Mai bis September. Demo: 11–20 Uhr, im Sommer bis 21 Uhr.</p>
      </Card>
      <Card title={<>Personalbedarf<Info text="Benötigte Mitarbeitende pro Stunde = erwartete Becher pro Stunde ÷ Becher pro Mitarbeiter-Stunde, aufgerundet, mindestens die Mindestbesetzung." /></>} i={1}>
        <div className="row wrap" style={{ gap: 24 }}>
          <div className="field"><label>Becher pro Mitarbeiter-Stunde</label><NumInput width={90} value={st.cupsPerStaffHour} min={5} onChange={(v) => actions.updateStore(storeId, { cupsPerStaffHour: Math.max(5, v) })} /></div>
          <div className="field"><label>Mindestbesetzung</label><NumInput width={90} value={st.minStaff} min={1} onChange={(v) => actions.updateStore(storeId, { minStaff: Math.max(1, Math.round(v)) })} /></div>
        </div>
      </Card>
      <Card title="Standort" i={2}>
        <p className="muted">{st.name} · {st.city}</p>
        <p className="faint small" style={{ marginTop: 6 }}>Der Standort (Stadt, Bundesland {st.state}) bestimmt Wetter, gesetzliche Feiertage und Schulferien. Koordinaten pflegt das HQ.</p>
      </Card>
    </div>
  )
}

function Dated({ title, list, unit, onChange }: { title: string; list: DatedValue[]; unit: string; onChange: (l: DatedValue[]) => void }) {
  return (
    <div style={{ padding: '10px 0', borderTop: '1px solid var(--grid)' }}>
      <div className="strong" style={{ marginBottom: 8 }}>{title}</div>
      {list.map((x, i) => (
        <div key={i} className="row" style={{ marginBottom: 6 }}>
          <span className="muted">ab</span><input type="date" className="input" value={x.from} onChange={(e) => onChange(list.map((y, k) => (k === i ? { ...y, from: e.target.value } : y)))} />
          <NumInput width={100} step={0.1} value={x.value} onChange={(v) => onChange(list.map((y, k) => (k === i ? { ...y, value: v } : y)))} /><span className="muted">{unit}</span>
        </div>
      ))}
    </div>
  )
}

function ContractsTab() {
  const db = useDb()
  const hr = db.settings.hr
  const setC = (id: string, p: Partial<ContractType>) => actions.updateHr({ contracts: hr.contracts.map((c) => (c.id === id ? { ...c, ...p } : c)) })
  return (
    <div className="stack">
      <Card title="Mindestlohn und Minijob-Grenze" i={0}>
        <Dated title="Mindestlohn" unit="€ / Std." list={hr.minWage} onChange={(l) => actions.updateHr({ minWage: l })} />
        <Dated title="Minijob-Verdienstgrenze" unit="€ / Monat" list={hr.minijobLimit} onChange={(l) => actions.updateHr({ minijobLimit: l })} />
        <p className="faint small" style={{ marginTop: 10 }}>Die höchstmöglichen Minijob-Stunden pro Monat werden automatisch aus Stundenlohn und Grenze berechnet (z. B. {fmtEUR(hr.minijobLimit[0]?.value ?? 0)} ÷ {fmtEUR(hr.minWage[0]?.value ?? 1)} ≈ {new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(Math.floor(((hr.minijobLimit[0]?.value ?? 0) / (hr.minWage[0]?.value || 1)) * 10) / 10)} Std.). Eine Warnung erscheint, wenn ein Stundenlohn darunter liegt.</p>
      </Card>
      <Card title="Vertragsarten" i={1} right={<Btn size="sm" kind="primary" icon="plus" onClick={() => actions.updateHr({ contracts: [...hr.contracts, { id: 'v' + Date.now().toString(36), name: 'Neue Vertragsart', kind: 'sonstig', defaultTarget: 60, defaultMaxWeek: 20 }] })}>Vertragsart</Btn>}>
        <div className="table-wrap"><table className="tbl">
          <thead><tr><th>Name</th><th>Regel</th><th className="r">Soll / Monat</th><th className="r">Max. / Woche</th><th className="r">Vorlesungszeit</th><th className="r">Semesterferien</th></tr></thead>
          <tbody>
            {hr.contracts.map((c) => (
              <tr key={c.id}>
                <td><input className="input" value={c.name} onChange={(e) => setC(c.id, { name: e.target.value })} /></td>
                <td><select className="select" value={c.kind} onChange={(e) => setC(c.id, { kind: e.target.value as ContractKind })}>{(Object.keys(KIND) as ContractKind[]).map((k) => <option key={k} value={k}>{KIND[k]}</option>)}</select></td>
                <td className="r"><NumInput width={80} step={0.5} value={c.defaultTarget} onChange={(v) => setC(c.id, { defaultTarget: v })} /></td>
                <td className="r"><NumInput width={70} value={c.defaultMaxWeek} onChange={(v) => setC(c.id, { defaultMaxWeek: v })} /></td>
                <td className="r">{c.kind === 'werkstudent' ? <NumInput width={70} value={c.weekHoursTerm ?? 20} onChange={(v) => setC(c.id, { weekHoursTerm: v })} /> : <span className="faint">—</span>}</td>
                <td className="r">{c.kind === 'werkstudent' ? <NumInput width={70} value={c.weekHoursBreak ?? 40} onChange={(v) => setC(c.id, { weekHoursBreak: v })} /> : <span className="faint">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
        <div style={{ marginTop: 14 }}>
          <div className="strong" style={{ marginBottom: 8 }}>Semesterferien (Werkstudenten dürfen mehr arbeiten) <Pill>Bitte Daten prüfen</Pill></div>
          {hr.semesterBreaks.map((b, i) => (
            <div key={i} className="row" style={{ marginBottom: 6 }}>
              <input type="date" className="input" value={b.from} onChange={(e) => actions.updateHr({ semesterBreaks: hr.semesterBreaks.map((x, k) => (k === i ? { ...x, from: e.target.value } : x)) })} /><span className="muted">bis</span>
              <input type="date" className="input" value={b.to} onChange={(e) => actions.updateHr({ semesterBreaks: hr.semesterBreaks.map((x, k) => (k === i ? { ...x, to: e.target.value } : x)) })} />
              <Btn size="sm" kind="danger" onClick={() => actions.updateHr({ semesterBreaks: hr.semesterBreaks.filter((_, k) => k !== i) })}>Löschen</Btn>
            </div>
          ))}
          <Btn size="sm" onClick={() => actions.updateHr({ semesterBreaks: [...hr.semesterBreaks, { from: '', to: '' }] })}>Zeitraum hinzufügen</Btn>
        </div>
      </Card>
    </div>
  )
}

function RulesTab() {
  const db = useDb()
  const hr = db.settings.hr
  const u = hr.under18
  const row = (label: string, hint: string, v: number, onChange: (n: number) => void, unit = 'Std.', step = 0.5) => (
    <div className="row between" style={{ padding: '12px 0', borderTop: '1px solid var(--grid)' }}>
      <div><div className="strong">{label}</div><div className="small muted">{hint}</div></div>
      <div className="row"><NumInput value={v} step={step} onChange={onChange} /><span className="muted" style={{ width: 40 }}>{unit}</span></div>
    </div>
  )
  return (
    <div className="grid g2" style={{ alignItems: 'start' }}>
      <Card title="Arbeitszeitregeln (Erwachsene)" i={0}>
        {row('Höchstarbeitszeit pro Tag', 'Demo: 10 Stunden', hr.maxDayHours, (v) => actions.updateHr({ maxDayHours: v }))}
        {row('Ruhezeit zwischen zwei Schichten', 'Demo: mindestens 11 Stunden', hr.restHours, (v) => actions.updateHr({ restHours: v }))}
        {row('Pause 30 Minuten ab', 'Schichtlänge, ab der 30 Minuten Pause abgezogen werden', hr.break30After, (v) => actions.updateHr({ break30After: v }))}
        {row('Pause 45 Minuten ab', 'Demo: ab 9 Stunden', hr.break45After, (v) => actions.updateHr({ break45After: v }))}
        {row('Mindestlänge einer Schicht', 'kürzere Schichten plant das System nicht', hr.minShift, (v) => actions.updateHr({ minShift: Math.max(1, Math.round(v)) }), 'Std.', 1)}
        {row('Höchstlänge einer Schicht', 'längere Zeiträume werden auf mehrere Schichten verteilt', hr.maxShift, (v) => actions.updateHr({ maxShift: Math.max(2, Math.round(v)) }), 'Std.', 1)}
      </Card>
      <Card title="Mitarbeitende unter 18 (strenger)" i={1}>
        {row('Höchstarbeitszeit pro Tag', 'Demo: 8 Stunden', u.maxDayHours, (v) => actions.updateHr({ under18: { ...u, maxDayHours: v } }))}
        {row('Höchstarbeitszeit pro Woche', 'Demo: 40 Stunden', u.maxWeekHours, (v) => actions.updateHr({ under18: { ...u, maxWeekHours: v } }))}
        {row('Ruhezeit', 'Demo: 12 Stunden', u.restHours, (v) => actions.updateHr({ under18: { ...u, restHours: v } }))}
        {row('Späteste Arbeitszeit', 'Uhrzeit, bis zu der eingeplant wird', u.latestEnd, (v) => actions.updateHr({ under18: { ...u, latestEnd: v } }), 'Uhr', 1)}
        {row('Pause 30 Minuten ab', 'Demo: ab 4,5 Stunden', u.break30After, (v) => actions.updateHr({ under18: { ...u, break30After: v } }))}
        {row('Pause 60 Minuten ab', 'Demo: ab 6 Stunden', u.break60After, (v) => actions.updateHr({ under18: { ...u, break60After: v } }))}
      </Card>
    </div>
  )
}
