import { useState, type ReactNode } from 'react'
import { Icon, type IconName } from '../icons'
import { Modal, Btn } from './kit'

/**
 * Zentrales Signal-System. Vier Stufen, Farbe nie allein: immer Form/Symbol + Wort.
 *  rot = dringend · bernstein = bald · gruen = in Ordnung · info = neu/Info
 */
export type Level = 'rot' | 'bernstein' | 'gruen' | 'info'

export const LEVEL_RANK: Record<Level, number> = { rot: 3, bernstein: 2, info: 1, gruen: 0 }
export const LEVEL_META: Record<Level, { chip: string; soon: string; text: string; hint: string; color: string }> = {
  rot: { chip: 'Dringend', soon: 'Dringend', text: 'Dringend', hint: 'Hier ist jetzt ein Problem. Bitte zuerst kümmern.', color: 'var(--sig-red)' },
  bernstein: { chip: 'Bald', soon: 'Wird knapp', text: 'Bald', hint: 'Hier wird es bald ein Problem. Jetzt ist noch Zeit.', color: 'var(--sig-amber)' },
  gruen: { chip: 'In Ordnung', soon: 'In Ordnung', text: 'In Ordnung', hint: 'Alles gut, nichts zu tun.', color: 'var(--sig-green)' },
  info: { chip: 'Neu', soon: 'Info', text: 'Info', hint: 'Eine Neuigkeit oder ein Hinweis, kein Problem.', color: 'var(--sig-info)' },
}

/** Schlimmste vorhandene Stufe (ohne Eintrag: grün) */
export function worstLevel(levels: (Level | null | undefined)[]): Level {
  let w: Level = 'gruen'
  for (const l of levels) if (l && LEVEL_RANK[l] > LEVEL_RANK[w]) w = l
  return w
}

/** Gefülltes Status-Zeichen. variant 'uhr' zeigt bei Bernstein eine Uhr statt Ausrufezeichen, 'megafon' bei Info ein Megafon. */
export function Signal({ level, size = 22, variant, pulse, label }: { level: Level; size?: number; variant?: 'uhr' | 'megafon'; pulse?: boolean; label?: string }) {
  const aria = label ?? LEVEL_META[level].text
  const cls = `sg sg-${level}${pulse ? ' pulse' : ''}`
  const common = { className: cls, width: size, height: size, viewBox: '0 0 24 24', role: 'img' as const, 'aria-label': aria }
  const g = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (level === 'bernstein') {
    return (
      <svg {...common}>
        {variant === 'uhr' ? (
          <><circle cx="12" cy="12" r="11" fill="var(--sig-amber)" /><g {...g} stroke="var(--sig-amber-ink)"><path d="M12 6.500V12l3.500 2.200" /></g></>
        ) : (
          <><path d="M12 2.200c.7 0 1.300.4 1.700 1l8.300 14.600c.8 1.400-.2 3.200-1.700 3.200H3.700c-1.500 0-2.500-1.800-1.700-3.200L10.300 3.200c.4-.6 1-1 1.700-1z" fill="var(--sig-amber)" stroke="var(--sig-amber)" strokeWidth="1.500" strokeLinejoin="round" /><g {...g} stroke="var(--sig-amber-ink)"><path d="M12 8.800v5M12 17.300v.2" /></g></>
        )}
      </svg>
    )
  }
  if (level === 'rot') {
    return <svg {...common}><circle cx="12" cy="12" r="11" fill="var(--sig-red)" /><g {...g} stroke="#fff"><path d="M12 6.500v7M12 17.300v.2" /></g></svg>
  }
  if (level === 'gruen') {
    return <svg {...common}><circle cx="12" cy="12" r="11" fill="var(--sig-green)" /><g {...g} stroke="#fff"><path d="M7 12.500l3.300 3.300L17 8.800" /></g></svg>
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="11" fill="var(--sig-info)" />
      {variant === 'megafon' ? (
        <g fill="none" stroke="#fff" strokeWidth="1.900" strokeLinecap="round" strokeLinejoin="round"><path d="M6 10.500v3a.7.7 0 0 0 .7.7H9l5 2.800V7L9 9.800H6.700a.7.7 0 0 0-.7.700z" /><path d="M17 9.500a3.200 3.200 0 0 1 0 5" /></g>
      ) : (
        <g {...g} stroke="#fff"><path d="M12 11v6M12 7.300v.2" /></g>
      )}
    </svg>
  )
}

/** Chip mit Symbol und Wort, z. B. „Dringend“ */
export function SignalChip({ level, children, variant, soon }: { level: Level; children?: ReactNode; variant?: 'uhr' | 'megafon'; /** Wortvariante „Wird knapp“ statt „Bald“ */ soon?: boolean }) {
  return (
    <span className={`sigchip sigchip-${level}`}>
      <Signal level={level} size={18} variant={variant} />
      <span>{children ?? (soon && level === 'bernstein' ? LEVEL_META.bernstein.soon : LEVEL_META[level].chip)}</span>
    </span>
  )
}

/** Kleines rundes Abzeichen mit Zahl (Menü) – Form und Zahl, nicht nur Farbe */
export function CountBadge({ level, n }: { level: Level; n?: number }) {
  if (level === 'gruen') return null
  const txt = level === 'bernstein' ? '!' : level === 'info' ? (n ?? 'i') : (n ?? '!')
  return <span className={`cbadge cbadge-${level}`} aria-label={`${LEVEL_META[level].text}${n ? `: ${n}` : ''}`}>{txt}</span>
}

