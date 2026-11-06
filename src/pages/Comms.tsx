import { useState } from 'react'
import { actions, useDb } from '../data/repository'
import { KNOW_CATS, type Campaign, type KnowEntry } from '../data/types'
import { addDays, todayISO } from '../lib/date'
import { fmtDate, fmtEUR } from '../lib/format'
import { download } from '../logic/adapters'
import { Icon } from '../icons'
import { ArtIcon } from '../ui/art'
import { Btn, Card, Empty, Modal, PageHead, Pill, Segmented, useToast } from '../ui/kit'

/* ============ Pinnwand ============ */
export function PinnwandPage({ storeId }: { storeId: string }) {
  const db = useDb()
  const posts = db.posts.filter((p) => p.to.length === 0 || p.to.includes(storeId)).sort((a, b) => Number(!!a.readBy[storeId]) - Number(!!b.readBy[storeId]) || b.createdOn.localeCompare(a.createdOn))
  return (
    <>
      <PageHead title="Pinnwand" hint="Nachrichten vom HQ an dich. Bitte mit „Gelesen“ bestätigen – das HQ sieht, wer die Nachricht bekommen hat." />
      <div className="stack" data-tour="pinnwand">
        {posts.length === 0 && <Card><Empty icon="note">Keine Nachrichten vom HQ.</Empty></Card>}
        {posts.map((p, i) => {
          const read = p.readBy[storeId]
          return (
            <Card key={p.id} i={i} className={`post ${read ? 'read' : ''}`} title={<>{!read && <i className={`news-dot ${p.important ? 'imp' : ''}`} />}{p.title}</>}
              right={<span className="row" style={{ gap: 8 }}>{p.important && <Pill tone="red">wichtig</Pill>}<span className="faint small">{fmtDate(p.createdOn)}</span></span>}>
              <p className="post-text">{p.text}</p>
              <div className="row" style={{ marginTop: 12 }}>
                {read ? <Pill tone="green">Gelesen am {fmtDate(read)}</Pill> : <Btn kind="cta" size="sm" icon="check" onClick={() => actions.readPost(p.id, storeId)}>Gelesen</Btn>}
              </div>
            </Card>
          )
        })}
      </div>
    </>
  )
}

