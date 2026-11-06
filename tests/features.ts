import { readFileSync } from 'node:fs'
const store: Record<string, string> = {}
;(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v }, removeItem: (k: string) => { delete store[k] } }
;(globalThis as any).sessionStorage = (globalThis as any).localStorage
let fails = 0
const ok = (c: boolean, m: string) => { if (!c) { fails++; console.log('FAIL', m) } else console.log('ok  ', m) }
const src = (p: string) => readFileSync(`${process.cwd()}/src/${p}`, 'utf8')

const { getDb, actions } = await import('../src/data/repository')
const { todayISO, addDays } = await import('../src/lib/date')
const { levelFor, canOpenStore } = await import('../src/lib/access')
const { DEMO_STORE, DEMO_STORE_2, DEMO_STORE_3, OWN_STORES, TOUR_STORE } = await import('../src/data/stores')
const today = todayISO()
const db0 = getDb()

/* ---- Rechte ---- */
const carl = db0.stores.find((s) => s.id === TOUR_STORE)!, bielefeld = db0.stores.find((s) => s.id === 'bielefeld')!
ok(levelFor({ role: 'store', storeId: 'bielefeld' }, bielefeld) === 'full' && levelFor({ role: 'store', storeId: 'bielefeld' }, carl) === 'none', 'Laden sieht nur sich selbst')
ok(levelFor({ role: 'hq' }, carl) === 'full' && levelFor({ role: 'hq' }, bielefeld) === 'control', 'HQ: eigene Stores komplett, Franchise nur Kontrolle')
ok(!canOpenStore({ role: 'store', storeId: 'bielefeld' }, db0, TOUR_STORE) && canOpenStore({ role: 'hq' }, db0, 'bielefeld'), 'Adresse eines fremden Ladens bleibt gesperrt')
ok(OWN_STORES.length === 1 && db0.stores.filter((s) => s.own).map((s) => s.id).sort().join() === [...OWN_STORES].sort().join(), 'Carlstadt gehören dem HQ')
const app = src('App.tsx'), ctrl = src('pages/StoreControl.tsx')
ok(!/StorePicker/.test(app), 'kein Umschalter zwischen Läden')
ok(/session && session\.role !== 'hq' \? session\.storeId/.test(app), 'Laden-Login: Laden kommt immer aus der Anmeldung')
ok(!/toppingArticles|extern|db\.orders|db\.employees|shifts|Personal/.test(ctrl.replace(/^\/\*\*.*$/m, '')), 'HQ-Kontrollansicht: keine Toppings, eigenen Lieferanten, kein Personal')
ok(!/Zentrale|Schwund-Kontrolle|Positionen des Headquarters/.test(['App.tsx', 'ui/Tour.tsx', 'ui/Welcome.tsx', 'pages/Cockpit.tsx', 'pages/Orders.tsx'].map(src).join('\n')), 'HQ/Warenabgleich/Artikel des Headquarters überall umbenannt')
ok(!/Sweet Crunch|Fruchtwelt KL|Malaysia/.test(JSON.stringify(db0.articles)) && db0.articles.some((a) => a.supplier === 'Metro') && db0.articles.some((a) => a.supplier === 'Fruchtwelt'), 'Lieferanten: Metro, Fruchtwelt')

/* ---- Zählen ---- */
const invPage = src('pages/Inventory.tsx'), stockPage = src('pages/Stock.tsx')
ok(!/stockNow|\.expected|Differenz|rechnerisch/i.test(invPage.replace(/[^\n]*Rechenwert[^\n]*/g, '')), 'Inventur-Formular: kein Rechenwert, keine Differenz')
ok(!/fmtQty\(f\.article, Math\.max\(0, f\.stock\)\)/.test(stockPage) && /roughShort\(f\.daysLeft\)/.test(stockPage), 'Bestand: Artikel des Headquarters nur Ampel, grobe Reichweite, gezählter Wert')
const inv = await import('../src/logic/inventory')
ok(inv.roughReach(8) === 'reicht noch ca. 1 Woche' && inv.roughReach(0) === 'reicht nur noch heute', 'grobe Reichweite in Worten')
const lc = inv.lastCount(db0, TOUR_STORE, 'becher-m')
ok(!!lc && lc.counted > 0, 'zuletzt gezählter Wert mit Datum vorhanden')

