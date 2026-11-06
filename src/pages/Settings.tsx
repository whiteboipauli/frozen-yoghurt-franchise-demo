import { useState } from 'react'
import { actions, useDb } from '../data/repository'
import type { Article, Source } from '../data/types'
import { STATE_NAMES } from '../data/stores'
import { legalHolidays } from '../data/holidays'
import { CatalogTable } from './Catalog'
import { fmtDate, fmtEUR } from '../lib/format'
import { refreshWeather, useWeatherStatus, weatherAvailable } from '../logic/weather'
import { Btn, Card, Info, Modal, NumInput, PageHead, Pill, Segmented, useToast } from '../ui/kit'

type Tab = 'firma' | 'nummern' | 'franchise' | 'katalog' | 'pauschalen' | 'ampel' | 'artikel' | 'rezepturen' | 'feiertage' | 'ferien' | 'standort' | 'daten'

export function SettingsPage() {
  const [tab, setTab] = useState<Tab>('firma')
  return (
    <>
      <PageHead title="Einstellungen des HQ" hint="Firmendaten, Rechnungsnummern, Katalog, Schwund-Pauschalen, Ampel-Grenzen, Artikel, Feiertage und Standorte. Alle Werte sind Demo-Werte." />
      <div style={{ marginBottom: 20 }}>
        <Segmented<Tab> value={tab} onChange={setTab} options={[
          { value: 'firma', label: 'Firmendaten' }, { value: 'nummern', label: 'Rechnungsnummern' }, { value: 'franchise', label: 'Franchisenehmer' }, { value: 'katalog', label: 'Katalog' },
          { value: 'pauschalen', label: 'Schwund-Pauschalen' }, { value: 'ampel', label: 'Ampel & Planung' }, { value: 'artikel', label: 'Artikel & Toppings' },
          { value: 'rezepturen', label: 'Rezepturen' }, { value: 'feiertage', label: 'Feiertage' }, { value: 'ferien', label: 'Schulferien' }, { value: 'standort', label: 'Standort & Wetter' }, { value: 'daten', label: 'Daten' }]} />
      </div>
      {tab === 'firma' && <CompanyTab />}
      {tab === 'nummern' && <NumberTab />}
      {tab === 'franchise' && <FranchiseTab />}
      {tab === 'katalog' && <CatalogTable />}
      {tab === 'ferien' && <SchoolTab />}
      {tab === 'pauschalen' && <ShrinkTab />}
      {tab === 'ampel' && <PlanningTab />}
      {tab === 'artikel' && <ArticlesTab />}
      {tab === 'rezepturen' && <RecipesTab />}
      {tab === 'feiertage' && <HolidaysTab />}
      {tab === 'standort' && <LocationTab />}
      {tab === 'daten' && <DataTab />}
    </>
  )
}

function ShrinkTab() {
  const db = useDb()
  return (
    <Card title={<>Schwund-Pauschalen<Info text="Die Pauschale ist der Verlust, der normal ist – z. B. 4 von 100 Bechern gehen kaputt oder werden verschüttet. Sie gilt für alle Filialen und fließt automatisch in Bestand, Forecast, Bestellmenge und Warenabgleich ein. Die Filiale muss normalen Schwund nicht eintragen." /></>}>
      <div className="grid g3" style={{ gap: '0 36px' }}>
        {db.articles.map((a) => (
          <div key={a.id} className="row between" style={{ padding: '10px 0', borderTop: '1px solid var(--grid)' }}>
            <span className="strong">{a.name}</span>
            <span className="row" style={{ gap: 6 }}><NumInput width={70} step={0.5} value={db.settings.shrink[a.id] ?? 0} onChange={(v) => actions.setShrink(a.id, v)} /><span className="muted">%</span></span>
          </div>
        ))}
      </div>
    </Card>
  )
}

