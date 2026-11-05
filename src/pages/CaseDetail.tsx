import { useState } from 'react'
import { actions, useDb } from '../data/repository'
import type { CaseStatus } from '../data/types'
import { go } from '../lib/router'
import { fmtCartons, fmtDate, fmtPct } from '../lib/format'
import { CASE_ACTIONS, storeCases } from '../logic/cases'
import { groupDiffs, monthlyOf, stichtagOf } from '../logic/inventory'
import { Icon } from '../icons'
import { Btn, Card, Empty, PageHead, Pill, useToast } from '../ui/kit'
import { CaseActions } from './Cockpit'

const FLOW: CaseStatus[] = ['offen', 'in Klärung', 'geklärt']

/** Meldung klären: Sonder-Inventur anfordern, Notiz hinzufügen, Status offen → in Klärung → geklärt (mit Begründung) */
export function CasePage({ storeId, kind }: { storeId: string; kind: string }) {
  const db = useDb()
  const toast = useToast()
  const [note, setNote] = useState('')
  const [why, setWhy] = useState('')
  const [closing, setClosing] = useState(false)
  const store = db.stores.find((s) => s.id === storeId)
  const c = storeCases(db, storeId).find((x) => x.kind === kind)
  if (!store || !c) return <><PageHead title="Meldung" hint="Diese Meldung gibt es nicht (mehr)." /><Card><Empty icon="check">Keine Meldung gefunden.</Empty><Btn kind="primary" onClick={() => go('/zentrale/cockpit')}>Zum Cockpit</Btn></Card></>
  const idx = FLOW.indexOf(c.status)
  const req = db.requests.filter((r) => r.storeId === storeId).sort((a, b) => b.createdOn.localeCompare(a.createdOn))
  const last = monthlyOf(db, storeId)[0] ?? null
  const gd = groupDiffs(db, last)
  return (
    <>
      <PageHead title={`${store.name}: ${c.title}`} hint={CASE_ACTIONS[c.kind] ?? c.text}
        right={<Btn kind="glass" onClick={() => go('/zentrale/meldungen')}>Alle Meldungen</Btn>} />
      <div className="stack">
        <Card i={0} tour="case-flow">
          <div className="case-steps" aria-label={`Status: ${c.status}`}>
            {FLOW.map((s, i) => <span key={s} className={`cs ${i < idx ? 'done' : i === idx ? 'now' : ''}`}><i>{i < idx ? <Icon name="check" size={13} stroke={3} /> : i + 1}</i>{s}</span>)}
          </div>
          <div className={`note ${c.level === 'red' ? 'bad' : 'warn'}`} style={{ marginTop: 16 }}><Icon name="warn" /><div><b>{c.level === 'red' ? 'Rot' : 'Gelb'}:</b> {c.text}</div></div>
          {gd.length > 0 && c.kind !== 'ueberfaellig' && (
            <div className="am-grid" style={{ marginTop: 14 }}>
              {gd.map((g) => <div key={g.key}><span className="cap">Monatsinventur {fmtDate(stichtagOf(last!))} · {g.label}</span><b style={{ color: g.light === 'green' ? undefined : g.light === 'red' ? 'var(--bad)' : 'var(--warn)' }}>{g.diff > 0 ? '+' : ''}{g.key === 'powder' ? fmtCartons(Math.abs(g.diff), db.articles.find((x) => x.id === 'pulver')?.packSize ?? 10) : `${new Intl.NumberFormat('de-DE').format(g.diff)} Stück`} ({fmtPct(g.pct)})</b><span className="faint small">gezählt gegen Soll</span></div>)}
            </div>
          )}
          <div className="row wrap" style={{ marginTop: 16 }}>
            <CaseActions c={c} />
          </div>
          {req.length > 0 && <p className="small muted" style={{ marginTop: 10 }}>{req.slice(0, 3).map((r) => `${r.kind === 'sonder-inventur' ? 'Sonder-Inventur' : 'Erinnerung'} am ${fmtDate(r.createdOn)} ${r.doneOn ? `– erledigt am ${fmtDate(r.doneOn)}` : '– noch offen beim Laden'}`).join(' · ')}</p>}
        </Card>

        <div className="grid g2" style={{ alignItems: 'start' }}>
          <Card title="Notizen" i={1}>
            {c.notes.length === 0 ? <p className="muted">Noch keine Notizen.</p> : c.notes.map((n, i) => <div key={i} className="note-row"><span className="faint small">{fmtDate(n.date)}</span><span>{n.text}</span></div>)}
            <div className="field" style={{ marginTop: 12 }}>
              <label>Notiz hinzufügen</label>
              <textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="z. B. Gespräch mit dem Franchisenehmer geführt" />
            </div>
            <Btn kind="primary" style={{ marginTop: 10 }} disabled={!note.trim()} onClick={() => { actions.updateCase(storeId, kind, { note }); setNote(''); toast('Notiz gespeichert') }}>Notiz speichern</Btn>
          </Card>
          <Card title="Status" i={2}>
            {c.status === 'geklärt' ? (
              <>
                <div className="note ok"><Icon name="check" /><div><b>Geklärt{c.resolvedOn ? ` am ${fmtDate(c.resolvedOn)}` : ''}.</b> Begründung: {c.resolution}</div></div>
                <Btn kind="glass" style={{ marginTop: 12 }} onClick={() => actions.updateCase(storeId, kind, { status: 'offen' })}>Wieder öffnen</Btn>
              </>
            ) : (
              <>
                <p className="muted small" style={{ marginBottom: 12 }}>Erledigte Meldungen verschwinden aus der offenen Liste.</p>
                <div className="row wrap">
                  <Btn kind="glass" disabled={c.status === 'in Klärung'} onClick={() => { actions.updateCase(storeId, kind, { status: 'in Klärung' }); toast('Status: in Klärung') }}>In Klärung setzen</Btn>
                  <Btn kind="primary" icon="check" onClick={() => setClosing(true)}>Als geklärt markieren</Btn>
                </div>
                {closing && (
                  <div className="field" style={{ marginTop: 14 }}>
                    <label>Begründung (Pflicht)</label>
                    <textarea className="input" rows={2} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="z. B. Sonder-Inventur zeigt: Differenz erklärt durch Bruch" autoFocus />
                    <div className="row" style={{ marginTop: 10 }}>
                      <Btn onClick={() => setClosing(false)}>Abbrechen</Btn>
                      <Btn kind="primary" disabled={!why.trim()} onClick={() => { actions.updateCase(storeId, kind, { status: 'geklärt', resolution: why }); setClosing(false); setWhy(''); toast('Meldung erledigt'); go('/zentrale/cockpit') }}>Fall abschließen</Btn>
                    </div>
                  </div>
                )}
              </>
            )}
            <div style={{ marginTop: 16 }}><Pill tone={c.level === 'red' ? 'red' : 'yellow'}>{c.level === 'red' ? 'rot' : 'gelb'}</Pill> <Pill>{c.status}</Pill></div>
          </Card>
        </div>
      </div>
    </>
  )
}