/* ---- Inventur-Status & Seed ---- */
const states = db0.stores.map((s) => [s.id, inv.inventoryState(db0, s.id).status] as const)
ok(inv.inventoryState(db0, TOUR_STORE).status === 'offen' && true, 'Carlstadt offen')
ok(states.filter((x) => x[1] === 'überfällig').length === 3 && states.some((x) => x[1] === 'erledigt'), 'drei Läden überfällig')
ok(inv.inventoryState(db0, TOUR_STORE).due === addDays(addDays(today, -((new Date(today + 'T00:00:00Z').getUTCDay() + 6) % 7)), 6), 'Stichtag = Sonntag')
const { invRows } = await import('../src/pages/InventoryHq')
const rows = invRows(db0)
ok(rows.every((r, i) => i === 0 || rows[i - 1].score >= r.score), 'HQ-Inventurseite nach Auffälligkeit sortiert')
ok(rows.slice(0, 4).some((r) => r.store.id === DEMO_STORE_2), 'Beispielhausen (Inventur-Differenz) steht oben')

/* ---- Meldungen ---- */
const cases = await import('../src/logic/cases')
const kinds = (id: string) => cases.storeCases(db0, id).map((c) => `${c.kind}:${c.level}`).join()
ok(/bezug:red/.test(kinds(DEMO_STORE)), 'Musterstadt: Becher-Mehrbezug rot (' + kinds(DEMO_STORE) + ')')
ok(/inventur:red/.test(kinds(DEMO_STORE_2)), 'Beispielhausen: Inventur-Differenz rot (' + kinds(DEMO_STORE_2) + ')')
ok(/abgang:red/.test(kinds(DEMO_STORE_3)), 'Probenheim: auffälliger Abgang rot (' + kinds(DEMO_STORE_3) + ')')
const real = db0.stores.filter((s) => !s.demo)
ok(real.every((s) => cases.storeCases(db0, s.id).every((c) => c.kind === 'ueberfaellig')), 'echte Läden: höchstens „Inventur überfällig“ (' + real.map((s) => kinds(s.id)).filter(Boolean).join(' | ') + ')')
const n0 = cases.openCases(db0).length
actions.requestFromStore(DEMO_STORE, 'sonder-inventur')
actions.updateCase(DEMO_STORE, 'bezug', { status: 'in Klärung', note: 'Sonder-Inventur angefordert.' })
let db1 = getDb()
ok(inv.inventoryState(db1, DEMO_STORE).special !== null, 'Sonder-Inventur erscheint beim Laden als fällige Inventur')
const { storeAlerts } = await import('../src/logic/alerts')
ok(storeAlerts(db1, DEMO_STORE).some((a) => /Sonder-Inventur/.test(a.title)), 'und als Alarm im Laden')
ok(cases.storeCases(db1, DEMO_STORE).find((c) => c.kind === 'bezug')!.status === 'in Klärung', 'Status in Klärung')
actions.updateCase(DEMO_STORE, 'bezug', { status: 'geklärt' })
ok(cases.storeCases(getDb(), DEMO_STORE).find((c) => c.kind === 'bezug')!.status === 'in Klärung', 'geklärt nur mit Begründung')
actions.updateCase(DEMO_STORE, 'bezug', { status: 'geklärt', resolution: 'Sonder-Inventur: alles erklärt' })
ok(cases.openCases(getDb()).length === n0 - 1 && !cases.openCases(getDb()).some((c) => c.id === `${DEMO_STORE}|bezug`), 'geklärter Fall verschwindet aus „Braucht Aufmerksamkeit“')
actions.requestFromStore('duisburg', 'erinnerung')
ok(storeAlerts(getDb(), 'duisburg').some((a) => /Erinnerung/.test(a.title)), 'Erinnerung erscheint als Alarm im Laden')
// Sonder-Inventur zählen
const counts: Record<string, number> = {}
for (const a of getDb().articles.filter((x) => x.source === 'zentrale')) counts[a.id] = 100
actions.saveInventory(DEMO_STORE, counts)
const after = getDb()
ok(inv.inventoriesOf(after, DEMO_STORE)[0].kind === 'sonder' && inv.inventoryState(after, DEMO_STORE).special === null, 'Zählung erledigt die Sonder-Inventur')

