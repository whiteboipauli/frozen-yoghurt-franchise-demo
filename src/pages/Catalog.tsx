import { useState } from 'react'
import { actions, useDb } from '../data/repository'
import type { Article } from '../data/types'
import { fmtEUR } from '../lib/format'
import { packLabel, VAT_NOTE } from '../logic/invoice'
import { ProductArt } from '../icons'
import { readImage } from '../lib/image'
import { Icon } from '../icons'
import { Btn, Card, Info, Modal, NumInput, PageHead, Pill, Switch, useToast } from '../ui/kit'

/** Katalog des HQ: Artikel, die Franchisenehmer bei der Zentrale beziehen */
export function CatalogTable() {
  const db = useDb()
  const toast = useToast()
  const [adding, setAdding] = useState(false)
  const [d, setD] = useState({ name: '', sku: '', packSize: 100, unit: 'Stück' as 'Stück' | 'kg', price: 10, vat: 19, lead: 3 })
  const items = db.articles.filter((a) => a.source === 'zentrale')
  const set = (id: string, patch: Partial<Article>) => actions.updateArticle(id, patch)
  return (
    <Card title="Katalog des HQ" tour="catalog" right={<Btn kind="primary" size="sm" icon="plus" onClick={() => setAdding(true)}>Artikel anlegen</Btn>}>
      <div className="note" style={{ marginBottom: 14 }}><Icon name="warn" /><div><b>{VAT_NOTE}.</b> Demo-Annahme: 19 % für Verpackung und Zubehör, 7 % für Lebensmittel (Yoghurt-Pulver). Toppings kaufen die Läden weiterhin selbst bei ihren Lieferanten.</div></div>
      <div className="table-wrap"><table className="tbl">
        <thead><tr><th>Artikelnr.</th><th>Bezeichnung</th><th>Verpackungseinheit</th><th className="r">Netto € / Einheit</th><th className="r">USt %</th><th className="r">Lieferzeit (Tage)</th><th className="r">Verfügbar</th></tr></thead>
        <tbody>
          {items.map((a) => (
            <tr key={a.id}>
              <td><input className="input" style={{ width: 110 }} value={a.sku ?? ''} onChange={(e) => set(a.id, { sku: e.target.value })} /></td>
              <td><input className="input" style={{ width: 200 }} value={a.name} onChange={(e) => set(a.id, { name: e.target.value })} /></td>
              <td><NumInput width={64} value={a.packSize} min={1} step={a.unit === 'kg' ? 1 : 10} onChange={(v) => set(a.id, { packSize: v })} /> <span className="muted small">{packLabel(a)}</span></td>
              <td className="r"><NumInput width={84} value={a.packPrice} step={0.5} onChange={(v) => set(a.id, { packPrice: v })} /></td>
              <td className="r"><NumInput width={58} value={a.vatRate ?? 19} step={1} onChange={(v) => set(a.id, { vatRate: v })} /></td>
              <td className="r"><NumInput width={58} value={a.leadTimeDays} onChange={(v) => set(a.id, { leadTimeDays: Math.round(v) })} /></td>
              <td className="r"><Switch on={a.available !== false} onChange={(v) => set(a.id, { available: v })} label={`${a.name} verfügbar`} /></td>
            </tr>
          ))}
        </tbody>
      </table></div>
      {adding && (
        <Modal onClose={() => setAdding(false)}>
          <h2>Neuer Katalogartikel</h2>
          <div className="stack" style={{ marginTop: 14, gap: 14 }}>
            <div className="row wrap"><div className="field"><label>Artikelnummer</label><input className="input" value={d.sku} onChange={(e) => setD({ ...d, sku: e.target.value })} placeholder="FY-2050" /></div><div className="field" style={{ flex: 1 }}><label>Bezeichnung</label><input className="input wide" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} autoFocus /></div></div>
            <div className="row wrap">
              <div className="field"><label>{d.unit === 'kg' ? 'kg je Karton' : `Packungsgröße (${d.unit})`}</label><NumInput value={d.packSize} min={1} onChange={(v) => setD({ ...d, packSize: v })} /></div>
              <div className="field"><label>Netto €</label><NumInput value={d.price} step={0.5} onChange={(v) => setD({ ...d, price: v })} /></div>
              <div className="field"><label>USt %</label><NumInput value={d.vat} onChange={(v) => setD({ ...d, vat: v })} /></div>
              <div className="field"><label>Lieferzeit</label><NumInput value={d.lead} onChange={(v) => setD({ ...d, lead: Math.round(v) })} /></div>
            </div>
            <p className="small muted">Neue Artikel erscheinen auch im Bestand der Filialen (zunächst ohne Verbrauch).</p>
          </div>
          <div className="actions"><Btn onClick={() => setAdding(false)}>Abbrechen</Btn><Btn kind="primary" disabled={!d.name.trim() || !d.sku.trim()} onClick={() => {
            actions.addArticle({ id: 'x-' + Date.now().toString(36), sku: d.sku.trim(), name: d.name.trim(), category: 'Zubehör', source: 'zentrale', supplier: 'Zentrale', unit: d.unit, packSize: d.packSize, packPrice: d.price, vatRate: d.vat, available: true, leadTimeDays: d.lead })
            setAdding(false); toast(`${d.name} angelegt – ${fmtEUR(d.price)} netto`)
          }}>Anlegen</Btn></div>
        </Modal>
      )}
    </Card>
  )
}
export function CatalogPage() {
  const db = useDb()
  const toast = useToast()
  const [edit, setEdit] = useState<string | null>(null)
  const items = db.articles.filter((a) => a.source === 'zentrale')
  const cur = items.find((a) => a.id === edit)
  return (
    <>
      <PageHead title="Katalog" hint={<>Was die Läden bei der Zentrale bestellen können – mit Bild, Preis, Steuersatz und Lieferzeit.<Info text="Preise sind Nettopreise je Verpackungseinheit. Änderungen gelten für neue Bestellungen; erstellte Rechnungen bleiben unverändert. Jeder Artikel hat einen Bild-Platz: Ein echtes Produktfoto ersetzt die Illustration." /></>} right={<Pill>Alle Werte Demo</Pill>} />
      <div className="cat-grid cat-hq" data-tour="catalog-hq">
        {items.map((a, i) => (
          <button key={a.id} className={`glass cat-tile card in clicky ${a.available === false ? 'off' : ''}`} style={{ ['--i' as string]: Math.min(i, 10) * 0.4 }} onClick={() => setEdit(a.id)} aria-label={`${a.name} bearbeiten`}>
            <div className="cat-ico"><ProductArt article={a} size={128} /></div>
            <span className="faint small">{a.sku}</span>
            <h3>{a.name}</h3>
            <p className="muted small">{packLabel(a)} · Lieferzeit {a.leadTimeDays} Tage</p>
            <div className="cat-price"><b>{fmtEUR(a.packPrice)}</b><span> netto · {a.vatRate ?? 19} % USt</span></div>
            {a.available === false ? <Pill>derzeit nicht verfügbar</Pill> : <Pill tone="green">bestellbar</Pill>}
          </button>
        ))}
        <button className="glass cat-tile card in clicky cat-add" onClick={() => setEdit('neu')}><Icon name="plus" size={34} /><b>Artikel anlegen</b></button>
      </div>
      {edit === 'neu' && <NewItem onClose={() => setEdit(null)} />}
      {cur && (
        <Modal onClose={() => setEdit(null)} wide>
          <div className="row" style={{ gap: 18, alignItems: 'flex-start' }}>
            <div style={{ textAlign: 'center' }}>
              <ProductArt article={cur} size={150} />
              <label className="btn glass sm" style={{ cursor: 'pointer', marginTop: 10 }}>Produktfoto hochladen<input type="file" accept="image/*" hidden onChange={async (ev) => { const f = ev.target.files?.[0]; if (f) try { actions.updateArticle(cur.id, { imageUrl: await readImage(f, 360) }); toast('Produktfoto gespeichert') } catch { toast('Das Bild konnte nicht gelesen werden') } }} /></label>
              {cur.imageUrl && <Btn size="sm" kind="ghost" onClick={() => actions.updateArticle(cur.id, { imageUrl: undefined })}>Zur Illustration zurück</Btn>}
            </div>
            <div className="stack" style={{ gap: 12, flex: 1 }}>
              <h2>{cur.name}</h2>
              <div className="row wrap">
                <div className="field"><label>Artikelnummer</label><input className="input" style={{ width: 120 }} value={cur.sku ?? ''} onChange={(e) => actions.updateArticle(cur.id, { sku: e.target.value })} /></div>
                <div className="field" style={{ flex: 1 }}><label>Bezeichnung</label><input className="input wide" value={cur.name} onChange={(e) => actions.updateArticle(cur.id, { name: e.target.value })} /></div>
              </div>
              <div className="row wrap">
                <div className="field"><label>{cur.unit === 'kg' ? 'kg je Karton' : `Packung (${cur.unit})`}</label><NumInput width={84} value={cur.packSize} min={1} step={cur.unit === 'kg' ? 1 : 10} onChange={(v) => actions.updateArticle(cur.id, { packSize: v })} /></div>
                <div className="field"><label>Netto €</label><NumInput width={84} value={cur.packPrice} step={0.5} onChange={(v) => actions.updateArticle(cur.id, { packPrice: v })} /></div>
                <div className="field"><label>USt %</label><NumInput width={70} value={cur.vatRate ?? 19} onChange={(v) => actions.updateArticle(cur.id, { vatRate: v })} /></div>
                <div className="field"><label>Lieferzeit (Tage)</label><NumInput width={70} value={cur.leadTimeDays} onChange={(v) => actions.updateArticle(cur.id, { leadTimeDays: Math.round(v) })} /></div>
              </div>
              <label className="row"><Switch on={cur.available !== false} onChange={(v) => actions.updateArticle(cur.id, { available: v })} label="bestellbar" /><span>im Katalog bestellbar</span></label>
            </div>
          </div>
          <div className="actions"><Btn kind="primary" onClick={() => setEdit(null)}>Fertig</Btn></div>
        </Modal>
      )}
    </>
  )
}

