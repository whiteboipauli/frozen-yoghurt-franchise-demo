import { useEffect, useRef, useState } from 'react'
import { useDb } from '../data/repository'
import { go } from '../lib/router'
import type { Mode } from '../lib/ui-state'
import { alertMem, alertToastText, centralAlerts, storeAlerts, takeRebase, useAlertMemory, type Alert } from '../logic/alerts'
import { Icon } from './icons'
import { Btn, pushToast } from './kit'
import { useTour } from './tour-state'
import { todayISO } from '../lib/date'
import { dayWord, missingWord, range as timeRange, sickGaps, type SickGap } from '../logic/callouts'
import { GapDialog } from '../pages/GapDialog'

/** Aktuelle Alarme (ohne weggeklickte) */
export function useAlerts(mode: Mode, storeId: string): Alert[] {
  const db = useDb()
  useAlertMemory()
  const list = mode === 'filiale' ? storeAlerts(db, storeId) : centralAlerts(db)
  return list.filter((a) => !alertMem.isDismissed(a.key))
}

const alertBtn = (a: Alert) => (a.to.includes('/ware') ? 'Zum Bestellen' : a.to.includes('/team') ? 'Zum Team' : a.to.includes('inventur') ? 'Zur Inventur' : a.to.includes('fall') ? 'Meldung öffnen' : a.to.includes('/hq/') || a.to.includes('kommunikation') ? 'Zur Pinnwand' : 'Ansehen')
export function alertToast(a: Alert) {
  return pushToast(alertToastText(a), { tone: a.level === 'red' ? 'bad' : 'warn', ttl: 15000, action: { label: alertBtn(a), onClick: () => go(a.to) } })
}

/** Pop-ups (höchstens einmal pro Alarm und Tag), kritischer Hinweis beim Öffnen */
export function AlertWatcher({ mode, storeId }: { mode: Mode; storeId: string }) {
  const db = useDb()
  const tour = useTour()
  const prev = useRef<Set<string> | null>(null)
  const ctx = useRef('')
  const [critical, setCritical] = useState<Alert | null>(null)
  const shown = useRef(false)
  const announced = useRef<Set<string>>(new Set())
  const [sickPop, setSickPop] = useState<SickGap | null>(null)
  const [gapOpen, setGapOpen] = useState<SickGap | null>(null)

  useEffect(() => {
    const list = mode === 'filiale' ? storeAlerts(db, storeId) : centralAlerts(db)
    const cur = new Set(list.map((a) => a.key))
    const c = mode + storeId
    if (prev.current === null || ctx.current !== c || takeRebase()) {
      prev.current = cur
      ctx.current = c
      return
    }
    if (tour.active && mode === 'zentrale') { prev.current = cur; return }
    for (const a of list) {
      if (!prev.current.has(a.key) && !alertMem.wasFired(a.key) && !alertMem.isDismissed(a.key)) {
        alertMem.markFired(a.key)
        alertToast(a)
      }
    }
    prev.current = cur
  }, [db, mode, storeId])

  // Kritischer Hinweis beim Öffnen der App
  useEffect(() => {
    if (shown.current || tour.welcome || tour.active || mode !== 'filiale') return
    shown.current = true
    const reds = storeAlerts(db, storeId).filter((a) => a.level === 'red' && a.articleId && !alertMem.isDismissed(a.key))
    if (reds.length) {
      setCritical(reds[0])
    }
  }, [tour.welcome, tour.active, mode, db, storeId])

  // Krankmeldung: Pop-up für jede neu entstandene Lücke (nach der Anmeldung bzw. sofort, wenn man selbst eine Krankmeldung einträgt)
  useEffect(() => {
    if (tour.welcome || tour.active || mode !== 'filiale') return
    const fresh = sickGaps(db, storeId, todayISO()).filter((k) => !announced.current.has(k.key))
    fresh.forEach((k) => announced.current.add(k.key))
    if (fresh.length) setSickPop(fresh[0])
  }, [db, storeId, mode, tour.welcome, tour.active])
  const sickNow = sickPop && sickGaps(db, storeId, todayISO()).some((k) => k.key === sickPop.key)

  const sickUi = (
    <>
      {sickPop && sickNow && !tour.active && mode === 'filiale' && (
        <div className="glass critical sick-pop" role="alert">
          <span className="ci"><Icon name="person-ausfall" size={28} /></span>
          <div>
            <b>Krankmeldung: {sickPop.empName} hat sich krank gemeldet – Lücke {dayWord(sickPop.date)} {timeRange(sickPop.gap.from, sickPop.gap.to).replace(' Uhr', '')} Uhr</b>
            <p>Es {sickPop.gap.missing === 1 ? 'fehlt' : 'fehlen'} {missingWord(sickPop.gap.missing)}.</p>
          </div>
          <Btn kind="primary" onClick={() => { setGapOpen(sickPop); setSickPop(null) }}>Lücke schließen</Btn>
          <Btn onClick={() => setSickPop(null)}>Später</Btn>
        </div>
      )}
      {gapOpen && <GapDialog key={gapOpen.key} storeId={storeId} date={gapOpen.date} gap={gapOpen.gap} onClose={() => setGapOpen(null)} />}
    </>
  )
  if (!critical || tour.active || mode !== 'filiale') return sickUi
  const n = storeAlerts(db, storeId).filter((a) => a.level === 'red' && a.articleId).length
  return (
    <>
    <div className="glass critical" role="alert">
      <span className="ci"><Icon name="warn" size={28} /></span>
      <div>
        <b>{n > 1 ? `${n} Artikel sind kritisch` : `${critical.title.split(':')[0].split(' reicht')[0]} ist kritisch`}</b>
        <p>Die Ware ist wahrscheinlich leer, bevor eine neue Lieferung ankommen kann. Bitte jetzt bestellen.</p>
      </div>
      <Btn kind="primary" onClick={() => { setCritical(null); go('/filiale/ware/artikel') }}>Zum Bestellen</Btn>
      <button className="toast-x" aria-label="Schließen" onClick={() => setCritical(null)}><Icon name="x" size={16} /></button>
    </div>
    {sickUi}
    </>
  )
}

export function NotificationPanel({ mode, storeId, onClose }: { mode: Mode; storeId: string; onClose: () => void }) {
  const list = useAlerts(mode, storeId)
  return (
    <div className="glass panel" role="dialog" aria-label="Benachrichtigungen">
      <div className="row between"><h2>Benachrichtigungen</h2><button className="toast-x" aria-label="Schließen" onClick={onClose}><Icon name="x" size={18} /></button></div>
      {list.length === 0 && <div className="empty"><span><Icon name="check" size={38} stroke={1.5} /></span>Keine offenen Hinweise.</div>}
      {list.map((a) => (
        <div key={a.key} className={`alert-row ${a.level}`}>
          <i />
          <div style={{ flex: 1 }}>
            <b>{a.title}</b>
            <p>{a.text}</p>
            <div className="row" style={{ gap: 8 }}>
              <Btn kind="primary" size="sm" onClick={() => { onClose(); go(a.to) }}>{alertBtn(a)}</Btn>
              <Btn kind="ghost" size="sm" onClick={() => alertMem.dismiss(a.key)}>Wegklicken</Btn>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
