import { useEffect, useState, type ReactNode } from 'react'
import { useDb } from './data/repository'
import { brand } from './brand'
import { OWN_STORES } from './data/stores'
import { go, useRoute } from './lib/router'
import { hqLegacy, storeRest } from './lib/routes'
import { applyTheme, logout, setUi, useUi } from './lib/ui-state'
import { fmtShortToday } from './lib/format'
import { todayISO } from './lib/date'
import { Segmented, ToastStack } from './ui/kit'
import { SideNav, type NavItem } from './ui/SideNav'
import { storeSignals } from './logic/signals'
import { hqSignals } from './logic/hqSignals'
import { HqWarenabgleichPage, MeldungenPage } from './pages/HqCheck'
import { startTour } from './ui/Tour'
import { Icon, type IconName } from './ui/icons'
import { storeAlerts } from './logic/alerts'
import { todayState } from './logic/today'
import { inventoryState } from './logic/inventory'
import { openCases } from './logic/cases'
import { refreshWeather } from './logic/weather'
import { AlertWatcher, NotificationPanel, useAlerts } from './ui/AlertCenter'
import { Backdrop } from './ui/signal'
import { Tour } from './ui/Tour'
import { Welcome } from './ui/Welcome'
import { useTour } from './ui/tour-state'
import { LoginPage } from './pages/Login'
import { Heute } from './pages/Heute'
import { WarePage, type WareTab } from './pages/Ware'
import { InventoryPage } from './pages/Inventory'
import { MonthlyFiguresPage } from './pages/MonthlyFigures'
import { TeamPage, type TeamTab } from './pages/Team'
import { VomHqPage, type HqTab } from './pages/VomHq'
import { DemoMenu, LadenEinstellungen } from './pages/LadenEinstellungen'
import { CockpitPage } from './pages/Cockpit'
import { LaedenPage, HqBestellungen, FinanzenPage, KommunikationPage, type FinTab, type KommTab } from './pages/HqPages'
import { SettingsPage } from './pages/Settings'
import { InvoiceViewPage } from './pages/Invoices'
import { CatalogPage } from './pages/Catalog'
import { DeliveryNotePage } from './pages/DeliveryNote'
import { StoreControlPage, type CtlTab } from './pages/StoreControl'
import { CasePage } from './pages/CaseDetail'