function NewItem({ onClose }: { onClose: () => void }) {
  const toast = useToast()
  const [d, setD] = useState({ name: '', sku: '', packSize: 100, unit: 'Stück' as 'Stück' | 'kg', price: 10, vat: 19, lead: 3 })
  return (
    <Modal onClose={onClose}>
      <h2>Neuer Katalogartikel</h2>
      <div className="stack" style={{ marginTop: 14, gap: 14 }}>
        <div className="row wrap"><div className="field"><label>Artikelnummer</label><input className="input" value={d.sku} onChange={(e) => setD({ ...d, sku: e.target.value })} placeholder="FY-2050" /></div><div className="field" style={{ flex: 1 }}><label>Bezeichnung</label><input className="input wide" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} autoFocus /></div></div>
        <div className="row wrap">
          <div className="field"><label>{d.unit === 'kg' ? 'kg je Karton' : `Packungsgröße (${d.unit})`}</label><NumInput value={d.packSize} min={1} onChange={(v) => setD({ ...d, packSize: v })} /></div>
          <div className="field"><label>Netto €</label><NumInput value={d.price} step={0.5} onChange={(v) => setD({ ...d, price: v })} /></div>
          <div className="field"><label>USt %</label><NumInput value={d.vat} onChange={(v) => setD({ ...d, vat: v })} /></div>
          <div className="field"><label>Lieferzeit</label><NumInput value={d.lead} onChange={(v) => setD({ ...d, lead: Math.round(v) })} /></div>
        </div>
        <p className="small muted">Neue Artikel erscheinen auch im Bestand der Läden (zunächst ohne Verbrauch). Das Produktfoto kannst du danach hochladen.</p>
      </div>
      <div className="actions"><Btn onClick={onClose}>Abbrechen</Btn><Btn kind="primary" disabled={!d.name.trim() || !d.sku.trim()} onClick={() => {
        actions.addArticle({ id: 'x-' + Date.now().toString(36), sku: d.sku.trim(), name: d.name.trim(), category: 'Zubehör', source: 'zentrale', supplier: 'Zentrale', unit: d.unit, packSize: d.packSize, packPrice: d.price, vatRate: d.vat, available: true, leadTimeDays: d.lead })
        onClose(); toast(`${d.name} angelegt – ${fmtEUR(d.price)} netto`)
      }}>Anlegen</Btn></div>
    </Modal>
  )
}
