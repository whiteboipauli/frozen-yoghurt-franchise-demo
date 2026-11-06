import { useMemo, useState } from 'react'
import { useDb } from '../data/repository'
import { go } from '../lib/router'
import { planUi } from '../lib/plan-ui'
import { todayISO, WEEKDAYS_SHORT, weekdayIdx, WEEKDAYS } from '../lib/date'
import { fmt0, fmtDayMonth, fmtEUR } from '../lib/format'
import { dayWxIcon, forecastSoFar, salesToday, todayTips, weekOverview } from '../logic/today'
import { storeSignals, type SigTask } from '../logic/signals'
import { absentOn } from '../logic/callouts'
import { useWeatherStatus, wxKind } from '../logic/weather'
import { expectedCups, holidayOn, wxOn } from '../logic/forecast'
import { hourlyOf, openHours, schoolHolidayOn, storeOf } from '../logic/history'
import { staffDay, dayStaffing } from '../logic/staffing'
import { Icon } from '../icons'
import { ArticleModal } from '../ui/ArticleModal'
import { Btn, Card, CountUp } from '../ui/kit'
import { IconTile, LegendLink, Signal, SignalChip, type Level } from '../ui/signal'
import { TasksCard } from '../ui/Tasks'
import { AbsenceCard, ReplaceDialog } from './Absence'

