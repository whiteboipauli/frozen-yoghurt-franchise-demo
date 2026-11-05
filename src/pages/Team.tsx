import { addDays, todayISO } from '../lib/date'
import { useWeatherStatus } from '../logic/weather'
import { validateShifts } from '../logic/hr'
import { fmtDayMonth } from '../lib/format'
import { Icon } from '../icons'
import { useDb } from '../data/repository'
import { EmbedCtx, PageHead } from '../ui/kit'
import { PlanPage } from './PlanGrid'
import { PrintSchedule } from './Schedule'
import { EmployeesPage } from './Employees'

/** Team: Dienstplan-Kalender und Mitarbeitende auf einer Seite */
export type TeamTab = 'dienstplan' | 'mitarbeitende'
export function TeamPage({ storeId, tab }: { storeId: string; tab: TeamTab }) {
  const db = useDb()
  useWeatherStatus()
  const today = todayISO()
  const viol = validateShifts(db, storeId, today, addDays(today, 13))
  return (
    <>
      <PageHead title={tab === 'dienstplan' ? 'Dienstplan' : 'Mitarbeitende'} hint={tab === 'dienstplan' ? 'Wer arbeitet wann – rote Lücken schließt du mit einem Klick.' : 'Dein Team mit Verfügbarkeit und Verdienst.'} />
      <div className="stack n-stack screen-only">
        {tab === 'dienstplan' && <PlanPage storeId={storeId} />}
        {tab === 'mitarbeitende' && <EmbedCtx.Provider value><EmployeesPage storeId={storeId} /></EmbedCtx.Provider>}
      </div>
      <PrintSchedule storeId={storeId} />
    </>
  )
}