export function PinnwandHqPage() {
  const db = useDb()
  const toast = useToast()
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [important, setImportant] = useState(false)
  const [all, setAll] = useState(true)
  const [sel, setSel] = useState<string[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const send = () => {
    actions.addPost({ title: title.trim(), text: text.trim(), important, to: all ? [] : sel })
    setTitle(''); setText(''); setImportant(false); setAll(true); setSel([])
    toast('Nachricht an die Pinnwand gesendet')
  }
  return (
    <>
      <PageHead title="Pinnwand" hint="Schreibe Nachrichten an alle oder ausgewählte Läden. Die Läden sehen sie in „Neu vom HQ“ und über die Glocke und bestätigen mit „Gelesen“." />
      <div className="stack">
        <Card title="Neue Nachricht" i={0} tour="post-form">
          <div className="stack" style={{ gap: 12 }}>
            <div className="field"><label>Titel</label><input className="input wide" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z. B. Neue Preisliste ab Montag" /></div>
            <div className="field"><label>Text</label><textarea className="input" rows={3} value={text} onChange={(e) => setText(e.target.value)} /></div>
            <div className="row wrap" style={{ gap: 18 }}>
              <Segmented value={all ? 'alle' : 'wahl'} onChange={(v) => setAll(v === 'alle')} w={150} options={[{ value: 'alle', label: 'An alle Läden' }, { value: 'wahl', label: 'Auswahl' }]} />
              <label className="row small" style={{ cursor: 'pointer' }}><input type="checkbox" checked={important} onChange={(e) => setImportant(e.target.checked)} /> als wichtig markieren</label>
            </div>
            {!all && (
              <div className="chips">
                {db.stores.map((s) => <button key={s.id} className="chip sm" aria-pressed={sel.includes(s.id)} onClick={() => setSel((x) => (x.includes(s.id) ? x.filter((i) => i !== s.id) : [...x, s.id]))}>{s.name}</button>)}
              </div>
            )}
            <div className="row"><Btn kind="cta" icon="send" disabled={!title.trim() || !text.trim() || (!all && !sel.length)} onClick={send}>Nachricht senden</Btn></div>
          </div>
        </Card>
        <Card title="Gesendete Nachrichten" i={1}>
          {db.posts.map((p) => {
            const targets = p.to.length ? db.stores.filter((s) => p.to.includes(s.id)) : db.stores
            const read = targets.filter((s) => p.readBy[s.id])
            const open = openId === p.id
            return (
              <div key={p.id} className="post-hq">
                <button className="row between wrap" onClick={() => setOpenId(open ? null : p.id)} aria-expanded={open}>
                  <span><b>{p.title}</b> {p.important && <Pill tone="red">wichtig</Pill>}<span className="faint small"> · {fmtDate(p.createdOn)} · {p.to.length ? `${p.to.length} ausgewählte Läden` : 'an alle Läden'}</span></span>
                  <Pill tone={read.length === targets.length ? 'green' : 'yellow'}>{read.length} von {targets.length} gelesen</Pill>
                </button>
                {open && (
                  <div className="post-reads">
                    <p className="muted">{p.text}</p>
                    <div className="grid g2" style={{ gap: 6 }}>
                      {targets.map((s) => <div key={s.id} className="row between small"><span>{s.name}</span>{p.readBy[s.id] ? <span className="pos">gelesen am {fmtDate(p.readBy[s.id])}</span> : <span className="faint">noch nicht gelesen</span>}</div>)}
                    </div>
                    <Btn size="sm" kind="danger" style={{ marginTop: 10 }} onClick={() => { actions.removePost(p.id); toast('Nachricht gelöscht') }}>Nachricht löschen</Btn>
                  </div>
                )}
              </div>
            )
          })}
        </Card>
      </div>
    </>
  )
}

/* ============ Aktionen ============ */
const period = (c: Campaign) => `${fmtDate(c.from)} – ${fmtDate(c.to)}`
const svgOf = (c: Campaign) => `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080"><rect width="1080" height="1080" fill="#f0f6ff"/><circle cx="880" cy="200" r="190" fill="#d6e8ff"/><text x="80" y="520" font-family="Helvetica,Arial,sans-serif" font-size="84" font-weight="800" fill="#0a3f8f">${c.title.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text><text x="80" y="620" font-family="Helvetica,Arial,sans-serif" font-size="44" fill="#2b4f86">${period(c)}</text><text x="80" y="980" font-family="Helvetica,Arial,sans-serif" font-size="40" font-weight="700" fill="#0a5fcf">FY</text></svg>`

function Social({ c }: { c: Campaign }) {
  const toast = useToast()
  return (
    <div className="social">
      <div className="social-img" aria-label="Bild-Platz für Social Media"><span>Bild-Platz</span><b>{c.title}</b></div>
      <div className="social-txt">
        <div className="cap">Vorlage für Social Media</div>
        <p>{c.social}</p>
        <div className="row wrap" style={{ gap: 8 }}>
          <Btn size="sm" kind="glass" icon="copy" onClick={() => { void navigator.clipboard?.writeText(c.social); toast('Text kopiert') }}>Text kopieren</Btn>
          <Btn size="sm" kind="glass" icon="download" onClick={() => download(`aktion-${c.id}.svg`, svgOf(c), 'image/svg+xml')}>Bild herunterladen</Btn>
          <Btn size="sm" kind="glass" icon="download" onClick={() => download(`aktion-${c.id}.txt`, c.social, 'text/plain;charset=utf-8')}>Text (.txt)</Btn>
        </div>
      </div>
    </div>
  )
}

export function CampaignsPage({ hq, storeId }: { hq?: boolean; storeId?: string }) {
  const db = useDb()
  const toast = useToast()
  const today = todayISO()
  const list = [...db.campaigns].filter((c) => (hq ? !c.storeId : !c.storeId || c.storeId === storeId) && (hq || c.to >= today)).sort((a, b) => a.from.localeCompare(b.from))
  const blank = (): Omit<Campaign, 'id'> => ({ title: '', text: '', from: addDays(today, 14), to: addDays(today, 28), articleIds: [], extraPct: 20, social: '' })
  const [f, setF] = useState<(Omit<Campaign, 'id'> & { id?: string }) | null>(null)
  const arts = db.articles
  const [own, setOwn] = useState<{ title: string; from: string; to: string; price: string; text: string } | null>(null)
  return (
    <>
      <PageHead title="Aktionen" hint={hq ? 'Lege Aktionen mit Zeitraum, betroffenen Artikeln und erwarteter Mehrmenge an. Die Bestellvorschläge der Läden berücksichtigen sie rechtzeitig vorher.' : 'Anstehende Aktionen des HQ. Die Bestellvorschläge berücksichtigen den erwarteten Mehrverbrauch schon vor dem Start.'}
        right={hq ? <Btn kind="primary" size="sm" icon="plus" onClick={() => setF(blank())}>Neue Aktion</Btn> : storeId ? <Btn kind="primary" size="sm" icon="plus" onClick={() => setOwn({ title: '', from: today, to: addDays(today, 14), price: '', text: '' })}>Eigene Aktion anlegen</Btn> : undefined} />
      {own && (
        <Modal onClose={() => setOwn(null)}>
          <h2>Eigene Aktion</h2>
          <div className="field-grid">
            <div className="field"><label>Titel</label><input className="input wide" value={own.title} onChange={(e) => setOwn({ ...own, title: e.target.value })} autoFocus /></div>
            <div className="row wrap" style={{ gap: 12 }}><div className="field"><label>Von</label><input type="date" className="input" value={own.from} onChange={(e) => setOwn({ ...own, from: e.target.value })} /></div><div className="field"><label>Bis</label><input type="date" className="input" min={own.from} value={own.to} onChange={(e) => setOwn({ ...own, to: e.target.value })} /></div><div className="field"><label>Preis (€)</label><input className="input" inputMode="decimal" style={{ width: 110 }} value={own.price} onChange={(e) => setOwn({ ...own, price: e.target.value })} /></div></div>
            <div className="field"><label>Hinweis</label><textarea className="input" rows={2} value={own.text} onChange={(e) => setOwn({ ...own, text: e.target.value })} /></div>
          </div>
          <div className="actions"><Btn onClick={() => setOwn(null)}>Abbrechen</Btn><Btn kind="primary" icon="haken" disabled={!own.title.trim() || own.to < own.from} onClick={() => { actions.saveCampaign({ title: own.title.trim(), text: own.text.trim(), from: own.from, to: own.to, articleIds: [], extraPct: 0, social: '', storeId, price: parseFloat(own.price.replace(',', '.')) || undefined }); setOwn(null); toast('Aktion gespeichert') }}>Speichern</Btn></div>
        </Modal>
      )}
      <div className="stack" data-tour="campaigns">
        {f && (
          <Card title={f.id ? 'Aktion bearbeiten' : 'Neue Aktion'} i={0}>
            <div className="stack" style={{ gap: 12 }}>
              <div className="field"><label>Titel</label><input className="input wide" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
              <div className="field"><label>Beschreibung</label><textarea className="input" rows={2} value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} /></div>
              <div className="row wrap" style={{ gap: 16, alignItems: 'flex-end' }}>
                <div className="field"><label>Von</label><input type="date" className="input" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></div>
                <div className="field"><label>Bis</label><input type="date" className="input" value={f.to} min={f.from} onChange={(e) => setF({ ...f, to: e.target.value })} /></div>
                <div className="field"><label>Erwartete Mehrmenge (%)</label><input type="number" className="input" style={{ width: 120 }} value={f.extraPct} onChange={(e) => setF({ ...f, extraPct: Number(e.target.value) })} /></div>
              </div>
              <div className="field"><label>Betroffene Artikel</label>
                <div className="chips">{arts.map((a) => <button key={a.id} className="chip sm" aria-pressed={f.articleIds.includes(a.id)} onClick={() => setF({ ...f, articleIds: f.articleIds.includes(a.id) ? f.articleIds.filter((x) => x !== a.id) : [...f.articleIds, a.id] })}>{a.name}</button>)}</div></div>
              <div className="field"><label>Text für Social Media</label><textarea className="input" rows={2} value={f.social} onChange={(e) => setF({ ...f, social: e.target.value })} /></div>
              <div className="row"><Btn onClick={() => setF(null)}>Abbrechen</Btn><Btn kind="cta" disabled={!f.title.trim() || !f.articleIds.length || f.to < f.from} onClick={() => { actions.saveCampaign({ ...f, social: f.social.trim() || `${f.title} – jetzt beim Headquarter!` }); setF(null); toast('Aktion gespeichert') }}>Speichern</Btn></div>
            </div>
          </Card>
        )}
        {list.length === 0 && <Card><Empty icon="flag">Keine anstehenden Aktionen.</Empty></Card>}
        {list.map((c, i) => (
          <Card key={c.id} i={i + 1} title={c.title} right={<span className="row" style={{ gap: 8 }}><Pill tone={c.from <= today && c.to >= today ? 'green' : 'accent'}>{c.from <= today && c.to >= today ? 'läuft jetzt' : `ab ${fmtDate(c.from)}`}</Pill></span>}>
            <p className="post-text">{c.text}</p>
            <div className="am-grid">
              <div><span className="cap">Zeitraum</span><b>{period(c)}</b></div>
              {c.storeId ? <div><span className="cap">Preis</span><b>{c.price ? fmtEUR(c.price) : '–'}</b><span className="faint small">eigene Aktion deines Ladens</span></div> : <div><span className="cap">Erwartete Mehrmenge</span><b>+{c.extraPct} %</b><span className="faint small">bei den betroffenen Artikeln</span></div>}
              <div><span className="cap">Betroffene Artikel</span><span className="row wrap" style={{ gap: 6 }}>{c.articleIds.map((id) => { const a = db.articles.find((x) => x.id === id); return a ? <span key={id} className="tag"><ArtIcon article={a} size={13} /> {a.name}</span> : null })}</span></div>
            </div>
            <Social c={c} />
            {(hq || c.storeId) && <div className="row" style={{ marginTop: 12 }}>{hq && <Btn size="sm" kind="glass" onClick={() => setF({ ...c })}>Bearbeiten</Btn>}<Btn size="sm" kind="danger" onClick={() => { actions.removeCampaign(c.id); toast('Aktion gelöscht') }}>Löschen</Btn></div>}
          </Card>
        ))}
      </div>
    </>
  )
}

