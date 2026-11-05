import { useRef, useState } from 'react'
import { actions, useDb } from '../data/repository'
import { addDays, todayISO } from '../lib/date'
import { ADAPTERS, download, exportScheduleCsv, parseAvailabilityFile, sampleCsv, sampleJson, type ImportResult } from '../logic/adapters'
import { Icon } from '../ui/icons'
import { Btn, Card, PageHead, Pill, useToast } from '../ui/kit'

const CAPS = ['Mitarbeitende importieren', 'Verfügbarkeiten importieren', 'Abwesenheiten importieren', 'Dienstplan exportieren']

export function InterfacesPage({ storeId }: { storeId: string }) {
  const db = useDb()
  const toast = useToast()
  const today = todayISO()
  const emps = db.employees.filter((e) => e.storeId === storeId)
  const [res, setRes] = useState<(ImportResult & { name: string }) | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const onFile = async (f: File | undefined) => {
    if (!f) return
    setRes({ ...parseAvailabilityFile(f.name, await f.text(), emps), name: f.name })
    if (input.current) input.current.value = ''
  }
  return (
    <>
      <PageHead title="Schnittstellen" hint="Anbindung an Personalplanungsprogramme. Die Anbindungen sind vorbereitet – schon jetzt funktionieren der Datei-Import von Verfügbarkeiten und der CSV-Export des Dienstplans." />
      <div className="stack">
        <div className="ad-grid" data-tour="adapters">
          {ADAPTERS.map((a, i) => (
            <div key={a.id} className="glass ad-card card in" style={{ ['--i' as string]: i }}>
              <div className="row between"><h3 style={{ fontSize: 22 }}>{a.name}</h3><Pill tone="yellow">vorbereitet – noch nicht verbunden</Pill></div>
              <ul>{CAPS.map((c) => <li key={c}>{c}</li>)}</ul>
              <Btn kind="glass" disabled icon="plug">Verbinden</Btn>
            </div>
          ))}
        </div>
        <div className="note"><Icon name="info" /><div><b>Hinweis:</b> Für eine echte Verbindung wird später ein Server benötigt, damit Zugangsschlüssel sicher gespeichert sind. Im Browser gibt es deshalb keine Aufrufe zu diesen Anbietern und keine API-Keys.</div></div>

        <div className="grid g2" style={{ alignItems: 'start' }}>
          <Card title="Verfügbarkeiten importieren (JSON oder CSV)" i={3}>
            <p className="muted small" style={{ marginBottom: 10 }}>Eine Zeile pro Person und Tag. Mitarbeitende werden am Namen erkannt. Verfügbarkeit: <code>ganztags</code>, <code>vormittags</code>, <code>nachmittags</code>, <code>nicht</code> oder <code>frei</code> (dann mit <code>von</code> und <code>bis</code>). Datum als <code>JJJJ-MM-TT</code> oder <code>TT.MM.JJJJ</code>.</p>
            <div className="cap" style={{ marginBottom: 6 }}>CSV (Semikolon oder Komma)</div>
            <pre className="code">{sampleCsv(emps, addDays(today, 1)).split('\n').slice(0, 4).join('\n')}</pre>
            <div className="cap" style={{ margin: '12px 0 6px' }}>JSON</div>
            <pre className="code">{`[\n  { "mitarbeiter": "${emps[0]?.name ?? 'Vorname Nachname'}", "datum": "${addDays(today, 1)}",\n    "verfuegbarkeit": "frei", "von": "14:00", "bis": "19:00" }\n]`}</pre>
            <div className="row wrap" style={{ marginTop: 14 }}>
              <Btn kind="glass" icon="download" onClick={() => download('verfuegbarkeiten-beispiel.csv', sampleCsv(emps, addDays(today, 1)))}>Beispiel-CSV</Btn>
              <Btn kind="glass" icon="download" onClick={() => download('verfuegbarkeiten-beispiel.json', sampleJson(emps, addDays(today, 1)), 'application/json')}>Beispiel-JSON</Btn>
              <Btn kind="primary" icon="upload" onClick={() => input.current?.click()} data-tour="import-file">Datei auswählen</Btn>
              <input ref={input} type="file" accept=".csv,.json,text/csv,application/json" hidden onChange={(e) => onFile(e.target.files?.[0])} aria-label="Datei mit Verfügbarkeiten" />
            </div>
            {res && (
              <div className="stack" style={{ marginTop: 16, gap: 10 }}>
                <b>{res.name}: {res.rows.length} Einträge erkannt{res.errors.length ? `, ${res.errors.length} Fehler` : ''}</b>
                {res.errors.slice(0, 6).map((e, i) => <div key={i} className="small" style={{ color: 'var(--bad)' }}>{e}</div>)}
                <div className="row"><Btn kind="primary" disabled={!res.rows.length} onClick={() => { actions.importAvailability(res.rows); toast(`${res.rows.length} Verfügbarkeiten importiert`); setRes(null) }}>{res.rows.length} Einträge übernehmen</Btn><Btn kind="ghost" onClick={() => setRes(null)}>Verwerfen</Btn></div>
              </div>
            )}
          </Card>
          <Card title="Dienstplan exportieren (CSV)" i={4}>
            <p className="muted small" style={{ marginBottom: 12 }}>Alle Schichten der nächsten 14 Tage mit Datum, Person, Beginn, Ende, Pause und Netto-Stunden – zum Öffnen in Excel oder zum Import in andere Programme.</p>
            <pre className="code">datum;wochentag;mitarbeiter;beginn;ende;pause_std;netto_std;gesperrt</pre>
            <div style={{ marginTop: 14 }}><Btn kind="primary" icon="download" onClick={() => { download(`dienstplan-${storeId}-${today}.csv`, exportScheduleCsv(db, storeId, today, addDays(today, 13))); toast('Dienstplan exportiert') }}>Dienstplan als CSV exportieren</Btn></div>
          </Card>
        </div>
      </div>
    </>
  )
}