export function App() {
  const db = useDb()
  const ui = useUi()
  const tour = useTour()
  const route = useRoute()
  const [bell, setBell] = useState(false)
  const session = ui.session
  const isHq = session?.role === 'hq'
  const mode = ui.mode
  const own = route.match(/^\/zentrale\/eigene\/([^/]+)(\/.*)?$/)
  const inOwn = isHq && !!own && OWN_STORES.includes(own[1])
  // Ein Laden-Login sieht ausschließlich den eigenen Laden – unabhängig von der Adresse
  const storeId = session && session.role !== 'hq' ? session.storeId : inOwn ? own![1] : ui.storeId
  const store = db.stores.find((s) => s.id === storeId) ?? db.stores[0]
  const alerts = useAlerts(mode, store.id)

  useEffect(() => { applyTheme() }, [ui.theme])
  useEffect(() => { refreshWeather(Object.values(db.settings.locations)) }, [db.settings.locations])

  // Zugriffsschutz und Weiterleitungen (auch für direkt eingegebene Adressen)
  useEffect(() => {
    if (!session) return
    if (session.role === 'store' && !db.stores.some((s) => s.id === session.storeId)) { logout(); go('/'); return }
    if (session.role === 'store') {
      if (!(route.startsWith('/filiale/') || route === '/filiale')) { go('/filiale/heute'); return }
      const rest = route.slice('/filiale'.length)
      const fixed = storeRest(rest)
      if (fixed !== rest) go('/filiale' + fixed)
      return
    }
    // HQ
    if (route === '/' || route === '' || route === '/zentrale') go('/zentrale/cockpit')
    else if (route.startsWith('/filiale')) go(`/zentrale/eigene/${OWN_STORES.includes(ui.storeId) ? ui.storeId : OWN_STORES[0]}${storeRest(route.slice('/filiale'.length))}`)
    else if (route.startsWith('/zentrale/eigene/') && !inOwn) go('/zentrale/laeden')
    else if (inOwn) {
      if (ui.storeId !== own![1]) setUi({ storeId: own![1] })
      const rest = own![2] ?? ''
      const fixed = storeRest(rest)
      if (fixed !== rest) go(`/zentrale/eigene/${own![1]}${fixed}`)
    } else {
      const l = hqLegacy(route)
      if (l) go(l)
      else if (!route.startsWith('/zentrale/') && route !== '/einstellungen') go('/zentrale/cockpit')
    }
  }, [route, session, ui.storeId, inOwn])
  useEffect(() => { window.scrollTo(0, 0); setBell(false) }, [route])

  if (!session) {
    return (
      <>
        <Backdrop />
        <LoginPage />
        <ToastStack />
      </>
    )
  }

  const sig = storeSignals(db, store.id)
  const hs = hqSignals(db)
  const sp = inOwn ? `/zentrale/eigene/${store.id}` : '/filiale'
  const nb = (k: string) => (sig.nav[k] && sig.nav[k].level !== 'gruen' ? sig.nav[k] : undefined)
  const storeNav: NavItem[] = [
    { key: 'heute', label: 'Heute', icon: 'haus', path: `${sp}/heute`, badge: nb('heute') },
    { key: 'ware', label: 'Ware & Bestellen', icon: 'paket', children: [
      { path: `${sp}/ware/artikel`, label: 'Artikel', badge: nb('ware/artikel') },
      { path: `${sp}/ware/bestellungen`, label: 'Meine Bestellungen', badge: nb('ware/bestellungen') },
      { path: `${sp}/ware/rechnungen`, label: 'Rechnungen', badge: nb('ware/rechnungen') },
    ] },
    { key: 'team', label: 'Team', icon: 'personen', children: [
      { path: `${sp}/team/dienstplan`, label: 'Dienstplan', badge: nb('team/dienstplan') },
      { path: `${sp}/team/mitarbeitende`, label: 'Mitarbeitende', badge: nb('team/mitarbeitende') },
    ] },
    { key: 'inventur', label: 'Inventur', icon: 'klemmbrett', path: `${sp}/inventur`, badge: nb('inventur') },
    { key: 'monatszahlen', label: 'Monatszahlen', icon: 'euro', path: `${sp}/monatszahlen`, badge: nb('monatszahlen') },
    { key: 'hq', label: 'Vom HQ', icon: 'megafon', children: [
      { path: `${sp}/hq/pinnwand`, label: 'Pinnwand', badge: nb('hq/pinnwand') },
      { path: `${sp}/hq/aktionen`, label: 'Aktionen' },
      { path: `${sp}/hq/wissen`, label: 'Handbuch' },
    ] },
  ]
  const hb = (k: string) => (hs.nav[k] && hs.nav[k].level !== 'gruen' ? hs.nav[k] : undefined)
  const hqNav: NavItem[] = [
    { key: 'cockpit', label: 'HQ-Cockpit', icon: 'haus', path: '/zentrale/cockpit', badge: hb('cockpit') },
    { key: 'laeden', label: 'Läden', icon: 'stores', path: '/zentrale/laeden', badge: hb('laeden') },
    { key: 'abgleich', label: 'Warenabgleich', icon: 'lupe', path: '/zentrale/warenabgleich', badge: hb('abgleich') },
    { key: 'meldungen', label: 'Meldungen', icon: 'klemmbrett', path: '/zentrale/meldungen', badge: hb('meldungen') },
    { key: 'best', label: 'Bestellungen & Rechnungen', icon: 'rechnung', children: [
      { path: '/zentrale/bestellungen', label: 'Eingang', badge: hb('bestellungen') },
      { path: '/zentrale/finanzen/rechnungen', label: 'Rechnungen', badge: hb('rechnungen') },
    ] },
    { key: 'mitt', label: 'Mitteilungen', icon: 'megafon', children: [
      { path: '/zentrale/kommunikation/pinnwand', label: 'Pinnwand' },
      { path: '/zentrale/kommunikation/aktionen', label: 'Aktionen' },
      { path: '/zentrale/kommunikation/wissen', label: 'Handbuch' },
    ] },
  ]
  const hq = isHq && !inOwn
  const nav = hq ? hqNav : storeNav
  const small: { path: string; label: string; icon: IconName }[] = hq
    ? [{ path: '/zentrale/katalog', label: 'Katalog', icon: 'catalog' }, { path: '/einstellungen', label: 'Einstellungen', icon: 'settings' }]
    : [{ path: `${sp}/einstellungen`, label: 'Einstellungen', icon: 'settings' }, { path: `${sp}/demo`, label: 'Demo-Menü', icon: 'play' }]

  // Seiten: Im HQ-Bereich „Eigene Läden“ gelten dieselben Laden-Seiten, nur mit anderem Adresspräfix
  const eff = inOwn ? '/filiale' + (own![2] ?? '/heute') : route
  const seg = eff.split('/')
  let page: ReactNode = null
  if (eff.startsWith('/zentrale/laeden/')) page = <StoreControlPage storeId={seg[3]} tab={(seg[4] as CtlTab) || 'uebersicht'} />
  else if (eff.startsWith('/zentrale/meldungen/')) page = <MeldungenPage key={seg[3]} storeFilter={seg[3]} />
  else if (eff.startsWith('/zentrale/fall/')) page = <CasePage storeId={seg[3]} kind={seg[4]} />
  else if (eff.startsWith('/zentrale/rechnungen/')) page = <InvoiceViewPage id={seg[3]} mode="zentrale" />
  else if (eff.startsWith('/filiale/rechnungen/')) page = <InvoiceViewPage id={seg[3]} mode="filiale" storeId={store.id} base={sp} />
  else if (eff.startsWith('/zentrale/lieferschein/')) page = <DeliveryNotePage id={seg[3]} />
  else if (eff.startsWith('/filiale/ware/')) page = <WarePage storeId={store.id} tab={(seg[3] as WareTab) || 'artikel'} />
  else if (eff.startsWith('/filiale/team/')) page = <TeamPage storeId={store.id} tab={(seg[3] as TeamTab) || 'dienstplan'} />
  else if (eff.startsWith('/filiale/hq/')) page = <VomHqPage storeId={store.id} tab={(seg[3] as HqTab) || 'pinnwand'} />
  else if (eff.startsWith('/zentrale/finanzen/')) page = <FinanzenPage tab={(seg[3] as FinTab) || 'rechnungen'} />
  else if (eff.startsWith('/zentrale/kommunikation/')) page = <KommunikationPage tab={(seg[3] as KommTab) || 'pinnwand'} />
  else
    switch (eff) {
      case '/filiale/heute': page = <Heute storeId={store.id} />; break
      case '/filiale/inventur': page = <InventoryPage storeId={store.id} />; break
      case '/filiale/monatszahlen': page = <MonthlyFiguresPage storeId={store.id} />; break
      case '/filiale/einstellungen': page = <LadenEinstellungen storeId={store.id} />; break
      case '/filiale/demo': page = <DemoMenu storeId={store.id} />; break
      case '/zentrale/cockpit': page = <CockpitPage />; break
      case '/zentrale/laeden': page = <LaedenPage />; break
      case '/zentrale/warenabgleich': page = <HqWarenabgleichPage />; break
      case '/zentrale/meldungen': page = <MeldungenPage key="alle" />; break
      case '/zentrale/bestellungen': page = <HqBestellungen />; break
      case '/zentrale/katalog': page = <CatalogPage />; break
      case '/einstellungen': page = isHq ? <SettingsPage /> : null; break
      default: page = null
    }
  const pageKey = eff.replace(/\/(ware|hq|finanzen|kommunikation)\/[^/]+$/, '/$1').replace(/(\/zentrale\/laeden\/[^/]+)\/[^/]+$/, '$1') + store.id

  const who = isHq ? 'HQ' : `${store.name}${store.tag ? ` · ${store.tag}` : store.own ? ' · HQ-eigen' : ' · Franchisenehmer'}`
  return (
    <>
      <Backdrop />
      <div className="app">
        <aside className="glass sidebar no-print">
          <div className="brand">
            <div className="brand-mark"><Icon name="becher" size={22} stroke={2} /></div>
            <div><b>{brand.produktName}</b><span>{brand.untertitel}</span></div>
          </div>
          {inOwn && (
            <div className="own-head">
              <a className="btn glass back-hq" href="#/zentrale/cockpit"><Icon name="arrow" size={16} />Zurück zum HQ</a>
              <Segmented value={store.id} onChange={(id) => { setUi({ storeId: id }); go(`/zentrale/eigene/${id}/${seg[2] ?? 'heute'}`) }}
                options={OWN_STORES.map((id) => ({ value: id, label: db.stores.find((s) => s.id === id)!.name.replace('Frozen Yoghurt ', '') }))} />
            </div>
          )}
          <SideNav items={nav} route={route} />
          <div className="nav-spacer" />
          <nav className="nav-small">
            {small.map((n) => <a key={n.path} className={`nav-item small ${route === n.path ? 'active' : ''}`} href={`#${n.path}`} data-nav={n.label}><Icon name={n.icon} size={17} /><span className="nav-label">{n.label}</span></a>)}
          </nav>
          <div className="shop-card" data-tour="who">
            <span className="shop-card-ico"><Icon name={isHq ? 'hq' : 'haus'} size={20} /></span>
            <div className="shop-card-text"><b title={isHq && !inOwn ? 'HQ' : store.name}>{isHq && !inOwn ? brand.zentraleName : store.name}</b><span>{isHq && !inOwn ? brand.zentraleUntertitel : store.own ? 'HQ-eigener Laden' : 'Franchise-Laden'}</span></div>
          </div>
          <div className="nav-foot-actions">
            <button className="linkbtn" onClick={() => startTour(isHq ? 'hq' : 'store')}><Icon name="play" size={15} />Rundgang</button>
            <button className="btn glass sm" data-tour="logout" onClick={() => { logout(); go('/') }}><Icon name="logout" size={16} />Abmelden</button>
          </div>
        </aside>

        <div className="main">
          <header className="topbar glass no-print">
            <div className="who" data-tour="who" title="Angemeldet im Demo-Login">
              <Icon name={isHq ? 'hq' : 'stores'} size={18} />
              <span><b>{who}</b></span>
            </div>
            {inOwn && <span className="who-view"><Icon name="eye" size={16} />Ansicht: {store.name}</span>}
            <span className="topbar-fill" />
            <span className="demo-pill" title="Alle Zahlen in diesem Prototyp sind erfundene Demodaten">Demodaten – keine echten Zahlen</span>
            <span className="today-pill">{fmtShortToday()}</span>
            <button className="top-btn" aria-label="Benachrichtigungen" onClick={() => setBell((b) => !b)}>
              <Icon name="bell" size={20} />
              {alerts.length > 0 && <span className="bell-count">{alerts.length}</span>}
            </button>
          </header>
          <main className="content">
            <div className="page" key={pageKey}>{page}</div>
            <p className="foot no-print">Wetterdaten: Open-Meteo · Demodaten, alle Werte änderbar</p>
          </main>
        </div>
      </div>
      {bell && <NotificationPanel mode={mode} storeId={store.id} onClose={() => setBell(false)} />}
      <AlertWatcher mode={mode} storeId={store.id} />
      <ToastStack />
      {!tour.active && tour.welcome && <Welcome key={hq ? 'hq' : 'st'} hq={hq} />}
      <Tour />
    </>
  )
}