function PlanningTab() {
  const db = useDb()
  const s = db.settings
  const row = (label: string, hint: string, key: 'greenUntil' | 'yellowUntil' | 'bufferDays' | 'targetDays', unit: string, step = 1) => (
    <div className="row between" style={{ padding: '14px 0', borderTop: '1px solid var(--grid)' }}>
      <div><div className="strong">{label}</div><div className="small muted">{hint}</div></div>
      <div className="row"><NumInput value={s[key]} step={step} onChange={(v) => actions.updateSettings({ [key]: v })} /><span className="muted" style={{ width: 40 }}>{unit}</span></div>
    </div>
  )
  return (
    <div className="grid g2" style={{ alignItems: 'start' }}>
      <Card title="Ampel der Warenabgleich" i={0}>
        {row('Grün bis', 'Unerklärter Anteil bis zu diesem Wert gilt als unauffällig.', 'greenUntil', '%', 0.5)}
        {row('Gelb bis', 'Darüber bis zu diesem Wert: gelb. Noch höher: rot.', 'yellowUntil', '%', 0.5)}
      </Card>
      <Card title="Bestellplanung" i={1}>
        {row('Puffer', 'Spätester Bestelltag = Leer-Datum − Lieferzeit − Puffer.', 'bufferDays', 'Tage')}
        {row('Zielreichweite', 'So viele Tage soll eine Bestellung nach der Lieferung reichen.', 'targetDays', 'Tage')}
      </Card>
    </div>
  )
}

