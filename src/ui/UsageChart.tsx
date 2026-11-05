import { useEffect, useId, useRef, useState } from 'react'

export interface UsagePart { key: string; label: string; value: number }
export interface UsageBar { key: string; label: string; long: string; parts: UsagePart[]; expected?: number; interimUntil?: string }

/** Töne der Weinrot-Rosa-Familie: der erste Teil ist der dunkelste */
export const PART_TONES = ['#7A1A3A', '#B8486F', '#E6A9BF']
const nf = (unit: string, n: number) => new Intl.NumberFormat('de-DE', { maximumFractionDigits: unit === 'Kartons' ? 1 : 0, minimumFractionDigits: unit === 'Kartons' ? 1 : 0 }).format(n)
/** Drei runde Schritte: Obergrenze = 3 × schöner Schritt */
const niceMax = (v: number) => { const raw = v / 3; const p = 10 ** Math.floor(Math.log10(Math.max(raw, 0.1))); const f = raw / p; return ([1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((x) => f <= x) ?? 10) * p * 3 }

/** Ruhiges Balkendiagramm: runde Balken, letzter Monat kräftig, Ø-Linie, drei Hilfslinien; gestapelt bei mehreren Teilen; optional „erwartet“-Linie */
export function UsageChart({ bars, unit, showExpected }: { bars: UsageBar[]; unit: string; showExpected?: boolean }) {
  const uid = useId().replace(/:/g, '')
  const [hover, setHover] = useState<number | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(700)
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const measure = () => setW(Math.max(320, Math.round(el.clientWidth)))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const H = 270, L = 48, R = 14, T = 30, B = 32
  const n = Math.max(1, bars.length)
  const slot = (W - L - R) / n, bw = Math.min(46, slot * 0.58)
  const totals = bars.map((b) => b.parts.reduce((s, p) => s + p.value, 0))
  const full = bars.filter((b) => !b.interimUntil)
  const avg = full.length ? full.reduce((s, b) => s + b.parts.reduce((a, p) => a + p.value, 0), 0) / full.length : 0
  const maxV = Math.max(1, ...totals, ...(showExpected ? bars.map((b) => b.expected ?? 0) : []))
  const top = niceMax(maxV * 1.08)
  const y = (v: number) => T + (H - T - B) * (1 - v / top)
  const cx = (i: number) => L + slot * i + slot / 2
  const lastFull = bars.map((b, i) => (b.interimUntil ? -1 : i)).reduce((a, b) => Math.max(a, b), -1)
  const parts = bars[0]?.parts ?? []
  return (
    <div className="uchart">
      <div className="uchart-legend">
        {parts.length > 1 && parts.map((p, k) => <span key={p.key}><i style={{ background: PART_TONES[k] }} />{p.label}</span>)}
        <span><i className="dash" />Ø pro Monat</span>
        {showExpected && <span><i className="exp" />erwartet aus Verkäufen</span>}
        {bars.some((b) => b.interimUntil) && <span><i className="hatch" />Zwischenzählung</span>}
      </div>
      <div className="uchart-box" ref={boxRef}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="Verbrauch pro Monat">
          <defs>
            <pattern id={`${uid}h`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="rgba(122,26,58,.10)" /><line x1="0" y1="0" x2="0" y2="7" stroke="#7A1A3A" strokeWidth="2.4" opacity=".55" /></pattern>
            {bars.map((_, i) => <clipPath key={i} id={`${uid}c${i}`}><rect x={cx(i) - bw / 2} y={T - 6} width={bw} height={H - B - T + 6} rx={Math.min(11, bw / 2)} /></clipPath>)}
          </defs>
          {[1, 2, 3].map((k) => { const v = (top / 3) * k; return <g key={k}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="rgba(90,75,68,.14)" strokeDasharray="2 5" /><text x={L - 8} y={y(v) + 4} textAnchor="end" className="uc-axis">{new Intl.NumberFormat('de-DE', { maximumFractionDigits: top < 10 ? 1 : 0 }).format(v)}</text></g> })}
          <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke="rgba(90,75,68,.22)" />
          {bars.map((b, i) => {
            const isLast = i === lastFull, dim = hover !== null ? hover !== i : false
            let acc = 0
            return (
              <g key={b.key} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ cursor: 'default' }}>
                <rect x={cx(i) - slot / 2} y={T - 8} width={slot} height={H - B - T + 8} fill="transparent" />
                <g clipPath={`url(#${uid}c${i})`} opacity={dim ? 0.45 : b.interimUntil ? 1 : isLast || hover === i ? 1 : 0.68}>
                  {b.interimUntil
                    ? <rect x={cx(i) - bw / 2} y={y(totals[i])} width={bw} height={y(0) - y(totals[i])} fill={`url(#${uid}h)`} />
                    : b.parts.map((p, k) => { const h = y(0) - y(p.value); const yy = y(acc + p.value); acc += p.value; return <rect key={p.key} x={cx(i) - bw / 2} y={yy} width={bw} height={Math.max(0, h)} fill={PART_TONES[k] ?? PART_TONES[0]} stroke={k > 0 ? 'rgba(255,255,255,.55)' : 'none'} strokeWidth="1" /> })}
                </g>
                {b.interimUntil && <rect x={cx(i) - bw / 2} y={y(totals[i])} width={bw} height={y(0) - y(totals[i])} rx={Math.min(11, bw / 2)} fill="none" stroke="#7A1A3A" strokeDasharray="4 3" opacity=".7" />}
                {(isLast || b.interimUntil || hover === i) && <text x={cx(i) + (cx(i) + 26 > W ? 14 : 0)} y={y(totals[i]) - 8} textAnchor={cx(i) + 26 > W ? 'end' : 'middle'} className="uc-val">{nf(unit, totals[i])}</text>}
                <text x={cx(i)} y={H - 9} textAnchor="middle" className={`uc-m ${isLast ? 'on' : ''}`}>{b.label}</text>
              </g>
            )
          })}
          {avg > 0 && <g><line x1={L} x2={W - R} y1={y(avg)} y2={y(avg)} stroke="#4B4541" strokeWidth="1.4" strokeDasharray="6 5" opacity=".7" /><text x={L + 6} y={y(avg) - 6} textAnchor="start" className="uc-avg">Ø {nf(unit, avg)}</text></g>}
          {showExpected && bars.length > 0 && (
            <g>
              <polyline fill="none" stroke="#2B2623" strokeWidth="2" points={bars.filter((b) => b.expected !== undefined).map((b) => `${cx(bars.indexOf(b))},${y(b.expected!)}`).join(' ')} />
              {bars.filter((b) => b.expected !== undefined).map((b) => <circle key={b.key} cx={cx(bars.indexOf(b))} cy={y(b.expected!)} r="3.6" fill="#fff" stroke="#2B2623" strokeWidth="2" />)}
            </g>
          )}
        </svg>
        {hover !== null && bars[hover] && (
          <div className="uchart-tip" style={{ left: `${(cx(hover) / W) * 100}%`, transform: `translate(${hover >= n / 2 ? 'calc(-100% - 28px)' : '28px'}, 0)` }}>
            <b>{bars[hover].long}{bars[hover].interimUntil ? ` · bis ${bars[hover].interimUntil}` : ''}</b>
            {bars[hover].parts.length > 1 && bars[hover].parts.map((p, k) => <span key={p.key}><i style={{ background: PART_TONES[k] }} />{p.label} {nf(unit, p.value)}</span>)}
            <span>Gesamt {nf(unit, totals[hover])} {unit}</span>
            {showExpected && bars[hover].expected !== undefined && <span className="muted">erwartet {nf(unit, bars[hover].expected!)} {unit}</span>}
          </div>
        )}
      </div>
    </div>
  )
}
