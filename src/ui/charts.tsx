import { useEffect, useRef, useState, type ReactNode } from 'react'

export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(600)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(el.clientWidth || 600))
    ro.observe(el)
    setW(el.clientWidth || 600)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

/** Weiche Kurve durch Punkte (monotone Kubik) */
export function smoothPath(pts: [number, number][]) {
  if (pts.length < 2) return ''
  const n = pts.length
  const dx: number[] = [], m: number[] = [], t: number[] = []
  for (let i = 0; i < n - 1; i++) { dx.push(pts[i + 1][0] - pts[i][0]); m.push((pts[i + 1][1] - pts[i][1]) / (dx[i] || 1)) }
  t.push(m[0])
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2)
  t.push(m[n - 2])
  let d = `M${pts[0][0]},${pts[0][1]}`
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3
    d += ` C${pts[i][0] + h},${pts[i][1] + t[i] * h} ${pts[i + 1][0] - h},${pts[i + 1][1] - t[i + 1] * h} ${pts[i + 1][0]},${pts[i + 1][1]}`
  }
  return d
}

export interface CurvePoint { x: string; y: number; tip?: ReactNode; future?: boolean; top?: ReactNode }

/** Kurve mit Farbverlauf-Fläche, Glas-Tooltip, optionalem Toleranzband und Markierungen */
export function Curve({
  points, height = 220, color = 'var(--accent)', unit = '', yMin, yMax, band, vlines = [], xLabel, topIcons = false, showAxis = true, sparkline = false, hlines = [],
}: {
  points: CurvePoint[]
  height?: number
  color?: string
  unit?: string
  yMin?: number
  yMax?: number
  band?: [number, number]
  vlines?: { x: string; label: string; tone?: 'accent' | 'bad' | 'warn' | 'ok' }[]
  hlines?: { y: number; label: string }[]
  xLabel?: (x: string, i: number) => string
  topIcons?: boolean
  showAxis?: boolean
  sparkline?: boolean
}) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const [on, setOn] = useState(false)
  useEffect(() => { const r = requestAnimationFrame(() => setOn(true)); return () => cancelAnimationFrame(r) }, [])
  const padL = sparkline ? 4 : showAxis ? 40 : 8, padR = sparkline ? 4 : 14, padT = topIcons ? 34 : 14, padB = sparkline ? 6 : 28
  const ys = points.map((p) => p.y)
  const lo = yMin ?? Math.min(...ys, band?.[0] ?? Infinity) * 0.9
  const hi = yMax ?? Math.max(...ys, band?.[1] ?? -Infinity) * 1.1 + 0.0001
  const X = (i: number) => padL + (i / Math.max(1, points.length - 1)) * (w - padL - padR)
  const Y = (v: number) => padT + (1 - (v - lo) / (hi - lo || 1)) * (height - padT - padB)
  const xy = points.map((p, i) => [X(i), Y(p.y)] as [number, number])
  const line = smoothPath(xy)
  const area = xy.length > 1 ? `${line} L${xy[xy.length - 1][0]},${height - padB} L${xy[0][0]},${height - padB} Z` : ''
  const gid = useRef(`g${Math.random().toString(36).slice(2, 7)}`).current
  const firstFuture = points.findIndex((p) => p.future)
  const ticks = [lo, lo + (hi - lo) / 2, hi]
  const hp = hover !== null ? points[hover] : null
  return (
    <div className="curve" ref={ref} style={{ height }} onMouseLeave={() => setHover(null)}>
      <svg width={w} height={height} onMouseMove={(e) => {
        const r = (e.currentTarget as SVGElement).getBoundingClientRect()
        const i = Math.round(((e.clientX - r.left - padL) / (w - padL - padR)) * (points.length - 1))
        setHover(Math.max(0, Math.min(points.length - 1, i)))
      }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity=".38" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
          <clipPath id={gid + 'c'}><rect x="0" y="0" width={on ? w : 0} height={height} style={{ transition: 'width 1.2s var(--spring-soft)' }} /></clipPath>
        </defs>
        {showAxis && !sparkline && ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={w - padR} y1={Y(t)} y2={Y(t)} stroke="var(--grid)" strokeDasharray="3 5" />
            <text x={padL - 8} y={Y(t) + 4} textAnchor="end" className="ax">{new Intl.NumberFormat('de-DE', { maximumFractionDigits: hi - lo > 20 ? 0 : 1 }).format(t)}</text>
          </g>
        ))}
        {band && <rect x={padL} width={w - padL - padR} y={Y(band[1])} height={Math.max(0, Y(band[0]) - Y(band[1]))} fill="var(--ok)" opacity=".13" rx="8" />}
        {hlines.map((h, i) => (
          <g key={i}><line x1={padL} x2={w - padR} y1={Y(h.y)} y2={Y(h.y)} stroke="var(--bad)" strokeDasharray="5 5" opacity=".6" /><text x={w - padR} y={Y(h.y) - 6} textAnchor="end" className="ax" fill="var(--bad)">{h.label}</text></g>
        ))}
        <g clipPath={`url(#${gid}c)`}>
          <path d={area} fill={`url(#${gid})`} />
          <path d={line} fill="none" stroke={color} strokeWidth={sparkline ? 2.5 : 3.5} strokeLinecap="round" style={{ filter: `drop-shadow(0 4px 8px ${color})` }}
            strokeDasharray={firstFuture > 0 ? undefined : undefined} />
        </g>
        {vlines.map((v) => {
          const i = points.findIndex((p) => p.x === v.x)
          if (i < 0) return null
          const col = v.tone === 'bad' ? 'var(--bad)' : v.tone === 'warn' ? 'var(--warn)' : v.tone === 'ok' ? 'var(--ok)' : 'var(--accent)'
          return (
            <g key={v.x + v.label}>
              <line x1={X(i)} x2={X(i)} y1={padT - 6} y2={height - padB} stroke={col} strokeDasharray="4 4" opacity=".8" />
              <text x={X(i)} y={height - padB + 15} textAnchor="middle" className="ax strong" fill={col}>{v.label}</text>
            </g>
          )
        })}
        {!sparkline && points.map((p, i) => (
          (i % Math.ceil(points.length / 8) === 0) && <text key={i} x={X(i)} y={height - 6} textAnchor="middle" className="ax">{xLabel ? xLabel(p.x, i) : p.x}</text>
        ))}
        {topIcons && points.map((p, i) => p.top && <foreignObject key={i} x={X(i) - 14} y={2} width="28" height="28"><div className="wx-i">{p.top}</div></foreignObject>)}
        {hp && (
          <g>
            <line x1={X(hover!)} x2={X(hover!)} y1={padT - 4} y2={height - padB} stroke={color} opacity=".4" />
            <circle cx={X(hover!)} cy={Y(hp.y)} r="6" fill="#fff" stroke={color} strokeWidth="3.5" />
          </g>
        )}
      </svg>
      {hp && hp.tip && (
        <div className="glass tip" style={{ left: Math.min(Math.max(X(hover!), 110), w - 110), top: Math.max(0, Y(hp.y) - 12) }}>
          {hp.tip}
        </div>
      )}
      {unit && !sparkline && <span className="curve-unit">{unit}</span>}
    </div>
  )
}

