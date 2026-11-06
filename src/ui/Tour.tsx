import { useEffect, useRef, useState } from 'react'
import { actions, getDb, useDb } from '../data/repository'
import type { Db } from '../data/types'
import { go } from '../lib/router'
import { cart } from '../lib/cart'
import { TOUR_STORE, DEMO_STORE_2 } from '../data/stores'
import { manualList } from '../lib/manual-list'
import { planUi } from '../lib/plan-ui'
import { saleDraft, useSaleDraft, type SaleDraft } from '../lib/sale-draft'
import { getUi, setUi, type Session } from '../lib/ui-state'
import { addDays, todayISO } from '../lib/date'
import { portionBase } from '../logic/consumption'
import { alertMem, requestRebase, storeAlerts } from '../logic/alerts'
import { orderList } from '../logic/orderlist'
import { stockNow } from '../logic/stock'
import { alertToast } from './AlertCenter'
import { Btn } from './kit'
import { dismissToast, pushToast } from './kit'
import { tourState, useTour } from './tour-state'
import { Icon } from './icons'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const q = (n: string) => `[data-tour="${n}"]`

interface Ctx { db: Db; draft: SaleDraft }
type Role = 'store' | 'hq'
interface Step {
  route: string
  role: Role
  targets: (c: Ctx) => string[]
  fallback?: string[]
  title: string
  text: (c: Ctx) => string
  need?: (c: Ctx) => string | null
  canNext?: (c: Ctx) => boolean
  auto?: { label: string; run: () => Promise<void>; always?: boolean }
  enter?: () => void
  leave?: () => void
}

let snapshot: Db | null = null
let prevUi: { session: Session; route: string } | null = null
let mangoBase = 0
let alarmToast: number | null = null

const mangoToday = (db: Db) => db.saleDays.find((d) => d.storeId === TOUR_STORE && d.date === todayISO())?.toppings['mango'] ?? 0
const mangoPortions = () => {
  const db = getDb()
  const a = db.articles.find((x) => x.id === 'mango')!
  return Math.round(Math.max(0, stockNow(db, TOUR_STORE, 'mango')) / portionBase(a))
}
const tourOrder = (db: Db) => db.centralOrders.find((o) => o.storeId === TOUR_STORE && o.createdOn === todayISO())
const cartFilled = () => Object.keys(cart.get().lines).length > 0
const tourInvoice = (db: Db) => { const o = tourOrder(db); return o?.invoiceId ? db.invoices.find((i) => i.id === o.invoiceId) : undefined }

