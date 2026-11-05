import { actions, useDb } from '../data/repository'
import { addDays, todayISO, WEEKDAYS, weekdayIdx } from '../lib/date'
import { fmtDayMonth } from '../lib/format'
import { planUi, usePlanUi, type PlanView } from '../lib/plan-ui'
import { download, exportScheduleCsv } from '../logic/adapters'
import { validateShifts } from '../logic/hr'
import { planLines, type DayLine } from '../logic/staffplan'
import { staffDay } from '../logic/staffing'
import { useWeatherStatus, wxKind } from '../logic/weather'
import { Icon } from '../icons'
import { Btn, Card, Info, NumInput, PageHead, Segmented, useToast } from '../ui/kit'
import { AvailabilityMatrix } from './Availability'
import { PlanCalendar } from './PlanCalendar'
import { PrintSchedule } from './Schedule'

/** Dienstplan: Kalender (Standard), 14-Tage-Statuszeilen und Verfügbarkeiten */
export function PlanPage({ storeId }: { storeId: string }) {
  const db = useDb()
  useWeatherStatus()
  const toast = useToast()
  const today = todayISO()
  const st = db.stores.find((s) => s.id === storeId)!
  const { view } = usePlanUi()
  const lines = planLines(db, storeId, 14, today)
  const problems = lines.filter((l) => l.state === 'gap').length
  const hasPlan = db.shifts.some((s) => s.storeId === storeId && s.date >= today)
  const viol = validateShifts(db, storeId, today, addDays(today, 13))

  return (
    <>
      <PageHead title="Dienstplan" hint="Wie im Kalender: Spalten sind die Tage, Zeilen die Uhrzeiten. Rote Blöcke zeigen, wo jemand fehlt – ein Klick darauf schlägt passende Leute vor."
        right={<div className="row wrap no-print">
          <Btn kind="glass" size="sm" icon="download" onClick={() => { download(`dienstplan-${storeId}-${today}.csv`, exportScheduleCsv(db, storeId, today, addDays(today, 13))); toast('Dienstplan als CSV exportiert') }}>CSV</Btn>
          <Btn kind="glass" size="sm" icon="print" onClick={() => window.print()}>Drucken</Btn>
          <Btn kind="primary" size="sm" icon="calendar" data-tour="make-plan" onClick={() => { actions.generateSchedule(storeId, today, 14); toast(hasPlan ? 'Dienstplan automatisch neu erstellt – gesperrte Schichten bleiben' : 'Dienstplan für die nächsten 14 Tage erstellt') }}>Automatisch erstellen</Btn>
        </div>} />
      <div className="stack screen-only">
        <div className="row between wrap">
          <Segmented<PlanView> value={view} onChange={(v) => planUi.setView(v)} options={[{ value: 'kalender', label: 'Kalender', icon: 'calendar' }, { value: 'tage', label: '14 Tage', icon: 'list' }, { value: 'matrix', label: 'Verfügbarkeiten', icon: 'clock' }]} />
          <span className={`pill ${problems ? 'red' : 'green'}`}>{problems ? `${problems} Tag${problems > 1 ? 'e' : ''} mit Lücke in 14 Tagen` : 'In den nächsten 14 Tagen ist alles besetzt'}</span>
        </div>

        {viol.length > 0 && (
          <div className="note warn" role="alert">
            <Icon name="warn" />
            <div>{viol.slice(0, 4).map((v, i) => <div key={i}><b>Regel verletzt:</b> {v.text} ({fmtDayMonth(v.date)})</div>)}</div>
          </div>
        )}

        {view === 'kalender' && <PlanCalendar storeId={storeId} />}
        {view === 'tage' && (
          <Card i={0} tour="staff-days" className="pl-card">
            {lines.map((l) => <PlanRow key={l.date} line={l} storeId={storeId} />)}
          </Card>
        )}
        {view === 'matrix' && <AvailabilityMatrix storeId={storeId} />}

        <details className="how glass">
          <summary><Icon name="info" size={16} />Wie rechnet das System?</summary>
          <div className="how-body">
            <p>Für jeden Tag schätzt das System, wie viele Becher pro Stunde verkauft werden – aus dem Vorjahr, den letzten Wochen, Wetter, Feiertagen und Ferien. Daraus ergibt sich, wie viele Leute pro Stunde gebraucht werden: erwartete Becher ÷ Becher pro Mitarbeiter-Stunde, aufgerundet, mindestens die Mindestbesetzung.<Info text="Ähnliche Tage: gleicher Tagestyp, Temperatur ±2 °C, Regen, Sonnenstunden, Jahreszeit und Ferien – dazu ein Trendfaktor (letzte 8 Wochen gegenüber Vorjahr)." /></p>
            <div className="row wrap" style={{ gap: 28 }}>
              <div className="field"><label>Becher pro Mitarbeiter-Stunde</label><NumInput width={90} min={5} value={st.cupsPerStaffHour} onChange={(v) => actions.updateStore(storeId, { cupsPerStaffHour: Math.max(5, v) })} /></div>
              <div className="field"><label>Mindestbesetzung</label><NumInput width={90} min={1} value={st.minStaff} onChange={(v) => actions.updateStore(storeId, { minStaff: Math.max(1, Math.round(v)) })} /></div>
            </div>
            <p className="faint small">Demo-Werte, jederzeit änderbar. Datengrundlage: Demo-Umsatzhistorie der letzten 13 Monate (später aus der Kasse helloTESS! über die Zentrale). Wetter: Open-Meteo.</p>
          </div>
        </details>
      </div>
      <PrintSchedule storeId={storeId} />
    </>
  )
}

/** Statuszeile eines Tages – ein Klick springt zu diesem Tag im Kalender */
function PlanRow({ line, storeId }: { line: DayLine; storeId: string }) {
  const db = useDb()
  const today = todayISO()
  const sd = staffDay(db, storeId, line.date, today)
  const k = sd.wx ? wxKind(sd.wx) : null
  const wd = weekdayIdx(line.date)
  const ico = line.state === 'gap' ? 'warn' : line.state === 'over' ? 'plus' : 'check'
  return (
    <div className={`pl ${line.state}`} data-day={line.date}>
      <button className="pl-row" onClick={() => planUi.openDay(line.date)}>
        <span className="pl-day"><b>{line.date === today ? 'Heute' : WEEKDAYS[wd].slice(0, 2)}</b><span>{fmtDayMonth(line.date)}</span></span>
        <span className="pl-wx" title={k?.label ?? 'kein Wetter bekannt'}><Icon name={k?.icon ?? 'wx-none'} size={26} stroke={1.6} /><small>{sd.wx ? `${Math.round(sd.wx.tmax)} °C` : '–'}</small></span>
        <span className={`pl-st ${line.state}`}><i><Icon name={ico} size={15} stroke={2.8} /></i><b>{line.text}</b></span>
        <span className="pl-tags">{sd.holiday && <span className="tag dark">{sd.holiday}</span>}{sd.ferien && !sd.holiday && <span className="tag">Schulferien</span>}{wd >= 5 && <span className="tag">Wochenende</span>}</span>
        <span className="pl-go">Im Kalender<Icon name="arrow" size={15} /></span>
      </button>
    </div>
  )
}