/** Art-Icon in einer Glas-Kachel; bei Bedarf mit rundem Stufen-Abzeichen an der Ecke */
export function IconTile({ icon, level, size = 24, tile = 44, pulse }: { icon: IconName; level?: Level | null; size?: number; tile?: number; pulse?: boolean }) {
  return (
    <span className={`itile${level ? ` tint-${level}` : ''}`} style={{ width: tile, height: tile }}>
      <Icon name={icon} size={size} />
      {level && level !== 'gruen' && <span className="itile-badge"><Signal level={level} size={Math.max(16, Math.round(tile * 0.44))} pulse={pulse ?? level === 'rot'} /></span>}
      {level === 'gruen' && <span className="itile-badge"><Signal level="gruen" size={Math.max(16, Math.round(tile * 0.44))} /></span>}
    </span>
  )
}

/** Zähler-Chip mit Icon: „2 dringend“ */
export function CountChip({ level, n, word }: { level: Level; n: number; word: string }) {
  return (
    <span className={`countchip countchip-${level}${n === 0 ? ' zero' : ''}`}>
      <Signal level={level} size={18} />
      <b>{n}</b> {word}
    </span>
  )
}

/** Zeit-Chip mit Uhr: „in 3 Std“, „bis Do 12:00 Uhr“, „seit gestern offen“. progress 0..1 zeigt einen kleinen Fortschrittsring. */
export function TimeChip({ children, level, progress }: { children: ReactNode; level?: Level; progress?: number }) {
  return (
    <span className={`timechip${level ? ` timechip-${level}` : ''}`}>
      {progress == null ? <Icon name="uhr" size={16} /> : <MiniRing value={progress} />}
      {children}
    </span>
  )
}

function MiniRing({ value }: { value: number }) {
  const r = 7, c = 2 * Math.PI * r, f = Math.max(0, Math.min(1, value))
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <circle cx="9" cy="9" r={r} fill="none" stroke="currentColor" strokeOpacity=".25" strokeWidth="2.200" />
      <circle cx="9" cy="9" r={r} fill="none" stroke="currentColor" strokeWidth="2.200" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - f)} transform="rotate(-90 9 9)" />
    </svg>
  )
}

/** Füllstandsbalken mit Beschriftung („reicht noch 3 Tage“) und Stufen-Symbol */
export function FillBar({ value, max, level, label }: { value: number; max: number; level: Level; label: ReactNode }) {
  const f = max > 0 ? Math.max(0.03, Math.min(1, value / max)) : 0
  return (
    <div className="fillbar">
      <div className="fillbar-top"><Signal level={level} size={18} /><span className="fillbar-label">{label}</span></div>
      <div className="fillbar-track" role="presentation"><i className={`fill-${level}`} style={{ width: `${f * 100}%` }} /></div>
    </div>
  )
}

/** Vorausschau-Hinweis: Zeitangabe + Trend-Symbol, z. B. „Pulver reicht nur noch bis Freitag“ */
export function Forecast({ level = 'bernstein', trend = 'ab', icon, children, when }: { level?: Level; trend?: 'ab' | 'auf'; icon?: IconName; children: ReactNode; when?: ReactNode }) {
  return (
    <div className={`forecast tint-${level}`}>
      <Icon name={icon ?? (trend === 'ab' ? 'trend-ab' : 'trend-auf')} size={20} />
      <span className="forecast-text">{children}</span>
      {when && <TimeChip level={level}>{when}</TimeChip>}
    </div>
  )
}

/* ---------- Hilfe: „Was bedeuten die Symbole?“ ---------- */
export function SignalLegend({ onClose }: { onClose: () => void }) {
  const rows: { l: Level; variant?: 'uhr' | 'megafon'; ex: string }[] = [
    { l: 'rot', ex: 'Ausfall heute, Artikel leer, überfällige Rechnung' },
    { l: 'bernstein', ex: 'Lücke am Samstag, Pulver reicht nur noch bis Freitag, Frist läuft bald ab' },
    { l: 'gruen', ex: 'Alles erledigt oder ausreichend da' },
    { l: 'info', variant: 'megafon', ex: 'Neue Nachricht oder Aktion vom HQ' },
  ]
  return (
    <Modal onClose={onClose}>
      <h2>Was bedeuten die Symbole?</h2>
      <p className="muted" style={{ marginTop: 6 }}>Jedes Symbol hat eine Form und ein Wort. So erkennst du es auch ohne Farbe.</p>
      <div className="legend">
        {rows.map((r) => (
          <div key={r.l} className="legend-row">
            <Signal level={r.l} size={34} variant={r.variant} />
            <div className="legend-text"><b>{LEVEL_META[r.l].text}</b><span>{LEVEL_META[r.l].hint}</span><span className="faint">{r.ex}</span></div>
          </div>
        ))}
      </div>
      <div className="actions"><Btn kind="primary" icon="haken" onClick={onClose}>Verstanden</Btn></div>
    </Modal>
  )
}

export function LegendLink() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className="linkbtn" onClick={() => setOpen(true)}><Icon name="hilfe" size={16} />Was bedeuten die Symbole?</button>
      {open && <SignalLegend onClose={() => setOpen(false)} />}
    </>
  )
}

/** Fester Hintergrund: warm-neutraler Verlauf, weiche Kreise, Perlmutt-Kugeln. Liegt unter der gesamten App. */
export function Backdrop() {
  return (
    <div className="bg" aria-hidden>
      <i /><i /><i /><i />
      <b className="pearl" /><b className="pearl" /><b className="pearl" /><b className="pearl" />
    </div>
  )
}
