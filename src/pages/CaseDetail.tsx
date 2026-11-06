import { useState } from 'react'
import { actions, useDb } from '../data/repository'
import type { CaseStatus } from '../data/types'
import { go } from '../lib/router'
import { fmtCartons, fmtDate, fmtEUR, fmtPct } from '../lib/format'
import { CASE_ACTIONS, storeCases, type Case } from '../logic/cases'
import { demoForecastFactor } from '../logic/checks'
import { invoiceState } from '../logic/invoice'
import { expectedCups } from '../logic/forecast'
import { dayCups, saleDayOf } from '../logic/history'
import { dayRevenueOf } from '../logic/finance'
import { addDays, diffDays, todayISO } from '../lib/date'
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
          {c.art === 'inventur' && gd.length > 0 && (
            <div className="am-grid" style={{ marginTop: 14 }}>
              {gd.map((g) => <div key={g.key}><span className="cap">Monatsinventur {fmtDate(stichtagOf(last!))} · {g.label}</span><b style={{ color: g.light === 'green' ? undefined : g.light === 'red' ? 'var(--bad)' : 'var(--warn)' }}>{g.diff > 0 ? '+' : ''}{g.key === 'powder' ? fmtCartons(Math.abs(g.diff), db.articles.find((x) => x.id === 'pulver')?.packSize ?? 10) : `${new Intl.NumberFormat('de-DE').format(g.diff)} Stück`} ({fmtPct(g.pct)})</b><span className="faint small">gezählt gegen Soll</span></div>)}
            </div>
          )}
          {(c.art === 'inventur' || c.kind === 'ueberfaellig') && <div className="row wrap" style={{ marginTop: 16 }}>
            <CaseActions c={c} />
          </div>}
          <ArtDetail c={c} />
          {(c.art === 'inventur' || c.kind === 'ueberfaellig') && req.length > 0 && <p className="small muted" style={{ marginTop: 10 }}>{req.slice(0, 3).map((r) => `${r.kind === 'sonder-inventur' ? 'Sonder-Inventur' : 'Erinnerung'} am ${fmtDate(r.createdOn)} ${r.doneOn ? `– erledigt am ${fmtDate(r.doneOn)}` : '– noch offen beim Laden'}`).join(' · ')}</p>}
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

/** Details passend zur Art der Meldung: Rechnung überfällig, Umsatzeinbruch, Störung – alle anderen neutral */
function ArtDetail({ c }: { c: Case }) {
  const db = useDb()
  const toast = useToast()
  const today = todayISO()
  const note = (text: string, status?: 'in Klärung') => { actions.updateCase(c.storeId, c.kind, { note: text, status }); toast(text) }
  if (c.art === 'rechnung') {
    const late = db.invoices.filter((i) => i.storeId === c.storeId && invoiceState(i, today) === 'überfällig')
    return (
      <div className="art-detail" style={{ marginTop: 16 }}>
        <div className="cap">Überfällige Rechnungen</div>
        {late.map((i) => (
          <div key={i.id} className="art-inv">
            <div className="grow"><b>{i.number}</b><span className="muted small">Rechnung vom {fmtDate(i.date)} · {fmtEUR(i.gross)} brutto · fällig seit {fmtDate(i.dueDate)} · {Math.max(1, diffDays(today, i.dueDate))} Tage überfällig</span></div>
            <Btn size="sm" icon="rechnung" onClick={() => go(`/zentrale/rechnungen/${i.id}`)}>Rechnung ansehen</Btn>
            <Btn size="sm" icon="bell" onClick={() => note(`Zahlungserinnerung zu ${i.number} gesendet (Demo).`, 'in Klärung')}>Zahlungserinnerung senden (Demo)</Btn>
            <Btn size="sm" kind="primary" icon="check" onClick={() => { actions.markPaid(i.id); toast(`${i.number} als bezahlt markiert`) }}>Als bezahlt markieren</Btn>
          </div>
        ))}
      </div>
    )
  }
  if (c.art === 'umsatz') {
    const f = demoForecastFactor(c.storeId)
    const days = [1, 2, 3].map((n) => addDays(today, -n))
    const rows = days.map((d) => { const sd = saleDayOf(db, c.storeId, d); const ist = sd ? Math.round(dayCups(sd) * f) : 0; const fc = Math.round(expectedCups(db, c.storeId, d, today)); return { d, ist, fc, rev: dayRevenueOf(db, c.storeId, d) * f } })
    let sum = 0, n = 0
    for (let i = 4; i <= 31; i++) { const sd = saleDayOf(db, c.storeId, addDays(today, -i)); if (sd) { sum += dayCups(sd); n++ } }
    const avg = n ? Math.round(sum / n) : 0
    return (
      <div className="art-detail" style={{ marginTop: 16 }}>
        <div className="cap">Umsatz der letzten Tage gegen Prognose</div>
        <table className="tbl"><thead><tr><th>Tag</th><th className="r">Becher</th><th className="r">Prognose</th><th className="r">Ø 4 Wochen</th><th className="r">Umsatz netto</th><th className="r">Abweichung</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.d}><td>{fmtDate(r.d)}</td><td className="r">{r.ist}</td><td className="r">{r.fc}</td><td className="r">{avg}</td><td className="r">{fmtEUR(r.rev)}</td><td className="r">{r.fc ? `${r.ist >= r.fc ? '+' : '−'}${fmtPct(Math.abs((r.ist / r.fc - 1) * 100), 0)}` : '–'}</td></tr>)}</tbody></table>
        <div className="row wrap" style={{ marginTop: 12 }}><Btn icon="send" onClick={() => note('Laden kontaktiert (Demo).', 'in Klärung')}>Laden kontaktieren (Demo)</Btn></div>
      </div>
    )
  }
  if (c.art === 'stoerung') {
    return (
      <div className="art-detail" style={{ marginTop: 16 }}>
        <div className="cap">Beschreibung des Ladens</div>
        <p className="art-quote">{c.text}</p>
        <div className="row wrap">
          <Btn icon="send" onClick={() => note('Rückmeldung an den Laden gesendet (Demo).', 'in Klärung')}>Rückmeldung senden (Demo)</Btn>
          <Btn icon="warn" onClick={() => note('Techniker beauftragt (Demo).', 'in Klärung')}>Techniker beauftragen (Demo)</Btn>
        </div>
      </div>
    )
  }
  return null
}