/** Linie „Tagesverlauf“: durchgezogen = bisher, gestrichelt = Prognose, Punkt = jetzt */
function SalesChart({ actual, forecast, nowIdx, labels }: { actual: number[]; forecast: number[]; nowIdx: number; labels: string[] }) {
  const W = 520, H = 150, pl = 8, pr = 8, pt = 14, pb = 22
  const max = Math.max(1, ...forecast, ...actual)
  const x = (i: number) => pl + (i * (W - pl - pr)) / Math.max(1, forecast.length - 1)
  const y = (v: number) => pt + (1 - v / max) * (H - pt - pb)
  const line = (arr: number[], from = 0) => arr.map((v, i) => `${i + from === from ? 'M' : 'L'}${x(i + from).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const act = actual.slice(0, nowIdx + 1)
  return (
    <svg className="sales-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Verlauf der Becher heute: bisher und Prognose">
      {[0, 0.5, 1].map((f) => <line key={f} x1={pl} x2={W - pr} y1={y(max * f)} y2={y(max * f)} stroke="var(--grid)" strokeWidth="1" />)}
      <path d={line(forecast)} fill="none" stroke="var(--ink-3)" strokeWidth="2.2" strokeDasharray="6 6" strokeLinecap="round" />
      <path d={line(act)} fill="none" stroke="var(--wine)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {nowIdx >= 0 && <circle cx={x(nowIdx)} cy={y(actual[nowIdx])} r="6" fill="var(--wine)" stroke="#fff" strokeWidth="3" />}
      {labels.map((l, i) => (i % 2 === 0 ? <text key={i} x={x(i)} y={H - 4} textAnchor="middle" fontSize="11" fill="var(--ink-3)">{l}</text> : null))}
    </svg>
  )
}

/** Heute: eine Frage – was ist heute zu tun? */
export function Heute({ storeId }: { storeId: string }) {
  const db = useDb()
  useWeatherStatus()
  const today = todayISO()
  const [openArt, setOpenArt] = useState<string | null>(null)
  const [callout, setCallout] = useState<string | null>(null)
  const store = storeOf(db, storeId)
  const sig = useMemo(() => storeSignals(db, storeId, today), [db, storeId, today])
  const sales = useMemo(() => salesToday(db, storeId, today), [db, storeId, today])
  const tips = useMemo(() => todayTips(db, storeId, today), [db, storeId, today])
  const week = useMemo(() => weekOverview(db, storeId, today), [db, storeId, today])
  const sd = useMemo(() => staffDay(db, storeId, today, today), [db, storeId, today])
  const hours = useMemo(() => hourlyOf(db, storeId, today), [db, storeId, today])
  const w = wxOn(db, storeId, today)
  const jumpDay = (d: string) => { planUi.openDay(d); go('/filiale/team/dienstplan') }
  const open = (t: SigTask) => (t.modal ? setCallout(t.modal.replace('callout:', '')) : t.day ? jumpDay(t.day) : go(`/filiale/${t.to}`))

  // Verlauf: bisher (nach Stundengewicht verteilt) und Prognose
  const { open: oh, close: ch } = openHours(store, today)
  const nowH = new Date().getHours()
  const hrs = Array.from({ length: Math.max(1, ch - oh) }, (_, i) => oh + i)
  const clockIdx = Math.min(hrs.length - 1, Math.max(0, nowH - oh))
  const fcCum = hrs.reduce<number[]>((a, h) => { const c = sd.hours.find((x) => x.hour === h)?.cups ?? 0; a.push((a[a.length - 1] ?? 0) + c); return a }, [])
  const wCum = hrs.reduce<number[]>((a, h) => { a.push((a[a.length - 1] ?? 0) + (hours.find((x) => x.hour === h)?.cups ?? 0)); return a }, [])
  const nowIdx = clockIdx
  const base = wCum[nowIdx] || 1
  const actualCum = wCum.map((c) => (sales.cups * c) / base)
  const fcNow = forecastSoFar(db, storeId, today)
  const pct = fcNow > 0 && sales.cups > 0 ? Math.round((sales.cups / fcNow - 1) * 100) : null
  const avg = sales.cups ? sales.revenue / sales.cups : 0

  // Statuszeilen
  const absent = sig.tasks.find((t) => t.kind === 'absence' && t.level === 'rot')
  const gapT = sig.tasks.find((t) => t.kind === 'gaps')
  const orderT = sig.tasks.find((t) => t.kind === 'order')
  const rows: { icon: 'person' | 'kalender' | 'paket'; level: Level; text: string; go: () => void }[] = [
    { icon: 'person', level: absent ? 'rot' : 'gruen', text: absent ? absent.title : 'Alle sind da', go: () => { planUi.openTagToday(); go('/filiale/team/dienstplan') } },
    { icon: 'kalender', level: gapT ? gapT.level : 'gruen', text: gapT ? `${gapT.n === 1 ? '1 Lücke' : `${gapT.n} Lücken`} in den nächsten 7 Tagen` : 'Dienstplan besetzt', go: () => { planUi.setWeek(0); go('/filiale/team/dienstplan') } },
    { icon: 'paket', level: orderT ? orderT.level : 'gruen', text: orderT ? orderT.title : 'Alles ausreichend da', go: () => go('/filiale/ware/artikel') },
  ]
  const maxCups = Math.max(1, ...week.map((d) => d.cups))
  const meanCups = week.reduce((n, d) => n + d.cups, 0) / Math.max(1, week.length)
  const now = new Date()
  const dateTxt = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now)

  return (
    <>
      <div className="page-head">
        <div>
          <div className="cap">{dateTxt}</div>
          <h1>Heute in {store.name.replace('Frozen Yoghurt ', '')}</h1>
          <LegendLink />
        </div>
        <div className="page-head-right">
          {w && <span className="wx-chip" title="Wetter von Open-Meteo"><Icon name={wxKind(w).icon} size={22} /><b>{Math.round(w.tmax)} °C</b><span>{wxKind(w).label}</span></span>}
        </div>
      </div>

      <div className="stack n-stack">
        <AbsenceCard storeId={storeId} onOpen={setCallout} />

        <div className="n-top">
          <section className="glass card in n-status" data-tour="status">
            <div className="cap">Heute</div>
            <button className="big-count" onClick={() => document.querySelector('[data-tour=todo]')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} aria-label="Zur Liste der Aufgaben">
              <Signal level={sig.level} size={56} pulse />
              <div><b><CountUp value={sig.tasks.length} /></b><span>{sig.tasks.length === 1 ? 'Ding zu tun' : 'Dinge zu tun'}</span></div>
              <Icon name="arrow" size={18} />
            </button>
            <div className="status-rows">
              {rows.map((r) => (
                <button key={r.icon} className={`status-row clickable tint-${r.level}`} onClick={r.go}><IconTile icon={r.icon} level={r.level} tile={36} size={20} /><span>{r.text}</span><Icon name="arrow" size={16} /></button>
              ))}
            </div>
          </section>
          <section className="glass card in n-sales" data-tour="sales">
            <div className="between row"><div className="cap">Verkäufe heute</div>
              {pct !== null && <SignalChip level={pct >= 0 ? 'gruen' : 'bernstein'}>{`${Math.abs(pct)} % ${pct >= 0 ? 'über' : 'unter'} Prognose bis jetzt`}</SignalChip>}
            </div>
            <div className="n-sales-main"><b><CountUp value={sales.revenue} format={(n) => fmtEUR(n)} /></b>
              {pct !== null && <Icon name={pct >= 0 ? 'trend-auf' : 'trend-ab'} size={24} />}</div>
            <div className="sales-facts"><span><Icon name="becher" size={16} /><b>{fmt0(sales.cups)}</b> Becher</span><span><Icon name="euro" size={16} />Ø <b>{fmtEUR(avg)}</b> pro Becher</span></div>
            <SalesChart actual={actualCum} forecast={fcCum} nowIdx={nowIdx} labels={hrs.map((h) => `${h}`)} />
            <div className="chart-legend"><span><i className="ln solid" />bisher</span><span><i className="ln dashed" />Prognose</span><span><i className="dot-now" />jetzt</span></div>
          </section>
        </div>

        <TasksCard tour="todo" title={(n) => (n === 1 ? '1 Ding zu tun' : `${n} Dinge zu tun`)} tasks={sig.tasks} level={sig.level} counts={sig.counts} warnings={sig.warnings}
          onOpen={open} onWarn={(wn) => { const x = sig.warnings.find((q) => q.key === wn.key)!; x.day ? jumpDay(x.day) : go(`/filiale/${x.to}`) }} emptyText="Nichts offen. Schönen Tag! Nächster Schritt: Bestand prüfen oder Verkäufe ansehen." />

        <Card title="Diese Woche" tour="week" i={4}>
          <div className="n-week">
            {week.map((d) => {
              const ww = wxOn(db, storeId, d.date)
              const hol = holidayOn(db, storeId, d.date)
              const fer = !!schoolHolidayOn(db, storeId, d.date)
              const who = absentOn(db, storeId, d.date)
              const gap = dayStaffing(db, storeId, d.date, today).gaps[0]
              const staff = who ? { l: 'rot' as Level, t: `Ausfall: ${who}`, i: 'person-ausfall' as const } : gap ? { l: 'rot' as Level, t: `Lücke ${gap.from}–${gap.to}`, i: 'person-plus' as const } : { l: 'gruen' as Level, t: 'Team ok', i: 'haken-kreis' as const }
              return (
                <button key={d.date} className={`n-day tint-${staff.l} ${d.date === today ? 'is-today' : ''}`} onClick={() => jumpDay(d.date)} aria-label={`${WEEKDAYS[weekdayIdx(d.date)]} ${fmtDayMonth(d.date)}: ${staff.t}`}>
                  <b>{d.date === today ? 'Heute' : WEEKDAYS_SHORT[weekdayIdx(d.date)]}</b>
                  <span className="faint small">{fmtDayMonth(d.date)}{(hol || fer) && <Icon name="kalender-warnung" size={14} />}</span>
                  <Icon name={dayWxIcon(ww, d.cups, meanCups)} size={26} stroke={1.6} />
                  <span className="n-cups"><Icon name="becher" size={15} />{fmt0(d.cups)}<small> Becher</small></span>
                  <span className="cup-bar"><i style={{ width: `${(d.cups / maxCups) * 100}%` }} /></span>
                  <span className={`n-staff tone-${staff.l}`}><Signal level={staff.l} size={18} variant={undefined} /><span>{staff.t}</span></span>
                  {hol && <span className="day-note" title={hol.name}>{hol.name}</span>}
                </button>
              )
            })}
          </div>
          <p className="faint small" style={{ marginTop: 10 }}><Icon name="becher" size={13} /> Prognose Verkauf in Bechern</p>
        </Card>

        {tips.length > 0 && (
          <Card title="Tipps für dich" tour="tips" i={5}>
            <div className="n-list">
              {tips.map((t) => (
                <div className="task-row" key={t.key}>
                  <IconTile icon={t.icon} level="info" />
                  <div className="task-main"><span>{t.text}</span></div>
                  <Btn kind="glass" size="sm" onClick={() => (t.articleId ? setOpenArt(t.articleId) : t.planDay ? jumpDay(t.planDay) : go(t.to ?? '/filiale/heute'))}>{t.btn}</Btn>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
      {openArt && <ArticleModal storeId={storeId} articleId={openArt} onClose={() => setOpenArt(null)} />}
      {callout && <ReplaceDialog calloutId={callout} onClose={() => setCallout(null)} />}
      <span hidden>{expectedCups.length}</span>
    </>
  )
}
