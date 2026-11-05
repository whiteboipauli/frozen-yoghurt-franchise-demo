import { useState } from 'react'
import { actions } from '../data/repository'
import { REMINDERS, reminders, useReminders, type Channel } from '../lib/reminders'
import { Icon } from '../icons'
import { Btn, Card, EmbedCtx, Modal, PageHead, Segmented, Switch, Tabs, useToast } from '../ui/kit'
import { ImportPage } from './Import'
import { InterfacesPage } from './Interfaces'
import { StoreSettingsPage } from './StoreSettings'
import { TestSalePage } from './TestSale'
import { startTour } from '../ui/Tour'

type Tab = 'erinnerungen' | 'schnittstellen' | 'kasse' | 'laden' | 'daten'

/** Einstellungen des Ladens: Erinnerungen, Schnittstellen, Kassendaten, Laden & Personal, Demodaten */
export function LadenEinstellungen({ storeId }: { storeId: string }) {
  const [tab, setTab] = useState<Tab>('erinnerungen')
  return (
    <>
      <PageHead title="Einstellungen" hint="Erinnerungen, Anbindungen und Daten deines Ladens." right={
        <Tabs<Tab> value={tab} onChange={setTab} options={[{ value: 'erinnerungen', label: 'Erinnerungen' }, { value: 'schnittstellen', label: 'Schnittstellen' }, { value: 'kasse', label: 'Kasse' }, { value: 'laden', label: 'Laden & Personal' }, { value: 'daten', label: 'Demodaten' }]} />
      } />
      <EmbedCtx.Provider value>
        {tab === 'erinnerungen' && <RemindersTab />}
        {tab === 'schnittstellen' && <InterfacesPage storeId={storeId} />}
        {tab === 'kasse' && <ImportPage />}
        {tab === 'laden' && <StoreSettingsPage storeId={storeId} />}
        {tab === 'daten' && <DataTab />}
      </EmbedCtx.Provider>
    </>
  )
}

function RemindersTab() {
  const cfg = useReminders()
  return (
    <div className="stack n-stack">
      <div className="note"><Icon name="info" /><div>Im echten System kommen die Erinnerungen per Push bzw. E-Mail. In der Demo erscheinen fällige Erinnerungen als Benachrichtigung über die Glocke.</div></div>
      <Card title="Erinnerungen">
        <div className="n-list">
          {REMINDERS.map((r) => (
            <div key={r.key} className="n-row rem" data-rem={r.key}>
              <Switch on={cfg[r.key].on} onChange={(on) => reminders.set(r.key, { on })} label={r.label} />
              <div className="n-main"><b>{r.label}</b><span className="muted small rem-prev"><Icon name={cfg[r.key].channel === 'push' ? 'bell' : 'send'} size={14} /> {cfg[r.key].channel === 'push' ? 'Push aufs Handy' : 'E-Mail'}: „{r.preview}“</span></div>
              <Segmented<Channel> value={cfg[r.key].channel} onChange={(channel) => reminders.set(r.key, { channel })} options={[{ value: 'push', label: 'Push aufs Handy' }, { value: 'email', label: 'E-Mail' }]} />
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

function DataTab() {
  const toast = useToast()
  const [confirm, setConfirm] = useState(false)
  return (
    <Card title="Demodaten zurücksetzen">
      <p className="muted" style={{ marginBottom: 14 }}>Setzt alles auf den Anfangszustand zurück: Bestände, Bestellungen, Dienstplan und Rechnungen. Das lässt sich nicht rückgängig machen.</p>
      <Btn kind="danger" onClick={() => setConfirm(true)}>Demodaten zurücksetzen</Btn>
      {confirm && (
        <Modal onClose={() => setConfirm(false)}>
          <h2>Wirklich zurücksetzen?</h2>
          <p className="muted" style={{ margin: '6px 0 16px' }}>Alle Änderungen gehen verloren und die Demodaten sind wieder wie am Anfang.</p>
          <div className="actions"><Btn onClick={() => setConfirm(false)}>Abbrechen</Btn><Btn kind="danger" onClick={() => { actions.resetDemo(); setConfirm(false); toast('Demodaten zurückgesetzt') }}>Ja, zurücksetzen</Btn></div>
        </Modal>
      )}
    </Card>
  )
}

/** Demo-Menü: Verkauf testen und Tour starten */
export function DemoMenu({ storeId }: { storeId: string }) {
  return (
    <>
      <PageHead title="Demo-Menü" hint="Nur für die Vorführung: einen Verkauf testen oder die Tour starten." />
      <div className="stack n-stack">
        <Card title="Tour starten">
          <div className="row between wrap"><p className="muted">In wenigen Schritten durch den Laden. Alles, was dabei passiert, wird danach zurückgesetzt.</p><Btn kind="primary" icon="play" onClick={() => startTour('store')} data-tour="start-tour">Tour starten</Btn></div>
        </Card>
        <EmbedCtx.Provider value><TestSalePage storeId={storeId} /></EmbedCtx.Provider>
      </div>
    </>
  )
}