export function startTour(role: Role = 'store') {
  const u = getUi()
  prevUi = { session: u.session, route: window.location.hash.replace(/^#/, '') || '/' }
  requestRebase()
  alertMem.reset()
  saleDraft.reset()
  cart.reset()
  manualList.reset()
  planUi.setView('kalender')
  planUi.setWeek(0)
  if (role === 'store') {
    snapshot = actions.tourBegin()
    mangoBase = mangoToday(getDb())
    setUi({ session: { role: 'store', storeId: TOUR_STORE } })
    go('/filiale/heute')
  } else {
    snapshot = null
    go('/zentrale/cockpit')
  }
  window.scrollTo(0, 0)
  tourState.set({ active: true, welcome: false, role, step: 0, final: false, mangoBefore: null, mangoAfter: null })
}

export function endTour() {
  if (alarmToast) dismissToast(alarmToast)
  alarmToast = null
  planUi.setView('kalender')
  planUi.setWeek(0)
  if (snapshot) {
    requestRebase()
    actions.tourRestore(snapshot)
    snapshot = null
  }
  alertMem.reset()
  saleDraft.reset()
  cart.reset()
  manualList.reset()
  if (prevUi) {
    setUi({ session: prevUi.session })
    go(prevUi.session?.role === 'hq' ? '/zentrale/cockpit' : prevUi.session ? '/filiale/heute' : '/')
  }
  tourState.set({ active: false, step: 0, final: false, mangoBefore: null, mangoAfter: null })
}

const ST = 'store' as const
const HQ = 'hq' as const
const STORE_STEPS: Step[] = [
  { route: '/filiale/heute', role: ST, targets: () => [q('status'), q('sales'), q('todo')], title: 'Heute', text: () => 'Hier siehst du auf einen Blick, was zu tun ist. Rot ist dringend, gelb bald, grün in Ordnung.' },
  { route: '/filiale/heute', role: ST, targets: () => [q('week')], title: 'Diese Woche', text: () => 'Pro Tag siehst du die erwarteten Becher. Rote Tage haben eine Lücke im Dienstplan, ein Klick öffnet sie.' },
  { route: '/filiale/ware/artikel', role: ST, targets: () => [q('art-list')], title: 'Ware & Bestellen', text: () => 'Alle Artikel in einer Liste, das Dringendste steht oben (rot: reicht nur noch 2 Tage). Vorschläge legst du in den Warenkorb.' },
  { route: '/filiale/ware/bestellungen', role: ST, targets: () => [q('my-orders')], title: 'Meine Bestellungen', text: () => 'Jede Bestellung zeigt ihren Status. Nach dem Versand kannst du die Rechnung öffnen.' },
  { route: '/filiale/inventur', role: ST, targets: () => [q('inv-status'), q('inv-form')], title: 'Monatsinventur', text: () => 'Einmal im Monat zählst du die Artikel, ohne Vorgabe. Zwischendurch geht jederzeit eine Zwischenzählung.' },
  { route: '/filiale/team/dienstplan', role: ST, targets: () => [q('week-plan')], fallback: [q('gap-block')], title: 'Dienstplan', text: () => 'Rote Lücken schließt du mit einem Klick auf einen Vorschlag. Auch Krankmeldungen trägst du hier ein.' },
]
const HQ_STEPS: Step[] = [
  { route: '/zentrale/cockpit', role: HQ, targets: () => [q('revcost')], title: 'Umsatz und Kosten', text: () => 'Oben stehen Umsatz und Kostenquoten aller Läden mit Richtwert und Signal.' },
  { route: '/zentrale/cockpit', role: HQ, targets: () => [q('attention')], fallback: [q('kpis')], title: 'Meldungen', text: () => 'Hier landen Meldungen der Läden und automatisch erkannte Auffälligkeiten.' },
  { route: '/zentrale/laeden', role: HQ, targets: () => [q('stores')], title: 'Läden', text: () => 'Alle Läden mit Umsatz, Status und offenen Problemen. Ein Klick öffnet die Kontrollansicht.' },
  { route: `/zentrale/laeden/${DEMO_STORE_2}/meldungen`, role: HQ, targets: () => [q('ctl-tabs')], title: 'Kontrollansicht', text: () => 'Ein Laden mit Warenabgleich, Inventur, Bestellungen und Meldungen.' },
  { route: '/zentrale/warenabgleich', role: HQ, targets: () => [q('checks')], title: 'Warenabgleich', text: () => 'Passt die gezählte Ware zu Lieferung und Verkauf? Auffällige Läden stehen oben.' },
  { route: '/zentrale/katalog', role: HQ, targets: () => [q('catalog')], title: 'Katalog', text: () => 'Hier pflegst du die Artikel, die die Läden beim Headquarter bestellen.' },
]
const stepsOf = (r: Role) => (r === 'hq' ? HQ_STEPS : STORE_STEPS)

interface R { left: number; top: number; right: number; bottom: number }

export function Tour() {
  const tour = useTour()
  const db = useDb()
  const draft = useSaleDraft()
  const [rect, setRect] = useState<R | null>(null)
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 40, top: 100 })
  const [busy, setBusy] = useState(false)
  const bubble = useRef<HTMLDivElement>(null)
  const prevStep = useRef<number | null>(null)
  const scrolled = useRef('')
  const step = tour.step
  const STEPS = stepsOf(tour.role)
  const def = STEPS[step]
  const ctx: Ctx = { db, draft }
  const ctxRef = useRef(ctx)
  ctxRef.current = ctx

  // Seite / Sicht wechseln, Betreten & Verlassen
  useEffect(() => {
    if (!tour.active) { prevStep.current = null; return }
    if (prevStep.current !== null && prevStep.current !== step) STEPS[prevStep.current]?.leave?.()
    prevStep.current = step
    const s = STEPS[step]
    if (!s) return
    { const cur = getUi().session; if (s.role === 'hq' && cur?.role !== 'hq') setUi({ session: { role: 'hq' } }); else if (s.role === 'store' && !(cur?.role === 'store' && cur.storeId === TOUR_STORE)) setUi({ session: { role: 'store', storeId: TOUR_STORE } }) }
    if (window.location.hash.replace(/^#/, '') !== s.route) go(s.route)
    scrolled.current = ''
    window.scrollTo(0, 0)
    s.enter?.()
  }, [tour.active, step])

  useEffect(() => {
    if (!tour.active) return
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') endTour()
      else if (e.key === 'ArrowRight' && !(e.target instanceof HTMLInputElement)) tourState.set({ step: Math.min(stepsOf(tourState.get().role).length, tourState.get().step + 1) })
      else if (e.key === 'ArrowLeft' && !(e.target instanceof HTMLInputElement)) tourState.set({ step: Math.max(0, tourState.get().step - 1) })
    }
    // Kein Wischen oder horizontales Scrollen (Trackpad, Mausrad) zwischen den Schritten
    const w = (e: WheelEvent) => { if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) e.preventDefault() }
    window.addEventListener('keydown', k)
    window.addEventListener('wheel', w, { passive: false })
    return () => { window.removeEventListener('keydown', k); window.removeEventListener('wheel', w) }
  }, [tour.active])

  useEffect(() => {
    if (!tour.active) return
    document.body.classList.add('modal-lock')
    return () => document.body.classList.remove('modal-lock')
  }, [tour.active])

  // Zielelement verfolgen
  useEffect(() => {
    if (!tour.active || !def) { setRect(null); return }
    let raf = 0
    const tick = () => {
      const vw = window.innerWidth, vh = window.innerHeight
      let sel = def.targets(ctxRef.current)
      let els = sel.map((s) => document.querySelector<HTMLElement>(s)).filter((e): e is HTMLElement => !!e)
      if (!els.length && def.fallback) { sel = def.fallback; els = sel.map((s) => document.querySelector<HTMLElement>(s)).filter((e): e is HTMLElement => !!e) }
      let r: R | null = null
      if (els.length) {
        const rs = els.map((e) => e.getBoundingClientRect())
        r = { left: Math.min(...rs.map((x) => x.left)), top: Math.min(...rs.map((x) => x.top)), right: Math.max(...rs.map((x) => x.right)), bottom: Math.max(...rs.map((x) => x.bottom)) }
        if (r.bottom - r.top > vh - 130 && els.length > 1) {
          const b = els[0].getBoundingClientRect()
          r = { left: b.left, top: b.top, right: b.right, bottom: b.bottom }
          els = [els[0]]
        }
        const key = step + sel.join('|')
        if (scrolled.current !== key && r.bottom - r.top > 4) {
          scrolled.current = key
          const h = r.bottom - r.top
          els[0].scrollIntoView({ block: h > vh * 0.6 ? 'start' : 'center', behavior: 'smooth' })
        }
        r = { left: Math.max(0, r.left), top: Math.max(0, r.top), right: Math.min(vw, r.right), bottom: Math.min(vh, r.bottom) }
      }
      setRect((o) => (o && r && Math.abs(o.left - r.left) < 1 && Math.abs(o.top - r.top) < 1 && Math.abs(o.right - r.right) < 1 && Math.abs(o.bottom - r.bottom) < 1 ? o : r))
      // Sprechblase platzieren
      const TOP = 92 // unter der oberen Leiste
      const bw = 420, bh = bubble.current?.offsetHeight ?? 280, m = 28
      let p = { left: (vw - bw) / 2, top: Math.max(TOP, (vh - bh) / 2) }
      if (r) {
        const x0 = r.left - 10, x1 = r.right + 10, y0 = r.top - 10, y1 = r.bottom + 10
        const clampT = (t: number) => Math.min(Math.max(TOP, t), vh - bh - 16)
        const clampL = (l: number) => Math.min(Math.max(16, l), vw - bw - 16)
        if (y1 + m + bh <= vh - 12) p = { left: clampL(x0), top: y1 + m }
        else if (x1 + m + bw <= vw - 12) p = { left: x1 + m, top: clampT(y0) }
        else if (x0 - m - bw >= 12) p = { left: x0 - m - bw, top: clampT(y0) }
        else if (y0 - m - bh >= 12) p = { left: clampL(x0), top: y0 - m - bh }
        else p = { left: vw - bw - 28, top: vh - bh - 28 }
      }
      setPos((o) => (Math.abs(o.left - p.left) < 1 && Math.abs(o.top - p.top) < 1 ? o : { left: Math.round(p.left), top: Math.round(p.top) }))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [tour.active, step, def])

  if (!tour.active) return null
  if (step >= STEPS.length) {
    return (
      <div className="tour-final">
        <div className="glass">
          <div className="final-ico"><Icon name="check" size={56} stroke={2.6} /></div>
          <h2>Fertig!</h2>
          <p>Den Rundgang kannst du jederzeit unten in der Seitenleiste neu starten.</p>
          <Btn kind="primary" size="lg" onClick={endTour}>Los geht’s</Btn>
        </div>
      </div>
    )
  }

  const vw = window.innerWidth, vh = window.innerHeight
  const x0 = rect ? Math.max(0, rect.left - 10) : 0, x1 = rect ? Math.min(vw, rect.right + 10) : 0
  const y0 = rect ? Math.max(0, rect.top - 10) : 0, y1 = rect ? Math.min(vh, rect.bottom + 10) : 0
  const can = def.canNext ? def.canNext(ctx) : true
  const need = def.need?.(ctx)

  return (
    <>
      <div className="tour-block" />
      {rect ? (
        <>
          <div className="tour-panel" style={{ top: 0, left: 0, width: vw, height: y0 }} />
          <div className="tour-panel" style={{ top: y1, left: 0, width: vw, height: Math.max(0, vh - y1) }} />
          <div className="tour-panel" style={{ top: y0, left: 0, width: x0, height: y1 - y0 }} />
          <div className="tour-panel" style={{ top: y0, left: x1, width: Math.max(0, vw - x1), height: y1 - y0 }} />
          <div className="tour-ring" style={{ top: y0, left: x0, width: x1 - x0, height: y1 - y0 }} />
        </>
      ) : <div className="tour-panel full" style={{ top: 0, left: 0, width: vw, height: vh }} />}
      <div className="glass tour-bubble" ref={bubble} style={{ left: pos.left, top: pos.top }} role="dialog" aria-label="Geführte Tour">
        <div key={step} style={{ animation: 'fade .5s both' }}>
          <div className="tour-step">Schritt {step + 1} von {STEPS.length}</div>
          <h3>{def.title}</h3>
          <p>{def.text(ctx)}</p>
          {need && <div className="need">{need}</div>}
        </div>
        <div className="tour-bar"><span style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} /></div>
        <div className="tour-actions">
          <Btn kind="ghost" size="sm" disabled={step === 0 || busy} onClick={() => tourState.set({ step: step - 1 })}>Zurück</Btn>
          <Btn kind="primary" size="sm" disabled={!can || busy} onClick={() => tourState.set({ step: step + 1 })}>Weiter<Icon name="arrow" size={15} /></Btn>
          {def.auto && !can && <Btn kind="glass" size="sm" disabled={busy} onClick={async () => { setBusy(true); try { await def.auto!.run() } finally { setBusy(false) } }}>{def.auto.label}</Btn>}
                    <Btn kind="ghost" size="sm" className="end" onClick={endTour}>Tour beenden</Btn>
        </div>
      </div>
    </>
  )
}