/** Horizontaler Balken (z. B. Topping-Beliebtheit) */
export function HBar({ label, value, max, right, color = 'var(--accent)', icon }: { label: ReactNode; value: number; max: number; right?: ReactNode; color?: string; icon?: ReactNode }) {
  const [on, setOn] = useState(false)
  useEffect(() => { const r = requestAnimationFrame(() => setOn(true)); return () => cancelAnimationFrame(r) }, [])
  return (
    <div className="hbar">
      <div className="hbar-top"><span>{icon}{label}</span><b>{right ?? value}</b></div>
      <div className="hbar-track"><span style={{ width: on ? `${Math.max(3, (value / (max || 1)) * 100)}%` : 0, background: color }} /></div>
    </div>
  )
}

/** Füllstand-Anzeige: Flüssigkeit steigt beim Laden */
export function Tank({ pct, color, size = 112, children }: { pct: number; color: string; size?: number; children?: ReactNode }) {
  const [on, setOn] = useState(false)
  useEffect(() => { const r = requestAnimationFrame(() => setOn(true)); return () => cancelAnimationFrame(r) }, [])
  const p = Math.max(4, Math.min(100, pct))
  return (
    <div className="tank" style={{ width: size, height: size, ['--tc' as string]: color }}>
      <div className="tank-fill" style={{ height: on ? `${p}%` : '0%' }}><i /><i /></div>
      <div className="tank-in">{children}</div>
    </div>
  )
}
