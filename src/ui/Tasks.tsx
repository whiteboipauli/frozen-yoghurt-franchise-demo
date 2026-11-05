import type { ReactNode } from 'react'
import type { IconName } from '../icons'
import { Icon } from '../icons'
import { CountChip, Forecast, IconTile, Signal, TimeChip, type Level } from './signal'

export interface TaskLike {
  key: string
  level: Level
  group: 'jetzt' | 'woche' | 'spaeter'
  icon: IconName
  title: string
  text: string
  btn: string
  time?: { text: string; level?: Level; progress?: number }
}
export interface WarnLike { key: string; level: Level; trend: 'ab' | 'auf'; icon?: IconName; text: string; when: string }

const GROUPS: { id: TaskLike['group']; label: string; level: Level; icon: IconName }[] = [
  { id: 'jetzt', label: 'Jetzt', level: 'rot', icon: 'alarm' },
  { id: 'woche', label: 'Diese Woche', level: 'bernstein', icon: 'kalender' },
  { id: 'spaeter', label: 'Später', level: 'info', icon: 'uhr' },
]

/** „n Dinge zu tun“: großes Abzeichen der schlimmsten Stufe, drei Zähler, Gruppen Jetzt / Diese Woche / Später, Vorausschau */
export function TasksCard<T extends TaskLike>({ title, tasks, level, counts, warnings = [], onOpen, onWarn, emptyText, tour, children }: {
  title: (n: number) => string
  tasks: T[]
  level: Level
  counts: { rot: number; bernstein: number; normal: number }
  warnings?: WarnLike[]
  onOpen: (t: T) => void
  onWarn?: (w: WarnLike) => void
  emptyText: string
  tour?: string
  children?: ReactNode
}) {
  return (
    <section className="glass card in tasks-card" data-tour={tour}>
      <div className="tasks-head">
        <Signal level={level} size={44} pulse />
        <div className="tasks-head-text">
          <h2>{tasks.length === 0 ? 'Alles erledigt' : title(tasks.length)}</h2>
          <div className="tasks-counts">
            <CountChip level="rot" n={counts.rot} word="dringend" />
            <CountChip level="bernstein" n={counts.bernstein} word="bald" />
            <CountChip level="info" n={counts.normal} word="normal" />
          </div>
        </div>
      </div>
      {tasks.length === 0 && <p className="tasks-empty"><Signal level="gruen" size={22} /> {emptyText}</p>}
      {GROUPS.map((g) => {
        const list = tasks.filter((t) => t.group === g.id)
        if (!list.length) return null
        return (
          <div key={g.id} className="task-group">
            <div className="task-group-head"><Icon name={g.icon} size={16} />{g.label}</div>
            {list.map((t) => (
              <div key={t.key} className={`task-row tint-${t.level}`} role="button" tabIndex={0} data-task={t.key} onClick={() => onOpen(t)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen(t))}>
                <IconTile icon={t.icon} level={t.level} />
                <div className="task-main"><b title={t.title}>{t.title}</b><span title={t.text}>{t.text}</span></div>
                {t.time && <TimeChip level={t.time.level} progress={t.time.progress}>{t.time.text}</TimeChip>}
                <span className="task-go" aria-hidden><Icon name="arrow" size={18} /></span>
              </div>
            ))}
          </div>
        )
      })}
      {warnings.length > 0 && (
        <div className="task-group">
          <div className="task-group-head"><Icon name="trend-ab" size={16} />Vorausschau: hier wird es eng</div>
          <div className="warn-list">
            {warnings.map((w) => (
              <div key={w.key} className="warn-wrap" role="button" tabIndex={0} onClick={() => onWarn?.(w)} onKeyDown={(e) => e.key === 'Enter' && onWarn?.(w)}>
                <Forecast level={w.level} trend={w.trend} icon={w.icon} when={w.when}>{w.text}</Forecast>
              </div>
            ))}
          </div>
        </div>
      )}
      {children}
    </section>
  )
}