function ArticlesTab() {
  const db = useDb()
  const toast = useToast()
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState<Article>(blank('zentrale'))
  const suppliers = [...new Set(db.articles.filter((a) => a.source === 'extern').map((a) => a.supplier))]
  const set = (id: string, patch: Partial<Article>) => actions.updateArticle(id, patch)
  const used = (id: string) => db.recipes.some((r) => [r.cupId, r.spoonId, r.powderId, ...r.fixedToppings].includes(id))
  return (
    <Card title="Artikel, Toppings & Lieferzeiten" right={<Btn kind="primary" size="sm" onClick={() => { setDraft(blank('zentrale')); setAdding(true) }}>Artikel anlegen</Btn>}>
      <div className="table-wrap"><table className="tbl">
        <thead><tr><th>Name</th><th>Lieferant</th><th className="r">Packung</th><th className="r">Portion g</th><th className="r">Lieferzeit (Tage)</th><th className="r">€ netto / Pck.</th><th /></tr></thead>
        <tbody>
          {db.articles.map((a) => (
            <tr key={a.id}>
              <td><input className="input" style={{ width: 200 }} value={a.name} onChange={(e) => set(a.id, { name: e.target.value })} /></td>
              <td>{a.source === 'zentrale' ? <Pill tone="blue">FY</Pill> : <input className="input" style={{ width: 170 }} value={a.supplier} list="suppliers" onChange={(e) => set(a.id, { supplier: e.target.value })} />}</td>
              <td className="r"><NumInput width={64} value={a.packSize} min={0.1} step={a.unit === 'kg' ? 0.5 : 10} onChange={(v) => set(a.id, { packSize: v })} /> <span className="muted small">{a.unit}</span></td>
              <td className="r">{a.unit === 'kg' ? <NumInput width={64} value={a.portionGrams ?? 0} min={1} onChange={(v) => set(a.id, { portionGrams: v })} /> : <span className="faint">—</span>}</td>
              <td className="r"><NumInput width={58} value={a.leadTimeDays} min={0} onChange={(v) => set(a.id, { leadTimeDays: Math.round(v) })} /></td>
              <td className="r">{a.source === 'zentrale' ? <span className="faint small">Katalog</span> : <NumInput width={78} value={a.packPrice} step={0.5} onChange={(v) => set(a.id, { packPrice: v })} />}</td>
              <td className="r">{a.id.startsWith('x-') && !used(a.id) && <Btn kind="danger" size="sm" onClick={() => actions.removeArticle(a.id)}>Löschen</Btn>}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
      <datalist id="suppliers">{suppliers.map((s) => <option key={s} value={s} />)}</datalist>
      {adding && (
        <Modal onClose={() => setAdding(false)}>
          <h2>Neuer Artikel</h2>
          <div className="stack" style={{ marginTop: 16, gap: 16 }}>
            <div className="field"><label>Bezug</label><Segmented<Source> value={draft.source} onChange={(v) => setDraft(blank(v))} options={[{ value: 'zentrale', label: 'Vom Headquarter bezogen' }, { value: 'extern', label: 'Topping (extern)' }]} /></div>
            <div className="field"><label>Name</label><input className="input wide" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} autoFocus /></div>
            {draft.source === 'extern' && <div className="field"><label>Lieferant</label><input className="input wide" value={draft.supplier} list="suppliers" onChange={(e) => setDraft({ ...draft, supplier: e.target.value })} /></div>}
            <div className="row wrap">
              <div className="field"><label>Packung</label><NumInput value={draft.packSize} min={0.1} onChange={(v) => setDraft({ ...draft, packSize: v })} /></div>
              <div className="field"><label>Lieferzeit (Tage)</label><NumInput value={draft.leadTimeDays} onChange={(v) => setDraft({ ...draft, leadTimeDays: Math.round(v) })} /></div>
              <div className="field"><label>Preis netto (€)</label><NumInput value={draft.packPrice} onChange={(v) => setDraft({ ...draft, packPrice: v })} /></div>
            </div>
          </div>
          <div className="actions">
            <Btn onClick={() => setAdding(false)}>Abbrechen</Btn>
            <Btn kind="primary" disabled={!draft.name.trim() || !draft.supplier.trim()} onClick={() => {
              actions.addArticle({ ...draft, id: 'x-' + Date.now().toString(36), name: draft.name.trim(), category: draft.source === 'extern' ? 'Topping' : 'Zubehör', portionGrams: draft.unit === 'kg' ? draft.portionGrams ?? 20 : undefined })
              setAdding(false)
              toast(`${draft.name} angelegt – ${fmtEUR(draft.packPrice)} je Packung`)
            }}>Anlegen</Btn>
          </div>
        </Modal>
      )}
    </Card>
  )
}
function blank(source: Source): Article {
  return { id: '', name: '', category: source === 'extern' ? 'Topping' : 'Zubehör', source, supplier: source === 'zentrale' ? 'Headquarter' : '', unit: source === 'extern' ? 'kg' : 'Stück', packSize: source === 'extern' ? 1 : 100, portionGrams: source === 'extern' ? 20 : undefined, leadTimeDays: source === 'extern' ? 2 : 3, packPrice: 20 }
}

function RecipesTab() {
  const db = useDb()
  return (
    <div className="grid g2">
      {db.recipes.map((r, i) => (
        <Card key={r.id} i={i} title={r.name} right={<Pill>Größe</Pill>}>
          <div className="small muted" style={{ marginBottom: 10 }}>1 × {db.articles.find((a) => a.id === r.cupId)?.name} + 1 × {db.articles.find((a) => a.id === r.spoonId)?.name}</div>
          <div className="row" style={{ marginBottom: 12 }}><span>Yoghurt-Pulver</span><NumInput width={80} value={r.powderGrams} min={1} step={10} onChange={(v) => actions.updateRecipe(r.id, { powderGrams: v })} /><span className="muted">g</span></div>
          <div className="row" style={{ marginBottom: 12 }}><span>Verkaufspreis (brutto)</span><NumInput width={80} value={r.price} min={0} step={0.1} onChange={(v) => actions.updateRecipe(r.id, { price: v })} /><span className="muted">€</span></div>
          <p className="small muted">Toppings werden beim Verkauf frei gewählt (je Antippen 1 Portion, {fmtEUR(db.settings.toppingPrice)} je Portion).</p>
        </Card>
      ))}
    </div>
  )
}

function HolidaysTab() {
  const db = useDb()
  const [date, setDate] = useState('')
  const [name, setName] = useState('')
  const [state, setState] = useState(db.stores[0].state)
  const y = new Date().getFullYear()
  const states = [...new Set(db.stores.map((s) => s.state))]
  const list = [...legalHolidays(state, y), ...legalHolidays(state, y + 1)]
  return (
    <div className="stack">
      <div className="note"><span>ℹ️</span><div><b>Gesetzliche Feiertage werden lokal berechnet</b> (feste und osterabhängige Feiertage je Bundesland, ohne externe Schnittstelle). Jede Filiale hat ein Bundesland. Mariä Himmelfahrt gilt in Bayern nur in überwiegend katholischen Gemeinden – bei Bedarf unten als Sondertag eintragen.</div></div>
      <Card title="Gesetzliche Feiertage" right={<select className="select" value={state} onChange={(e) => setState(e.target.value as typeof state)} aria-label="Bundesland">{states.map((s) => <option key={s} value={s}>{STATE_NAMES[s]}</option>)}</select>}>
        <div className="grid g3" style={{ gap: '0 30px' }}>
          {list.map((h) => <div key={h.date} className="row between" style={{ padding: '8px 0', borderTop: '1px solid var(--grid)' }}><span className="strong">{h.name}</span><span className="muted">{fmtDate(h.date)}</span></div>)}
        </div>
      </Card>
      <Card title="Neuer Sondertag (Event, Stadtfest …) – gilt für alle Filialen">
        <div className="row wrap" style={{ alignItems: 'flex-end' }}>
          <div className="field"><label>Datum</label><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="field" style={{ flex: 1, minWidth: 240 }}><label>Name</label><input className="input wide" value={name} placeholder="z. B. Stadtfest, Messe" onChange={(e) => setName(e.target.value)} /></div>
          <Btn kind="primary" disabled={!date || !name.trim()} onClick={() => { actions.saveSpecialDay({ id: 's' + Date.now().toString(36), date, name: name.trim(), special: true }); setDate(''); setName('') }}>Hinzufügen</Btn>
        </div>
        {db.settings.specialDays.length > 0 && (
          <table className="tbl" style={{ marginTop: 14 }}><tbody>
            {db.settings.specialDays.map((h) => (
              <tr key={h.id}>
                <td><input type="date" className="input" value={h.date} onChange={(e) => e.target.value && actions.saveSpecialDay({ ...h, date: e.target.value })} /></td>
                <td><input className="input" style={{ width: 340 }} value={h.name} onChange={(e) => actions.saveSpecialDay({ ...h, name: e.target.value })} /></td>
                <td className="r"><Btn kind="danger" size="sm" onClick={() => actions.removeSpecialDay(h.id)}>Löschen</Btn></td>
              </tr>
            ))}
          </tbody></table>
        )}
      </Card>
    </div>
  )
}

function SchoolTab() {
  const db = useDb()
  const [state, setState] = useState(db.stores[0].state)
  const states = [...new Set(db.stores.map((s) => s.state))]
  const list = db.settings.schoolHolidays.filter((h) => h.state === state).sort((a, b) => a.from.localeCompare(b.from))
  return (
    <div className="stack">
      <div className="note"><span>⚠️</span><div><b>Bitte Daten prüfen.</b> Die Schulferien 2026 und 2027 sind nach bestem Wissen vorbefüllt und frei bearbeitbar. Sie fließen wie Feiertage in Forecast und Personalbedarf ein.</div></div>
      <Card title="Schulferien je Bundesland" right={<div className="row"><select className="select" value={state} onChange={(e) => setState(e.target.value as typeof state)} aria-label="Bundesland">{states.map((s) => <option key={s} value={s}>{STATE_NAMES[s]}</option>)}</select><Btn kind="primary" size="sm" onClick={() => actions.saveSchoolHoliday({ id: 'sf' + Date.now().toString(36), state, name: 'Neue Ferien', from: '', to: '' })}>Ferien hinzufügen</Btn></div>}>
        <table className="tbl">
          <thead><tr><th>Name</th><th>Von</th><th>Bis</th><th /></tr></thead>
          <tbody>
            {list.map((h) => (
              <tr key={h.id}>
                <td><input className="input" style={{ width: 220 }} value={h.name} onChange={(e) => actions.saveSchoolHoliday({ ...h, name: e.target.value })} /></td>
                <td><input type="date" className="input" value={h.from} onChange={(e) => actions.saveSchoolHoliday({ ...h, from: e.target.value })} /></td>
                <td><input type="date" className="input" value={h.to} onChange={(e) => actions.saveSchoolHoliday({ ...h, to: e.target.value })} /></td>
                <td className="r"><Btn kind="danger" size="sm" onClick={() => actions.removeSchoolHoliday(h.id)}>Löschen</Btn></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

function CompanyTab() {
  const db = useDb()
  const c = db.settings.company
  const f = (label: string, k: keyof typeof c, w = 280) => <div className="field"><label>{label}</label><input className="input" style={{ width: w }} value={c[k]} onChange={(e) => actions.updateCompany({ [k]: e.target.value })} /></div>
  return (
    <Card title="Firmendaten des HQ (Rechnungsaussteller)">
      <div className="note" style={{ marginBottom: 16 }}><span>⚠️</span><div>Platzhalter: Hier stehen keine echten Firmendaten. Bitte ergänzen – sie erscheinen auf allen neuen Rechnungen (bestehende Rechnungen bleiben unverändert).</div></div>
      <div className="row wrap" style={{ alignItems: 'flex-end', gap: 16 }}>
        {f('Firmenname', 'name', 320)}{f('Straße und Hausnummer', 'street')}{f('PLZ und Ort', 'zipCity')}{f('Steuernummer', 'taxNumber')}{f('USt-IdNr.', 'vatId')}
        {f('Bank', 'bankName')}{f('IBAN', 'iban', 300)}{f('BIC', 'bic', 160)}
      </div>
      <div className="row" style={{ marginTop: 18 }}><div className="field"><label>Zahlungsziel (Tage)</label><NumInput width={90} value={db.settings.paymentDays} onChange={(v) => actions.updateSettings({ paymentDays: Math.max(0, Math.round(v)) })} /></div></div>
    </Card>
  )
}

function NumberTab() {
  const db = useDb()
  const toast = useToast()
  const cfg = db.settings.invoiceNo
  const [prefix, setPrefix] = useState(cfg.prefix)
  const used = db.invoices.length ? Math.max(...db.invoices.map((i) => Number(i.number.replace(/\D+/g, ' ').trim().split(' ').pop()) || 0)) : 0
  const sample = prefix.replace('{JJJJ}', String(new Date().getFullYear())) + String(cfg.next).padStart(cfg.pad, '0')
  return (
    <Card title="Rechnungsnummernkreis">
      <p className="muted" style={{ maxWidth: 640, marginBottom: 14 }}>Rechnungen und Stornorechnungen werden lückenlos fortlaufend nummeriert. {'{JJJJ}'} steht für das Jahr des Rechnungsdatums. Die nächste Nummer kann nicht unter die höchste bereits vergebene Nummer ({used}) gesetzt werden.</p>
      <div className="row wrap" style={{ alignItems: 'flex-end', gap: 16 }}>
        <div className="field"><label>Präfix</label><input className="input" style={{ width: 200 }} value={prefix} onChange={(e) => setPrefix(e.target.value)} onBlur={() => actions.setInvoiceNumbering(prefix, cfg.next, cfg.pad)} /></div>
        <div className="field"><label>Nächste Nummer</label><NumInput width={100} min={used + 1} value={cfg.next} onChange={(v) => actions.setInvoiceNumbering(prefix, Math.round(v), cfg.pad)} /></div>
        <div className="field"><label>Stellen</label><NumInput width={70} min={1} value={cfg.pad} onChange={(v) => actions.setInvoiceNumbering(prefix, cfg.next, Math.min(8, Math.max(1, Math.round(v))))} /></div>
        <Pill tone="blue">nächste Rechnung: {sample}</Pill>
      </div>
      <div style={{ marginTop: 14 }}><Btn size="sm" onClick={() => { actions.setInvoiceNumbering(prefix, cfg.next, cfg.pad); toast('Nummernkreis gespeichert') }}>Präfix übernehmen</Btn></div>
    </Card>
  )
}

function FranchiseTab() {
  const db = useDb()
  return (
    <Card title="Franchisenehmer (Rechnungsempfänger)">
      <div className="note" style={{ marginBottom: 14 }}><span>⚠️</span><div>Adressen und Firmendaten der Franchisenehmer sind nicht bekannt: Es sind Platzhalter („bitte ergänzen“). Bitte hier pflegen.</div></div>
      <div className="table-wrap"><table className="tbl">
        <thead><tr><th>Filiale</th><th>Name / Firma</th><th>Straße</th><th>PLZ, Ort</th><th>USt-IdNr.</th></tr></thead>
        <tbody>
          {db.stores.map((s) => {
            const set = (p: Partial<typeof s.franchise>) => actions.updateStore(s.id, { franchise: { ...s.franchise, ...p } })
            return (
              <tr key={s.id}>
                <td className="strong">{s.name}</td>
                <td><input className="input" style={{ width: 280 }} value={s.franchise.name} onChange={(e) => set({ name: e.target.value })} /></td>
                <td><input className="input" style={{ width: 160 }} value={s.franchise.street} onChange={(e) => set({ street: e.target.value })} /></td>
                <td><input className="input" style={{ width: 160 }} value={s.franchise.zipCity} onChange={(e) => set({ zipCity: e.target.value })} /></td>
                <td><input className="input" style={{ width: 150 }} value={s.franchise.vatId} onChange={(e) => set({ vatId: e.target.value })} /></td>
              </tr>
            )
          })}
        </tbody>
      </table></div>
    </Card>
  )
}

function LocationTab() {
  const db = useDb()
  const toast = useToast()
  useWeatherStatus()
  return (
    <Card title="Standort & Wetter" right={weatherAvailable() ? <Pill tone="green">Wetterdaten aktuell</Pill> : <Pill tone="yellow">Wetterdaten gerade nicht verfügbar</Pill>}>
      <p className="muted" style={{ marginBottom: 16, maxWidth: 760 }}>Der Standort bestimmt, welches Wetter in den Forecast einfließt (Temperatur, Sonne, Regen). Voreinstellung: die Stadt der Filiale. Städte mit mehreren Filialen werden nur einmal abgefragt, alle Standorte in einer einzigen Anfrage. Wetterdaten: Open-Meteo.</p>
      <div className="table-wrap"><table className="tbl">
        <thead><tr><th>Filiale</th><th>Stadt</th><th>Bundesland</th><th className="r">Breite</th><th className="r">Länge</th></tr></thead>
        <tbody>
          {db.stores.map((s) => {
            const l = db.settings.locations[s.id]
            return (
              <tr key={s.id}>
                <td className="strong">{s.name}</td><td>{s.city}</td><td>{STATE_NAMES[s.state]}</td>
                <td className="r"><NumInput width={96} step={0.01} min={-90} value={l.lat} onChange={(v) => actions.setLocation(s.id, v, l.lon)} /></td>
                <td className="r"><NumInput width={96} step={0.01} min={-180} value={l.lon} onChange={(v) => actions.setLocation(s.id, l.lat, v)} /></td>
              </tr>
            )
          })}
        </tbody>
      </table></div>
      <div style={{ marginTop: 18 }}><Btn kind="glass" onClick={async () => { const ok = await refreshWeather(Object.values(db.settings.locations), true); toast(ok ? 'Wetterdaten aktualisiert' : 'Wetterdaten gerade nicht verfügbar', { tone: ok ? 'ok' : 'warn' }) }}>Wetterdaten jetzt laden</Btn></div>
      <p className="faint small" style={{ marginTop: 14 }}>Wetterdaten: Open-Meteo (open-meteo.com), CC BY 4.0. Standortänderungen wirken auf neue Prognosen; die Demo-Historie bleibt unverändert.</p>
    </Card>
  )
}

function DataTab() {
  const toast = useToast()
  const [confirm, setConfirm] = useState(false)
  return (
    <Card title="Demodaten">
      <p className="muted" style={{ maxWidth: 600 }}>Der Prototyp speichert alle Daten im Browser (localStorage). Die Demodaten (13 Monate Verkäufe, Bestände, Rechnungen, Dienstpläne) werden bei jedem Start deterministisch erzeugt; gespeichert werden nur deine Änderungen. Beim Zurücksetzen gehen sie verloren.</p>
      <div style={{ marginTop: 16 }}><Btn kind="danger" onClick={() => setConfirm(true)}>Demodaten zurücksetzen</Btn></div>
      {confirm && (
        <Modal onClose={() => setConfirm(false)}>
          <h2>Demodaten zurücksetzen?</h2>
          <p className="muted" style={{ marginTop: 8 }}>Alle Änderungen und Buchungen werden durch frische Demodaten ersetzt.</p>
          <div className="actions">
            <Btn onClick={() => setConfirm(false)}>Abbrechen</Btn>
            <Btn kind="danger" onClick={() => { actions.resetDemo(); setConfirm(false); toast('Demodaten zurückgesetzt') }}>Zurücksetzen</Btn>
          </div>
        </Modal>
      )}
    </Card>
  )
}