/* ============ Handbuch ============ */
const MEDIA_LABEL = { text: 'Text', video: 'Video', pdf: 'PDF' } as const
export function KnowledgePage({ hq }: { hq?: boolean }) {
  const db = useDb()
  const toast = useToast()
  const [cat, setCat] = useState<(typeof KNOW_CATS)[number] | 'alle'>('alle')
  const [f, setF] = useState<Omit<KnowEntry, 'id'> | null>(null)
  const shown = KNOW_CATS.filter((c) => cat === 'alle' || c === cat)
  return (
    <>
      <PageHead title="Handbuch" hint={hq ? 'Lege Einträge an, die alle Läden lesen können: Standards, Schulungen, Dokumente. (Prototyp – Platz für Video bzw. PDF.)' : 'Standards, Schulungen und Dokumente vom HQ. (Prototyp – hier kommen später Videos und PDFs.)'}
        right={hq && <Btn kind="cta" size="sm" icon="plus" onClick={() => setF({ category: KNOW_CATS[0], title: '', text: '', media: 'text' })}>Neuer Eintrag</Btn>} />
      <div className="toolbar"><div className="chips" data-tour="know-cats">{(['alle', ...KNOW_CATS] as const).map((c) => <button key={c} className="chip" aria-pressed={cat === c} onClick={() => setCat(c)}>{c === 'alle' ? 'Alle' : c}</button>)}</div></div>
      <div className="stack">
        {f && (
          <Card title="Neuer Eintrag" i={0}>
            <div className="stack" style={{ gap: 12 }}>
              <div className="row wrap">
                <div className="field"><label>Kategorie</label><select className="select" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as KnowEntry['category'] })}>{KNOW_CATS.map((c) => <option key={c}>{c}</option>)}</select></div>
                <div className="field"><label>Art</label><select className="select" value={f.media} onChange={(e) => setF({ ...f, media: e.target.value as KnowEntry['media'] })}><option value="text">Text</option><option value="video">Video</option><option value="pdf">PDF</option></select></div>
              </div>
              <div className="field"><label>Titel</label><input className="input wide" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
              <div className="field"><label>Text</label><textarea className="input" rows={3} value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} /></div>
              <div className="row"><Btn onClick={() => setF(null)}>Abbrechen</Btn><Btn kind="cta" disabled={!f.title.trim()} onClick={() => { actions.saveKnow(f); setF(null); toast('Eintrag gespeichert') }}>Speichern</Btn></div>
            </div>
          </Card>
        )}
        {shown.map((c, i) => (
          <Card key={c} title={c} i={i + 1}>
            <div className="know-grid">
              {db.knowledge.filter((k) => k.category === c).map((k) => (
                <div key={k.id} className="know-item">
                  <div className={`know-media ${k.media}`}><Icon name={k.media === 'video' ? 'play' : k.media === 'pdf' ? 'invoice' : 'note'} size={26} stroke={1.6} /><span>{MEDIA_LABEL[k.media]}</span></div>
                  <b>{k.title}</b>
                  <p className="muted small">{k.text}</p>
                  {hq && <Btn size="sm" kind="ghost" onClick={() => actions.removeKnow(k.id)}>Entfernen</Btn>}
                </div>
              ))}
              {db.knowledge.filter((k) => k.category === c).length === 0 && <p className="muted">Noch keine Einträge.</p>}
            </div>
          </Card>
        ))}
      </div>
    </>
  )
}
