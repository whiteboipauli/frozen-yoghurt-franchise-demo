import type { Need } from '../logic/hr'
import { cellState } from '../logic/hr'

/** Stunden-Kurve „benötigt vs. eingeplant“ (Balken = Bedarf, Linie = Plan) */
export function HourChart({ open, close, need, planned, height = 90, cups }: { open: number; close: number; need: Need; planned: number[]; height?: number; cups?: number[] }) {
  const n = close - open
  const top = Math.max(2, ...Object.values(need), ...planned) + 1
  const w = 100 / n
  const y = (v: number) => height - (v / top) * (height - 6) - 2
  const line = planned.map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * w).toFixed(2)},${y(p)} L${((i + 1) * w).toFixed(2)},${y(p)}`).join(' ')
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="hchart" height={height} role="img" aria-label="benötigt gegen eingeplant je Stunde">
      {Array.from({ length: n }, (_, i) => {
        const nd = need[open + i] ?? 0
        const st = cellState(nd, planned[i] ?? 0)
        return (
          <g key={i}>
            <rect x={i * w + 0.5} y={y(nd)} width={w - 1} height={height - y(nd) - 2} rx={1.2} className={`hc-need ${st}`}><title>{open + i}–{open + i + 1} Uhr: benötigt {nd}, eingeplant {planned[i] ?? 0}{cups ? `, erwartet ${Math.round(cups[i])} Becher` : ''}</title></rect>
          </g>
        )
      })}
      <path d={line} className="hc-plan" fill="none" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/** Bedarfsleiste eines Tages: grün = gedeckt, rot = Lücke, grau = Überbesetzung */
export function DemandStrip({ open, close, need, cov }: { open: number; close: number; need: Need; cov: number[] }) {
  return (
    <div className="dstrip" style={{ gridTemplateColumns: `repeat(${close - open}, 1fr)` }}>
      {cov.map((c, i) => {
        const nd = need[open + i] ?? 0
        const st = cellState(nd, c)
        return <i key={i} className={st} title={`${open + i}–${open + i + 1} Uhr: ${st === 'gap' ? `${nd - c} fehlen` : st === 'over' ? `${c - nd} zu viel` : 'gedeckt'} (benötigt ${nd}, eingeplant ${c})`} />
      })}
    </div>
  )
}
