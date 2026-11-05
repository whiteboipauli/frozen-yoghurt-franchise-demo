import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Light } from '../logic/forecast'
import { Icon, type IconName } from './icons'

/* ---------- Seitenkopf ---------- */
/** Innerhalb eines Reiters einer Sammelseite entfällt die eigene Überschrift */
export const EmbedCtx = createContext(false)
export function PageHead({ title, hint, right }: { title: string; hint: ReactNode; right?: ReactNode }) {
  const embedded = useContext(EmbedCtx)
  if (embedded) return right ? <div className="embed-actions no-print">{right}</div> : null
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        <p className="hint"><Icon name="info" size={17} />{hint}</p>
      </div>
      {right && <div className="page-head-right">{right}</div>}
    </div>
  )
}

export function Segmented<T extends string>({ value, options, onChange, size = '', tour }: { value: T; options: { value: T; label: ReactNode; icon?: IconName }[]; onChange: (v: T) => void; size?: '' | 'lg'; tour?: string; /** (nicht mehr nötig: Felder passen sich dem Text an) */ w?: number }) {
  const box = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ l: number; t: number; w: number; h: number } | null>(null)
  // Die Markierung folgt der echten Position des gewählten Feldes – auch wenn der Umschalter in eine zweite Zeile umbricht
  useLayoutEffect(() => {
    const measure = () => {
      const el = box.current?.querySelector<HTMLElement>('[aria-selected="true"]')
      if (el) setPos({ l: el.offsetLeft, t: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight })
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (box.current) ro.observe(box.current)
    document.fonts?.ready.then(measure).catch(() => {})
    return () => ro.disconnect()
  }, [value, options.length])
  return (
    <div ref={box} className={`seg ${size}`} role="tablist" data-tour={tour}>
      {pos && <span className="thumb" style={{ ['--tl' as string]: `${pos.l}px`, ['--tt' as string]: `${pos.t}px`, ['--tw' as string]: `${pos.w}px`, ['--th' as string]: `${pos.h}px` }} />}
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={o.value === value} onClick={() => onChange(o.value)}>
          {o.icon && <Icon name={o.icon} size={size === 'lg' ? 20 : 16} />}{o.label}
        </button>
      ))}
    </div>
  )
}

export const LIGHT_LABEL: Record<Light, string> = { green: 'Ausreichend', yellow: 'Bald bestellen', red: 'Jetzt bestellen' }
export const LIGHT_VAR: Record<Light, string> = { green: 'var(--ok)', yellow: 'var(--warn)', red: 'var(--bad)' }
export function LightPill({ light, label }: { light: Light; label?: string }) {
  return <span className={`pill ${light}`}><span className="dot" />{label ?? LIGHT_LABEL[light]}</span>
}
export function Pill({ children, tone = '' }: { children: ReactNode; tone?: '' | 'green' | 'yellow' | 'red' | 'blue' | 'accent' }) {
  return <span className={`pill ${tone}`}>{children}</span>
}

export function Btn({ children, kind = 'glass', size = '', icon, ...rest }: { kind?: 'primary' | 'cta' | 'glass' | 'ghost' | 'danger'; size?: '' | 'lg' | 'sm'; icon?: IconName } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...rest} className={`btn ${kind} ${size} ${rest.className ?? ''}`}>
      {icon && <Icon name={icon} size={size === 'lg' ? 20 : 17} />}{children}
    </button>
  )
}

export function Card({ title, right, children, className = '', i = 0, tour, style }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; i?: number; tour?: string; style?: CSSProperties }) {
  return (
    <section className={`glass card in ${className}`} style={{ ['--i' as string]: i, ...style }} data-tour={tour}>
      {(title || right) && (
        <div className="card-head">
          <h2>{title}</h2>
          {right}
        </div>
      )}
      {children}
    </section>
  )
}

/** Kleines Info-Symbol mit Erklärung */
export function Info({ text }: { text: ReactNode }) {
  return (
    <span className="info" tabIndex={0} aria-label="Erklärung">
      <Icon name="help" size={15} />
      <span className="info-pop" role="tooltip">{text}</span>
    </span>
  )
}

/** Zahl, die beim Laden hochzählt */
export function CountUp({ value, format = (n: number) => String(Math.round(n)), ms = 900 }: { value: number; format?: (n: number) => string; ms?: number }) {
  const [v, setV] = useState(0)
  const from = useRef(0)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setV(value); from.current = value; return }
    const start = performance.now()
    const a = from.current
    let raf = 0
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / ms)
      const e = 1 - Math.pow(1 - p, 3)
      setV(a + (value - a) * e)
      if (p < 1) raf = requestAnimationFrame(tick)
      else from.current = value
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, ms])
  return <>{format(v)}</>
}

/** Ringdiagramm (läuft beim Laden ein) */
export function Ring({ value, max = 1, size = 120, stroke = 12, color = 'var(--accent)', children }: { value: number; max?: number; size?: number; stroke?: number; color?: string; children?: ReactNode }) {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const t = requestAnimationFrame(() => setOn(true))
    return () => cancelAnimationFrame(t)
  }, [])
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const f = Math.max(0, Math.min(1, value / max))
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={on ? c * (1 - f) : c} transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 1.1s var(--spring-soft), stroke .4s', filter: `drop-shadow(0 2px 6px ${color})` }} />
      </svg>
      <div className="ring-in">{children}</div>
    </div>
  )
}

