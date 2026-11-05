import { useState } from 'react'
import { actions, useDb } from '../data/repository'
import { go } from '../lib/router'
import { fmtDate } from '../lib/format'
import { storeCases } from '../logic/cases'
import { ART_LABEL, SENT_FORM } from '../logic/meldungen'
import { Btn, EmbedCtx, Modal, PageHead, Tabs, useToast } from '../ui/kit'
import { SignalChip } from '../ui/signal'
import { CampaignsPage, KnowledgePage, PinnwandPage } from './Comms'

export type HqTab = 'pinnwand' | 'aktionen' | 'wissen'

/** Formular „Meldung an HQ“: Art, Text (Pflicht), Absenden */
function ReportDialog({ storeId, onClose }: { storeId: string; onClose: () => void }) {
  const toast = useToast()
  const [kind, setKind] = useState(SENT_FORM[0].value)
  const [text, setText] = useState('')
  const send = () => {
    actions.sendReport(storeId, SENT_FORM.find((f) => f.value === kind)!.art, text)
    toast('Gesendet – das HQ sieht deine Meldung sofort.')
    onClose()
  }
  return (
    <Modal onClose={onClose}>
      <h2>Meldung an HQ</h2>
      <p className="muted" style={{ margin: '4px 0 12px' }}>Eine Frage, eine Störung oder ein Lieferproblem? Das HQ sieht es sofort.</p>
      <div className="field"><label>Art</label>
        <div className="chips">{SENT_FORM.map((f) => <button key={f.value} className="chip" aria-pressed={kind === f.value} onClick={() => setKind(f.value)}>{f.label}</button>)}</div>
      </div>
      <div className="field" style={{ marginTop: 14 }}><label>Was ist passiert?</label><textarea className="input" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="z. B. Die Maschine kühlt nicht mehr richtig." autoFocus aria-label="Text der Meldung" /></div>
      <div className="actions"><Btn onClick={onClose}>Abbrechen</Btn><Btn kind="primary" icon="send" disabled={!text.trim()} onClick={send}>Absenden</Btn></div>
    </Modal>
  )
}

/** Vom HQ: Pinnwand · Aktionen · Handbuch, dazu „Meldung an HQ“ */
export function VomHqPage({ storeId, tab }: { storeId: string; tab: HqTab }) {
  const db = useDb()
  const [dlg, setDlg] = useState(false)
  const unread = db.posts.filter((p) => (p.to.length === 0 || p.to.includes(storeId)) && !p.readBy[storeId]).length
  const mine = db.reports.filter((r) => r.storeId === storeId)
  const cases = storeCases(db, storeId)
  return (
    <>
      <PageHead title="Vom HQ" hint="Nachrichten, Aktionen und Handbuch von der Zentrale." right={
        <div className="row wrap" style={{ gap: 10 }}>
          <Btn icon="send" onClick={() => setDlg(true)} data-tour="report-btn">Meldung an HQ</Btn>
          <Tabs<HqTab> value={tab} onChange={(t) => go(`/filiale/hq/${t}`)} tour="hq-tabs" options={[{ value: 'pinnwand', icon: 'megafon', label: unread ? `Pinnwand (${unread})` : 'Pinnwand' }, { value: 'aktionen', label: 'Aktionen' }, { value: 'wissen', label: 'Handbuch' }]} />
        </div>
      } />
      {mine.length > 0 && (
        <div className="glass card in sent-reports">
          <div className="cap">Meine Meldungen an das HQ</div>
          {mine.slice(-3).reverse().map((r) => {
            const c = cases.find((x) => x.kind === `r-${r.id}`)
            return <div key={r.id} className="sent-row"><SignalChip level={c?.status === 'geklärt' ? 'gruen' : 'info'} variant={c?.status === 'geklärt' ? undefined : 'megafon'}>{c?.status === 'geklärt' ? 'Erledigt' : c?.status === 'in Klärung' ? 'In Klärung' : 'Gesendet'}</SignalChip><b>{ART_LABEL[r.art]}</b><span className="muted">{r.text}</span><span className="faint small">{fmtDate(r.createdOn)}</span></div>
          })}
        </div>
      )}
      <EmbedCtx.Provider value>
        {tab === 'pinnwand' && <PinnwandPage storeId={storeId} />}
        {tab === 'aktionen' && <CampaignsPage storeId={storeId} />}
        {tab === 'wissen' && <KnowledgePage />}
      </EmbedCtx.Provider>
      {dlg && <ReportDialog storeId={storeId} onClose={() => setDlg(false)} />}
    </>
  )
}