/* ---- Forecast-Sortierung ---- */
const { forecastAll } = await import('../src/logic/forecast')
const { emptyOrder } = await import('../src/pages/ForecastPage')
const sp = await import('../src/logic/staffplan')
const staffing = await import('../src/logic/staffing')
const fcs = forecastAll(getDb(), TOUR_STORE)
const ord = emptyOrder(fcs)
ok(ord.every((f, i) => i === 0 || (ord[i - 1].reach ?? 1e9) <= (f.reach ?? 1e9)), 'Forecast: nach frühestem Leer-Datum sortiert')
ok(new Set(fcs.map((f) => f.reach === null ? 'x' : f.reach.toFixed(1))).size > 8, 'Forecast: Balkenlängen unterschiedlich (' + new Set(fcs.map((f) => f.reach?.toFixed(1))).size + ' verschiedene)')
const fcm = await import('../src/logic/forecast')
ok(fcs.every((f) => (fcm.reachTone(f) === 'red') === (f.light === 'red' || (f.reach !== null && f.reach < 3))), 'Ampel folgt der Reichweite')
const lo = fcs.filter((f) => f.reach !== null && f.reach < 3), hi = fcs.filter((f) => f.reach === null || f.reach >= 7)
ok(lo.every((f) => fcm.reachPct(f) <= 22 && fcm.reachTone(f) === 'red') && hi.every((f) => fcm.reachPct(f) >= 50 && fcm.reachTone(f) === 'green'), 'Füllstand: wenig = niedrig+rot, viel = hoch+grün')
const ordList = (await import('../src/logic/orderlist'))
const items = ordList.orderList(getDb(), TOUR_STORE).filter((i) => i.status === 'offen')
ok(items.length > 0 && items.every((i) => ordList.reachAfter(i, i.packs) !== null && ordList.reachAfter(i, i.packs)! > (i.reach ?? 0)), 'Bestellliste: Reichweite nach Lieferung > heutige Reichweite')
ok(/reicht dann bis ca\./.test(src('pages/Orders.tsx')), 'Bestellliste: Ein-Satz-Format')
ok(/createPortal/.test(src('ui/kit.tsx')), 'Fenster liegen per Portal im Vordergrund')
ok(/kind="primary"/.test(src('ui/ArticleModal.tsx')) && !/size="lg"/.test(src('ui/ArticleModal.tsx')), 'Jetzt bestellen: blauer Haupt-Button, normale Größe')
ok(!/magenta|E6007E/i.test(src('styles.css') + src('ui/art.tsx') + src('icons/illustrations.tsx')), 'kein Magenta mehr')
const invs = getDb().invoices
const stt: Record<string, number> = {}
for (const i of invs) stt[(await import('../src/logic/invoice')).invoiceState(i)] = (stt[(await import('../src/logic/invoice')).invoiceState(i)] ?? 0) + 1
ok(stt['bezahlt'] > stt['offen'] && stt['offen'] > stt['überfällig'] && stt['überfällig'] > 0, 'Rechnungen: überwiegend bezahlt, einige offen, wenige überfällig ' + JSON.stringify(stt))
ok(getDb().centralOrders.filter((c) => c.status === 'berechnet').every((c) => { const i = getDb().invoices.find((x) => x.id === c.invoiceId); return !!i && !/bitte ergänzen/.test(JSON.stringify([i.seller, i.buyer])) }), 'berechnete Bestellungen: vollständige Rechnung mit Pflichtangaben')
/* Mitarbeiter-Zugang */
const empId = `${TOUR_STORE}-m1`
ok(getDb().employees.some((e) => e.id === empId), 'Mitarbeiter-Zugang: Person existiert')
{
  const d = addDays(today, 3)
  actions.setAvailability(empId, d, { kind: 'ganztags' })
  const av = getDb().availability.find((a) => a.empId === empId && a.date === d)
  ok(av?.kind === 'ganztags', 'Verfügbarkeit einer Person landet in den Daten des Ladens (Dienstplan)')
}
ok(!/verfuegbarkeit`, label/.test(app), 'Meine Verfügbarkeit nicht mehr in der Laden-Navigation')
/* Wochenplan-Segmente */
{
  const { segments } = await import('../src/pages/PlanCalendar')
  const sd: any = { open: 11, need: { 11: 2, 12: 2, 13: 3, 14: 3, 15: 1 } }
  const sg = segments(sd, [2, 2, 2, 2, 2])
  ok(sg.some((x: any) => x.state === 'gap' && x.from === 13 && x.to === 15 && x.n === 1) && sg.some((x: any) => x.state === 'over' && x.from === 15), 'Wochenplan: Lücke genau in der fehlenden Uhrzeit, Überbesetzung erkannt')
}
/* Lücke zuteilen → Lücke schrumpft */
{
  let done = false
  for (let i = 0; i < 14 && !done; i++) {
    const d = addDays(today, i)
    const ds = staffing.dayStaffing(getDb(), TOUR_STORE, d, today)
    for (const g of ds.gaps) {
      const c = sp.candidatesForGap(getDb(), TOUR_STORE, d, g, today)[0]
      if (!c) continue
      actions.saveShift({ id: 'sh-t2', storeId: TOUR_STORE, empId: c.emp.id, date: d, start: c.start, end: c.end, locked: true, why: '' })
      const after = staffing.dayStaffing(getDb(), TOUR_STORE, d, today)
      ok(after.missingHours < ds.missingHours, 'Zuteilen: Person erscheint, Lücke verkleinert sich (' + ds.missingHours + ' → ' + after.missingHours + ')')
      actions.removeShift('sh-t2'); done = true; break
    }
  }
  ok(done, 'es gab eine zuteilbare Lücke')
}

/* ---- Versand mit Sendungsnummer ---- */
const { placeCentralOrder, confirmCentralOrder, shipCentralOrder } = await import('../src/data/repository')
const r = placeCentralOrder(getDb(), 'bielefeld', [{ articleId: 'becher-m', packs: 2 }], addDays(today, 3), '')!
const shipped = shipCentralOrder(confirmCentralOrder(r.db, r.id), r.id, { carrier: 'GLS', trackingNo: '12345678901', etaDate: addDays(today, 2) })
const co = shipped.centralOrders.find((c) => c.id === r.id)!
ok(co.status === 'versendet' && co.carrier === 'GLS' && co.trackingNo === '12345678901' && co.etaDate === addDays(today, 2), 'Versand: Dienstleister, Sendungsnummer, Lieferdatum')
ok(shipped.deliveries.some((d) => d.coId === r.id && !d.confirmed), 'Lieferung erscheint beim Laden im Wareneingang')
const demoShip = getDb().centralOrders.filter((c) => c.storeId === TOUR_STORE && c.status === 'versendet')
ok(demoShip.length >= 1 && !!demoShip[0].trackingNo, 'Flagship: Lieferung „wird gerade angeliefert“ mit Sendungsnummer')
ok(getDb().centralOrders.filter((c) => c.shippedOn).every((c) => c.carrier && c.trackingNo), 'alle versendeten Bestellungen haben Versanddaten')

/* ---- Rechnung aus „Meine Bestellungen“ ---- */
const withInv = getDb().centralOrders.find((c) => c.storeId === TOUR_STORE && c.invoiceId) ?? getDb().centralOrders.find((c) => c.invoiceId)!
ok(!!getDb().invoices.find((i) => i.id === withInv.invoiceId) && /print-modal/.test(src('pages/MyOrders.tsx')) && /InvoiceDoc/.test(src('pages/MyOrders.tsx')), 'Bestell-Detail: Rechnung ansehen und als PDF (Druckdialog)')

/* ---- Dienstplan-Zuteilung mit Warnungen ---- */
const hr = await import('../src/logic/hr')
let tested = 0, warned = 0
for (let i = 0; i < 14 && tested < 1; i++) {
  const d = addDays(today, i)
  const ds = staffing.dayStaffing(getDb(), TOUR_STORE, d, today)
  for (const g of ds.gaps) {
    const c = sp.candidatesForGap(getDb(), TOUR_STORE, d, g, today)
    if (c.length) { tested++; ok(c.every((x, k) => k === 0 || Number(c[k - 1].warnings.length > 0) <= Number(x.warnings.length > 0)), 'Kandidaten: Personen ohne Warnung zuerst'); warned += c.filter((x) => x.warnings.length).length; actions.saveShift({ id: 'sh-test', storeId: TOUR_STORE, empId: c[0].emp.id, date: d, start: c[0].start, end: c[0].end, locked: true, why: 'test' }); ok(getDb().shifts.some((s) => s.id === 'sh-test'), 'Zuteilen legt die Schicht an'); actions.removeShift('sh-test'); break }
  }
}
ok(sp.planLines(getDb(), TOUR_STORE, 14, today)[0].state !== 'ok' || sp.planLines(getDb(), TOUR_STORE, 14, today).every((l) => l.state === 'ok'), 'Probleme stehen ganz oben')
// Warnung „Überstunden“: Person ist knapp unter der Wochengrenze, eine weitere Schicht überschreitet sie
{
  const e = getDb().employees.find((x) => x.storeId === TOUR_STORE && x.active && hr.contractOf(getDb().settings.hr, x)?.kind !== 'minijob') ?? getDb().employees.find((x) => x.storeId === TOUR_STORE && x.active)!
  const mon = addDays(today, 7 - ((new Date(today + 'T00:00:00Z').getUTCDay() + 6) % 7))
  const cap = hr.weekCap(getDb().settings.hr, e, mon)
  let d: any = { ...getDb(), shifts: getDb().shifts.filter((s) => s.empId !== e.id) }
  let sum = 0
  for (let k = 0; k < 6; k++) {
    const sh = { id: 'w' + k, storeId: TOUR_STORE, empId: e.id, date: addDays(mon, k), start: 11, end: 17, locked: true, why: '' }
    const n = hr.netOf(getDb().settings.hr, e, sh)
    if (sum + n > cap - 1) break
    sum += n
    d = { ...d, shifts: [...d.shifts, sh] }
  }
  const w = sp.warningsFor(d, TOUR_STORE, e, { id: 'x', storeId: TOUR_STORE, empId: e.id, date: addDays(mon, 6), start: 11, end: 19, locked: true, why: '' })
  ok(w.some((t) => /Überstunde|Minijob|Ruhezeit|Tag/.test(t)), 'Warnung direkt an der Person: ' + w.join(' / '))
}
void warned; void hr

/* ---- Tour-Reset ---- */
const snap = actions.tourBegin()
actions.requestFromStore(DEMO_STORE_2, 'sonder-inventur')
actions.tourRestore(snap)
ok(getDb() === snap, 'Tour-Reset: Daten identisch')

/* ====================== Neu: Design, Übersicht, Bestellen, Dienstplan, HQ ====================== */
{
  const fcm = await import('../src/logic/forecast')
  const op = await import('../src/logic/orderplan')
  const cx = await import('../src/logic/cases')
  const ck = await import('../src/logic/checks')
  const kp = await import('../src/logic/kpi')
  const fe = await import('../src/logic/fees')
  const al = await import('../src/logic/alerts')
  const tp = await import('../src/logic/tips')
  const st = await import('../src/logic/staffing')
  const sp = await import('../src/logic/staffplan')
  const css = src('styles.css')
  ok(/--blue: #0a84ff/.test(src('design.css')) && /--accent: var\(--blue\)/.test(src('design.css')), 'Design: Apple-Blau als zentrale Variable')
  ok(!/Kasse$|magenta/i.test(css), 'Design: kein Magenta')

  // Status/Ampel: Zähler passen zur Ampel (4 Tage Reichweite = bald bestellen)
  const fcs = fcm.forecastAll(db0, TOUR_STORE)
  const sample = { reach: 4, light: 'green' as const }
  ok(fcm.reachTone(sample as any) === 'yellow', 'Reichweite 4 Tage = gelb („bald bestellen“)')
  const ov = src('pages/Overview.tsx')
  ok(/reachTone\(f\)/.test(ov) && /Alles im grünen Bereich/.test(ov) && /parts\.length \? 'yellow'/.test(ov), 'Übersicht: Status aus Reichweite-Ampel, grün nur ohne offene Punkte')
  ok(fcs.length === db0.articles.length, 'Forecast für alle Artikel')

  // Bestand: Sortierung rot → gelb → grün, Kategorien
  const st1 = src('pages/Stock.tsx')
  ok(/LIGHT_RANK\[reachTone\(a\)\]/.test(st1) && /Becher & Zubehör/.test(src('logic/orderplan.ts')), 'Bestand: sortiert nach Ampel, Kategorien Becher & Zubehör / Pulver / Toppings')
  ok(op.groupOf(db0.articles.find((a) => a.id === 'deckel')!) === 'becher' && op.groupOf(db0.articles.find((a) => a.id === 'pulver')!) === 'pulver' && op.groupOf(db0.articles.find((a) => a.id === 'mango')!) === 'toppings', 'Kategorien-Zuordnung')

  // Mengenregler: Bereiche min ≤ Vorschlag ≤ obere Grenze
  for (const id of ['mango', 'becher-l', 'pulver', 'oreo']) {
    const f = fcs.find((x) => x.article.id === id)!
    const p = op.orderPlan(f, db0.settings.targetDays)
    ok(p.min >= 1 && p.min <= p.opt && p.opt <= p.upper && p.upper < p.max, `Mengenregler ${id}: Bereiche ${p.min}/${p.opt}/${p.upper}/${p.max}`)
    ok(p.zone(0) === 'wenig' && p.zone(p.opt) === 'optimal' && p.zone(p.max) === 'viel', `Mengenregler ${id}: zu wenig / optimal / zu viel`)
    const r1 = p.reachDays(p.opt), r2 = p.reachDays(p.opt + 3)
    ok(r1 === null || r2! > r1, `Mengenregler ${id}: mehr Packungen = längere Reichweite`)
  }
  ok(/schlecht werden/.test(op.orderPlan(fcs.find((x) => x.article.id === 'mango')!, 14).warn) && /Lagerplatz/.test(op.orderPlan(fcs.find((x) => x.article.id === 'becher-l')!, 14).warn), 'Warntexte: Obst „schlecht werden“, Becher „Lagerplatz“')

  // Inventur ohne freiwillige Toppings
  ok(!/freiwillig/.test(src('pages/Inventory.tsx')), 'Inventur: Toppings nicht mehr zählbar')
  // Bestellliste: Erledigt-Bereich
  ok(/Erledigt/.test(src('pages/Orders.tsx')) && /showDone/.test(src('pages/Orders.tsx')), 'Bestellliste: eingeklappter Bereich „Erledigt“')

  // Auftragsbestätigung + Rechnung
  const odoc = await import('../src/ui/OrderDoc')
  const co = db0.centralOrders.find((c) => c.storeId === TOUR_STORE && c.status === 'versendet')!
  ok(!!co.invoiceId && !!db0.invoices.find((i) => i.id === co.invoiceId), 'Demo: auch die neueste (versendete) Bestellung hat eine Rechnung')
  ok(db0.centralOrders.filter((c) => c.shippedOn).every((c) => c.invoiceId), 'Alle versendeten Demo-Bestellungen haben eine Rechnung')
  ok(/^AB-\d{4}$/.test(odoc.confirmationNo(co)), 'Auftragsbestätigung hat eigene Nummer (AB-…)')
  const fresh = actions.placeCentralOrder(TOUR_STORE, [{ articleId: 'deckel', packs: 1 }], addDays(today, 3), '')!
  ok(!getDb().centralOrders.find((c) => c.id === fresh)!.invoiceId, 'Neue Bestellung: nur Auftragsbestätigung, noch keine Rechnung')
  actions.confirmCentralOrder(fresh); actions.shipCentralOrder(fresh)
  ok(!!getDb().centralOrders.find((c) => c.id === fresh)!.invoiceId, 'Versand erzeugt die Rechnung')

  // Dienstplan: Lücken schließbar ohne Warnung; Lücke verschwindet nach „Schicht speichern“
  let closable = 0, gapsN = 0
  for (const sid of [TOUR_STORE, 'bielefeld', DEMO_STORE, DEMO_STORE_2, DEMO_STORE_3]) {
    for (let i = 0; i < 14; i++) {
      const date = addDays(today, i)
      for (const g of st.dayStaffing(db0, sid, date, today).gaps) {
        gapsN++
        const c = sp.candidatesForGap(db0, sid, date, g, today)
        if (c.some((x) => !x.warnings.length && x.start <= g.from && x.end >= g.to)) closable++
        else console.log('  nicht ohne Warnung schließbar:', sid, date, g)
      }
    }
  }
  ok(gapsN > 0 && closable === gapsN, `Demo-Lücken (${gapsN}) lassen sich alle ohne Warnung schließen`)
  ok(db0.stores.some(() => true) && [TOUR_STORE, 'bielefeld', DEMO_STORE].some((sid) => { for (let i = 0; i < 14; i++) for (const g of st.dayStaffing(db0, sid, addDays(today, i), today).gaps) if (sp.candidatesForGap(db0, sid, addDays(today, i), g, today).some((x) => x.warnings.length)) return true; return false }), 'es gibt auch Personen mit Warnung')
  {
    let gd: { sid: string; date: string; g: any } | null = null
    for (let i = 0; i < 14 && !gd; i++) { const g = st.dayStaffing(db0, TOUR_STORE, addDays(today, i), today).gaps[0]; if (g) gd = { sid: TOUR_STORE, date: addDays(today, i), g } }
    ok(!!gd, 'Flagship hat eine Demo-Lücke')
    if (gd) {
      const c = sp.candidatesForGap(db0, TOUR_STORE, gd.date, gd.g, today).find((x) => !x.warnings.length)!
      const before = st.dayStaffing(getDb(), TOUR_STORE, gd.date, today).gaps.reduce((s, g) => s + g.missing * (g.to - g.from), 0)
      actions.saveShift({ id: 'test-sh', storeId: TOUR_STORE, empId: c.emp.id, date: gd.date, start: c.start, end: c.end, locked: true, why: 'test' })
      const after = st.dayStaffing(getDb(), TOUR_STORE, gd.date, today).gaps.reduce((s, g) => s + g.missing * (g.to - g.from), 0)
      ok(after < before, `Schicht speichern verkleinert die Lücke (${before} → ${after} Personen-Stunden)`)
      actions.removeShift('test-sh')
    }
  }
  const pui = await import('../src/lib/plan-ui')
  pui.planUi.openDay(addDays(today, 9))
  ok(pui.planUi.get().view === 'kalender' && pui.planUi.get().week === 1 && pui.planUi.get().focus === addDays(today, 9), 'Sprung zum Tag im Kalender (richtige Woche)')

  // Warenabgleich: neue Prüfungen
  const ch = (id: string) => ck.storeChecks(db0, id).map((c) => `${c.kind}:${c.light}`).join()
  ok(/pulver:red/.test(ch(DEMO_STORE_2)) && /groessen:red/.test(ch(DEMO_STORE_2)), 'Beispielhausen: Pulver pro Becher + Bechergrößen rot (' + ch(DEMO_STORE_2) + ')')
  ok(/zubehoer:red/.test(ch(DEMO_STORE_3)) && /mehrverkauf:red/.test(ch(DEMO_STORE_3)) && /kasse:red/.test(ch(DEMO_STORE_3)), 'Probenheim: Zubehör, Mehr verkauft als geliefert, Kassen-Muster (' + ch(DEMO_STORE_3) + ')')
  ok(/kasse:red/.test(ch(DEMO_STORE)) && /prognose:red/.test(ch(DEMO_STORE)), 'Musterstadt: Kassen-Muster + Verkäufe unter Prognose (' + ch(DEMO_STORE) + ')')
  ok(ck.storeChecks(db0, TOUR_STORE).length === 7, 'sieben Prüfungen je Laden')
  const realChecks = db0.stores.filter((s) => !s.demo).flatMap((s) => ck.storeChecks(db0, s.id).filter((c) => c.light === 'red'))
  ok(realChecks.length === 0, 'echte Läden: keine roten Prüfungen (' + realChecks.map((c) => c.kind).join() + ')')
  console.log('  echte Läden gelb:', db0.stores.filter((s) => !s.demo).map((s) => [s.id, ck.storeChecks(db0, s.id).filter((c) => c.light !== 'green').map((c) => c.kind).join('+')]).filter((x) => x[1]).map((x) => x.join('=')).join(' | '))
  ok(cx.storeCases(db0, DEMO_STORE_2).some((c) => c.kind === 'pulver') && cx.storeCases(db0, DEMO_STORE_3).some((c) => c.kind === 'zubehoer'), 'neue Prüfungen erzeugen Meldungen (Fall-Ablauf wie bisher)')
  ok(db0.stores.filter((s) => !s.demo).every((s) => cx.storeCases(db0, s.id).every((c) => c.kind === 'ueberfaellig')), 'echte Läden: weiterhin nur „Inventur überfällig“')

  // Kennzahlen
  const ks = db0.stores.map((s) => kp.storeKpi(db0, s.id))
  ok(ks.every((k) => k.revMonth > 0 && k.cupsPerHour > 0 && k.cogsPerCup > 0 && k.cogsPerCup < 5 && k.staffQuote > 0 && k.staffQuote < 60), 'Kennzahlen plausibel (Wareneinsatz/Becher 0–5 €, Personalquote < 60 %)')
  console.log('  Kennzahlen Flagship:', JSON.stringify({ ...kp.storeKpi(db0, TOUR_STORE), flags: undefined }))
  console.log('  Flags:', ks.filter((k) => k.flags.length).map((k) => k.storeId + ':' + k.flags.map((f) => f.key).join('+')).join(' | '))
  ok(ks.filter((k) => k.flags.length).length <= 8, 'Kennzahlen-Hinweise im Cockpit bleiben übersichtlich')
  ok(!/employees|wage|shifts/.test(src('pages/Kennzahlen.tsx')), 'Kennzahlen: keine Personendaten')

  // Franchise-Gebühren
  const months = fe.lastMonths(3, today)
  const bielefeld2 = db0.stores.find((s) => s.id === 'bielefeld')!
  ok(months.length === 3 && !fe.feeInvoiceOf(db0, 'bielefeld', months[0]) && !!fe.feeInvoiceOf(db0, 'bielefeld', months[1]) && !!fe.feeInvoiceOf(db0, 'bielefeld', months[2]), 'Gebühren: letzte 2 Monate berechnet, jüngster wartet auf Klick')
  ok(!db0.invoices.some((i) => i.kind === 'gebuehr' && db0.stores.find((s) => s.id === i.storeId)!.own), 'HQ-eigene Stores zahlen keine Gebühren')
  const fee = fe.feeFor(fe.revCtx(db0), db0.settings.fees, 'bielefeld', months[0])
  ok(Math.abs(fee.license - fee.base * 0.06) < 0.01 && Math.abs(fee.marketing - fee.base * 0.02) < 0.01, `Gebühr = 6 % + 2 % von ${fee.base} €`)
  const nb = getDb().settings.invoiceNo.next, ni = getDb().invoices.length
  const fid = actions.createFeeInvoice('bielefeld', months[0])!
  const fi = getDb().invoices.find((i) => i.id === fid)!
  ok(fi.kind === 'gebuehr' && fi.net === fee.total && fi.number.endsWith(String(nb).padStart(4, '0')) && getDb().invoices.length === ni + 1 && fi.lines.length === 2, 'Gebühren-Rechnung im selben Nummernkreis, 2 Positionen')
  ok(actions.createFeeInvoice('bielefeld', months[0]) === null && actions.createFeeInvoice(TOUR_STORE, months[0]) === null, 'keine Doppelrechnung, eigener Store ohne Gebühren')
  const sid2 = actions.cancelInvoice(fid, 'Test')!
  ok(!!sid2 && getDb().invoices.find((i) => i.id === sid2)!.type === 'storno' && !fe.feeInvoiceOf(getDb(), 'bielefeld', months[0]), 'Gebühren-Rechnung nur per Stornorechnung korrigierbar')
  void bielefeld2

  // Pinnwand
  const unread0 = al.postAlerts(getDb(), TOUR_STORE).length
  ok(unread0 >= 1, `Pinnwand: ungelesene Nachrichten erscheinen in der Glocke (${unread0})`)
  actions.addPost({ title: 'Test', text: 'Hallo', important: true, to: ['bielefeld'] })
  ok(al.postAlerts(getDb(), 'bielefeld').some((a) => a.title.includes('Test')) && !al.postAlerts(getDb(), TOUR_STORE).some((a) => a.title.includes('Test')), 'Nachricht an ausgewählte Läden erreicht nur diese')
  const pid = getDb().posts[0].id
  actions.readPost(pid, 'bielefeld')
  ok(getDb().posts[0].readBy['bielefeld'] === today && !al.postAlerts(getDb(), 'bielefeld').some((a) => a.title.includes('Test')), 'Lesebestätigung sichtbar fürs HQ, Hinweis verschwindet')

  // Aktionen im Bestellvorschlag
  const fut = addDays(today, 5)
  const f0 = fcm.expectedUse(getDb(), TOUR_STORE, 'oreo', fut, today)
  actions.saveCampaign({ title: 'T', text: '', from: addDays(today, 3), to: addDays(today, 9), articleIds: ['oreo'], extraPct: 50, social: 'x' })
  const f1 = fcm.expectedUse(getDb(), TOUR_STORE, 'oreo', fut, today)
  ok(f0 > 0 && Math.abs(f1 / f0 - 1.5) < 0.001, 'Aktion: erwartete Mehrmenge fließt in den Forecast / Bestellvorschlag ein')
  ok(getDb().campaigns.length >= 4 && db0.campaigns.length === 3 && db0.knowledge.length >= 6 && db0.posts.length === 3, 'Demo: 3 Nachrichten, 3 Aktionen, Wissenseinträge')
  const tips = tp.storeTips(db0, TOUR_STORE, today)
  ok(tips.length >= 1 && tips.length <= 3 && tips.every((t) => t.text.length > 20), `Tipps: ${tips.length} Hinweise (${tips.map((t) => t.key).join(',')})`)
  console.log('  Tipps:', tips.map((t) => t.text).join(' || '))
  // Navigation
  ok(['Heute', 'Ware & Bestellen', 'Inventur', 'Team', 'Vom HQ', 'Cockpit', 'Läden', 'Bestellungen', 'Finanzen', 'Kommunikation', 'Katalog', 'Demo-Menü'].every((l) => app.includes(`label: '${l}'`)), 'Navigation: 5 Menüpunkte im Laden, 5 im HQ, unten Einstellungen/Demo-Menü/Katalog')
  ok(/glass topbar|topbar glass/.test(app) && /nowrap/.test(css), 'Kopfzeile: eine Leiste ohne Umbruch')
  actions.resetDemo()
}

console.log(fails ? `${fails} FEHLER` : 'alle Tests bestanden')
process.exit(fails ? 1 : 0)
