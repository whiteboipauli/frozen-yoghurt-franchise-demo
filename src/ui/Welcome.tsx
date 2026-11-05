import { useEffect, useState, type ReactNode } from 'react'
import { actions } from '../data/repository'
import { Icon } from '../icons'
import { Btn } from './kit'
import { Signal } from './signal'
import { setWelcomeOff, tourState } from './tour-state'
import { startTour } from './Tour'


/** Mini-Illustrationen: linienhaft, mit den Signal-Symbolen */
const S = { fill: 'none', stroke: 'var(--ink-2)', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
const Ill = ({ children }: { children: ReactNode }) => <svg className="ob-ill" viewBox="0 0 240 120" role="img" aria-hidden>{children}</svg>
const IllToday = () => (
  <Ill>
    <rect x="20" y="16" width="200" height="88" rx="18" {...S} />
    <circle cx="52" cy="46" r="13" fill="var(--sig-red)" /><path d="M52 39v8M52 52v.5" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
    <path d="M78 40h110M78 52h70" {...S} />
    <path d="M52 84l10-10 10 10z" fill="var(--sig-amber)" /><path d="M86 80h100" {...S} />
    <circle cx="200" cy="82" r="9" fill="var(--sig-green)" /><path d="M196 82l3 3 5-6" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" />
  </Ill>
)
const IllOrder = () => (
  <Ill>
    <path d="M70 40h100l-8 52H78z" {...S} /><path d="M70 40c4-14 16-22 50-22s46 8 50 22" {...S} />
    <rect x="30" y="86" width="40" height="22" rx="6" {...S} /><path d="M40 97h20" {...S} />
    <path d="M176 28l8 8 14-16" stroke="var(--sig-green)" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M90 64h60M96 76h48" {...S} />
  </Ill>
)
const IllPlan = () => (
  <Ill>
    {[0, 1, 2].map((r) => [0, 1, 2, 3].map((c) => (r === 1 && c === 2
      ? <rect key={`${r}${c}`} x={30 + c * 48} y={22 + r * 30} width="40" height="22" rx="7" fill="rgba(240,176,58,.18)" stroke="var(--sig-amber)" strokeWidth="2" strokeDasharray="5 4" />
      : <rect key={`${r}${c}`} x={30 + c * 48} y={22 + r * 30} width="40" height="22" rx="7" fill="rgba(255,201,215,.6)" stroke="#fff" strokeWidth="1.5" />)))}
    <path d="M182 60v10M177 65h10" stroke="var(--sig-amber)" strokeWidth="2.4" strokeLinecap="round" />
  </Ill>
)
const IllControl = () => (
  <Ill>
    <path d="M120 14l66 22v30c0 22-28 36-66 46-38-10-66-24-66-46V36z" {...S} />
    <circle cx="120" cy="60" r="16" fill="var(--sig-green)" /><path d="M112 60l6 6 11-12" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </Ill>
)
const IllHq = () => (<Ill><rect x="30" y="30" width="50" height="50" rx="12" {...S} /><rect x="95" y="30" width="50" height="50" rx="12" {...S} /><rect x="160" y="30" width="50" height="50" rx="12" {...S} /><circle cx="55" cy="55" r="10" fill="var(--sig-red)" /><path d="M110 70l10-18 10 18z" fill="var(--sig-amber)" /><circle cx="185" cy="55" r="10" fill="var(--sig-green)" /></Ill>)
const IllCheck = () => (<Ill><rect x="40" y="20" width="160" height="80" rx="14" {...S} /><path d="M60 44h60M60 60h90M60 76h50" {...S} /><circle cx="170" cy="46" r="11" fill="var(--sig-amber)" /><path d="M164 46h12" stroke="var(--sig-amber-ink)" strokeWidth="2.4" strokeLinecap="round" /></Ill>)
const IllCases = () => (<Ill><circle cx="104" cy="54" r="30" {...S} /><path d="M126 76l34 30" {...S} strokeWidth="5" /><path d="M92 54h24M104 42v24" {...S} /></Ill>)
const IllInvoice = () => (<Ill><path d="M80 12h80v96l-14-9-13 9-13-9-13 9-14-9-13 9z" {...S} /><path d="M96 38h48M96 56h48M96 74h28" {...S} /></Ill>)

interface Card { title: string; text: string; ill: ReactNode; legend?: boolean }
const STORE: Card[] = [
  { title: 'Du siehst sofort, was heute zu tun ist', text: 'Vier Symbole zeigen dir alles. Jedes hat eine Form und ein Wort.', ill: <IllToday />, legend: true },
  { title: 'Bestellen mit Vorschlag statt Bauchgefühl', text: 'Das System kennt Bestand, Wetter und Aktionen und schlägt die Menge vor. Du bestätigst mit einem Klick.', ill: <IllOrder /> },
  { title: 'Dienstplan, der Lücken selbst findet', text: 'Fehlt jemand, siehst du es sofort und bekommst passende Vorschläge. Auch bei Krankmeldungen.', ill: <IllPlan /> },
  { title: 'Alles bleibt übersichtlich und fair kontrolliert', text: 'Das HQ sieht nur Kontrolldaten, nie dein Team und deine Toppings.', ill: <IllControl /> },
]
const HQ: Card[] = [
  { title: 'HQ-Cockpit: welcher Laden braucht dich?', text: 'Pro Laden eine Ampel-Kachel. Die Läden mit Problemen stehen oben.', ill: <IllHq />, legend: true },
  { title: 'Warenabgleich: passt die Ware?', text: 'Monatsinventur und Verbrauch gegen geliefert und verkauft, ruhig und ohne Rechnerei.', ill: <IllCheck /> },
  { title: 'Meldungen: Auffälliges klären', text: 'Offen, in Klärung, geklärt. Bei Bedarf eine Sonder-Inventur anfordern.', ill: <IllCases /> },
  { title: 'Rechnungen: automatisch und sauber', text: 'Die Rechnung entsteht, sobald du die Bestellung versendest. Eigene Rechnungen gehen mit „Neue Rechnung“.', ill: <IllInvoice /> },
]

/** Onboarding: genau 4 kurze Glas-Karten (Laden bzw. HQ) */
export function Welcome({ hq }: { hq?: boolean }) {
  const cards = hq ? HQ : STORE
  const [i, setI] = useState(0)
  const [gone, setGone] = useState(false)
  const [never, setNever] = useState(false)
  useEffect(() => { document.body.classList.add('modal-lock'); window.scrollTo(0, 0); return () => document.body.classList.remove('modal-lock') }, [])
  const c = cards[i]
  const close = () => { if (never) setWelcomeOff(true); tourState.set({ welcome: false }); setGone(true) }
  const restart = () => { setWelcomeOff(false); actions.resetDemo(); setI(0); setNever(false); tourState.set({ welcome: true }); setGone(false) }
  if (gone) return null
  return (
    <div className="welcome" role="dialog" aria-modal="true" aria-label="Willkommen">
      <div className="glass welcome-in ob">
        <div className="ob-dots" aria-label={`Schritt ${i + 1} von 4`}>{cards.map((_, k) => <i key={k} className={k === i ? 'on' : ''} />)}</div>
        {c.ill}
        <h1>{c.title}</h1>
        <p className="lead">{c.text}</p>
        {c.legend && (
          <div className="ob-legend">
            <span><Signal level="rot" size={26} />Dringend</span><span><Signal level="bernstein" size={26} />Bald</span><span><Signal level="gruen" size={26} />In Ordnung</span><span><Signal level="info" size={26} />Info</span>
          </div>
        )}
        <div className="row" style={{ justifyContent: 'center', gap: 14 }}>
          {i < 3
            ? <Btn kind="primary" size="lg" icon="pfeil-rechts" onClick={() => setI(i + 1)}>Weiter</Btn>
            : <><Btn kind="primary" size="lg" icon="play" onClick={() => { close(); startTour(hq ? 'hq' : 'store') }}>Rundgang starten</Btn><Btn size="lg" onClick={close}>Direkt loslegen</Btn></>}
        </div>
        <label className="ob-never"><input type="checkbox" checked={never} onChange={(e) => setNever(e.target.checked)} /> Nicht mehr automatisch zeigen</label>
        <div className="row" style={{ justifyContent: 'center', gap: 18, marginTop: 6 }}>
          {i < 3 && <button className="linkbtn" onClick={close}>Überspringen</button>}
          <button className="linkbtn" onClick={restart}><Icon name="wiederholen" size={15} />Demo neu starten</button>
        </div>
      </div>
    </div>
  )
}