export function Modal({ onClose, children, wide, light }: { onClose: () => void; children: ReactNode; wide?: boolean; light?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  // Als Portal direkt in <body>: Fenster liegt immer im Vordergrund (nicht im animierten Seiten-Container)
  return createPortal(
    <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`glass sheet ${wide ? 'wide' : ''} ${light ? 'light' : ''}`} role="dialog" aria-modal="true">{children}</div>
    </div>,
    document.body,
  )
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return <button role="switch" aria-checked={on} aria-label={label} className="switch" onClick={() => onChange(!on)}><span /></button>
}

/* ---------- Toasts (Glas) ---------- */
export interface ToastItem {
  id: number
  msg: ReactNode
  tone?: 'ok' | 'warn' | 'bad' | ''
  action?: { label: string; onClick: () => void }
  ttl?: number
}
let items: ToastItem[] = []
const tl = new Set<() => void>()
const tEmit = () => tl.forEach((l) => l())
export function pushToast(msg: ReactNode, opts: Partial<Omit<ToastItem, 'id' | 'msg'>> = {}) {
  const id = Date.now() + Math.random()
  items = [...items, { id, msg, ttl: 3200, ...opts }].slice(-4)
  tEmit()
  const ttl = opts.ttl ?? 3200
  if (ttl > 0) setTimeout(() => dismissToast(id), ttl)
  return id
}
export function dismissToast(id: number) {
  items = items.filter((t) => t.id !== id)
  tEmit()
}
export const useToast = () => (msg: ReactNode, opts?: Partial<Omit<ToastItem, 'id' | 'msg'>>) => pushToast(msg, { tone: 'ok', ...opts })
export function ToastStack() {
  const list = useSyncExternalStore((l) => (tl.add(l), () => tl.delete(l)), () => items)
  return (
    <div className="toasts" data-tour="toast">
      {list.map((t) => (
        <div key={t.id} className={`glass toast ${t.tone ?? ''}`} role="status">
          <span className="toast-dot" />
          <div className="toast-msg">{t.msg}</div>
          {t.action && <button className="btn primary sm" onClick={() => { t.action!.onClick(); dismissToast(t.id) }}>{t.action.label}</button>}
          <button className="toast-x" aria-label="Schließen" onClick={() => dismissToast(t.id)}><Icon name="x" size={16} /></button>
        </div>
      ))}
    </div>
  )
}

/** Reiter einer Sammelseite (gleicher Umschalter überall) */
export function Tabs<T extends string>({ value, onChange, options, tour }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; icon?: IconName }[]; tour?: string }) {
  return <Segmented value={value} onChange={onChange} options={options} tour={tour} />
}

export const Empty = ({ children, icon = 'sparkle' }: { children: ReactNode; icon?: IconName }) => (
  <div className="empty"><span><Icon name={icon} size={38} stroke={1.5} /></span>{children}</div>
)

/** Initialen-Avatar in CI-Farben; mit `photoUrl` später ein eigenes Foto */
const AV = ['#5b8def', '#6f9bd1', '#5a7fb5', '#4f86c6', '#7a96c2', '#6188b8']
export function Avatar({ name, photoUrl, size = 48 }: { name: string; photoUrl?: string; size?: number }) {
  const ini = name.split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const bg = AV[h % AV.length]
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.38, background: photoUrl ? undefined : bg }}>
      {photoUrl ? <img src={photoUrl} alt={name} /> : ini}
    </span>
  )
}

/** Gemeinsamer kleiner Stepper für alle Mengen: 32-px-Buttons, direkt tippbares Feld, Pfeiltasten. Schrittweiten: Pulver 0,5 kg, Stückartikel 10, Kartons 1. */
export function NumInput({ value, onChange, step = 1, min = 0, max, width, label, placeholder }: { value: number | null; onChange: (n: number) => void; step?: number; min?: number; max?: number; width?: number; label?: string; placeholder?: string }) {
  const [text, setText] = useState<string | null>(null)
  const cur = value ?? 0
  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min, Math.round(n * 1000) / 1000))
  const bump = (d: number) => { setText(null); onChange(clamp(cur + d * step)) }
  return (
    <span className="stp" role="group" aria-label={label}>
      <button type="button" className="stp-b" aria-label={label ? `${label} weniger` : 'weniger'} disabled={value !== null && cur <= min} onClick={() => bump(-1)}><Icon name="minus" size={14} stroke={2.4} /></button>
      <input
        className="stp-in num-in"
        style={width ? { width } : undefined}
        inputMode="decimal"
        aria-label={label}
        placeholder={placeholder ?? '–'}
        value={text ?? (value === null ? '' : String(value).replace('.', ','))}
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          setText(e.target.value)
          const n = parseFloat(e.target.value.replace(',', '.'))
          if (!Number.isNaN(n) && n >= min && (max === undefined || n <= max)) onChange(n)
        }}
        onBlur={() => setText(null)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); bump(e.key === 'ArrowUp' ? 1 : -1) }
        }}
      />
      <button type="button" className="stp-b" aria-label={label ? `${label} mehr` : 'mehr'} disabled={max !== undefined && cur >= max} onClick={() => bump(1)}><Icon name="plus" size={14} stroke={2.4} /></button>
    </span>
  )
}
export const Stepper = NumInput
