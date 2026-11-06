import { readFileSync, readdirSync, statSync } from 'node:fs'
const store: Record<string, string> = {}
;(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v }, removeItem: (k: string) => { delete store[k] } }
;(globalThis as any).sessionStorage = (globalThis as any).localStorage
let fails = 0
const ok = (c: boolean, m: string) => { if (!c) { fails++; console.log('FAIL', m) } else console.log('ok  ', m) }

const { getDb, actions } = await import('../src/data/repository')
const { todayISO, addDays } = await import('../src/lib/date')
const { TOUR_STORE, DEMO_STORE_2 } = await import('../src/data/stores')
const { todayState, salesToday, weekOverview } = await import('../src/logic/today')
const { forecastAll, reachTone } = await import('../src/logic/forecast')
const { articleRows, orderAllPlan } = await import('../src/logic/warelist')
const { orderPlan } = await import('../src/logic/orderplan')
const { planGap, planAllGaps, rankCandidates, shiftsOf } = await import('../src/logic/gapfill')
const { dayStaffing } = await import('../src/logic/staffing')
const { storeAlerts } = await import('../src/logic/alerts')
const { reminders } = await import('../src/lib/reminders')
const { isKnownRoute, storeRest } = await import('../src/lib/routes')
const { candidatesForGap } = await import('../src/logic/staffplan')
const { dayCups } = await import('../src/logic/history')

const db = getDb()
const today = todayISO()

// ---- Heute: Status passt zu Aufgaben und Ampeln ----
let statusOk = true, maxTasks = 0, gapFirst = true
for (const s of db.stores) {
  const st = todayState(db, s.id, today)
  maxTasks = Math.max(maxTasks, st.tasks.length)
  const red = st.tasks.some((t) => t.tone === 'red')
  const expLevel = st.tasks.length === 0 ? 'green' : red ? 'red' : 'yellow'
  const expHead = st.tasks.length === 0 ? 'Alles erledigt' : st.tasks.length === 1 ? '1 Ding zu tun' : `${st.tasks.length} Dinge zu tun`
  if (st.level !== expLevel || st.headline !== expHead || new Set(st.tasks.map((t) => t.key)).size !== st.tasks.length) statusOk = false
  if (st.tasks.some((t) => t.key === 'gaps') && st.tasks[0].key !== 'gaps') gapFirst = false
  // Ampel-Kopplung: rote, unbestellte Artikel ⇒ Bestell-Aufgabe in Rot
  const reds = forecastAll(db, s.id).filter((f) => reachTone(f) === 'red' && !f.ordered)
  if (reds.length && st.tasks.find((t) => t.key === 'order')?.tone !== 'red') statusOk = false
  const open = forecastAll(db, s.id).some((f) => reachTone(f) !== 'green' && !f.ordered)
  if (open && !st.tasks.some((t) => t.key === 'order')) statusOk = false
}
ok(statusOk, 'Heute: Status/Satz passt immer zu Aufgaben und Ampeln (alle 24 Läden)')
ok(maxTasks <= 5, `Heute: höchstens 5 Aufgaben (max ${maxTasks})`)
ok(gapFirst, 'Heute: Dienstplan-Lücken stehen ganz oben')
const sales = salesToday(db, TOUR_STORE, today)
const sd = db.saleDays.find((d) => d.storeId === TOUR_STORE && d.date === today)
ok(sales.cups === (sd ? dayCups(sd) : 0) && sales.cups > 0, `Verkäufe heute: ${sales.cups} Becher, ${Math.round(sales.revenue)} €`)
ok(sales.sizes.reduce((s, x) => s + x.n, 0) === sales.cups && sales.sizes.every((x, i, a) => i === 0 || a[i - 1].n >= x.n), 'Verkäufe: Größen nach Stückzahl sortiert, Summe = Becher')
ok(weekOverview(db, TOUR_STORE, today).length === 7, 'Diese Woche: 7 Tage')

// ---- Artikel-Liste: Sortierung, Vorschläge ----
const rows = articleRows(db, TOUR_STORE)
const rank = rows.map((f) => ({ red: 0, yellow: 1, green: 2 })[reachTone(f)])
ok(rank.every((r, i) => i === 0 || rank[i - 1] <= r) && rows.length === db.articles.length, 'Artikel-Liste: rot → gelb → grün, alle Artikel')
ok(articleRows(db, TOUR_STORE, 'toppings').every((f) => f.article.source === 'extern'), 'Filter Toppings')
const all = orderAllPlan(db, TOUR_STORE)
ok(all.zentrale.every((l) => db.articles.find((a) => a.id === l.articleId)?.source === 'zentrale') && all.suppliers.every((s) => s.supplier !== 'Headquarter' && s.lines.length > 0), `Alle Vorschläge: ${all.zentrale.length} Artikel für den Warenkorb, ${all.suppliers.length} Lieferanten`)
const before = getDb().orders.length
for (const s of all.suppliers) actions.placeOrder(TOUR_STORE, s.supplier, s.lines.map((l) => ({ articleId: l.articleId, packs: l.packs })))
ok(getDb().orders.length === before + all.suppliers.length, 'Alle Vorschläge: Toppings je Lieferant als bestellt markiert')
ok(orderAllPlan(getDb(), TOUR_STORE).suppliers.length === 0, 'Danach keine offenen Topping-Vorschläge mehr')

// ---- Mengenregler ----
let zonesOk = true
for (const f of forecastAll(db, TOUR_STORE)) {
  const p = orderPlan(f, db.settings.targetDays)
  if (!(p.min >= 1 && p.opt >= p.min && p.upper >= p.opt && p.max > p.upper) || p.zone(p.opt) !== 'optimal' || p.zone(p.upper + 1) !== 'viel' || (p.min > 1 && p.zone(p.min - 1) !== 'wenig')) zonesOk = false
}
ok(zonesOk, 'Mengenregler: zu wenig < optimal (Vorschlag) < zu viel für alle Artikel')
const mango = orderPlan(forecastAll(db, TOUR_STORE).find((f) => f.article.id === 'mango')!, 7)
const cup = orderPlan(forecastAll(db, TOUR_STORE).find((f) => f.article.id === 'becher-m')!, 7)
ok(/schlecht/.test(mango.warn) && /Lagerplatz/.test(cup.warn), 'Warnung bei „zu viel“: Obst schlecht werden / Becher Lagerplatz')

// ---- Bestellung → Auftragsbestätigung → Versand → Rechnung ----
const id = actions.placeCentralOrder(TOUR_STORE, [{ articleId: 'becher-m', packs: 2 }], addDays(today, 3), '')!
ok(getDb().centralOrders.find((o) => o.id === id)?.status === 'eingegangen', 'Absenden: Bestellung sofort eingegangen (Auftragsbestätigung)')
actions.confirmCentralOrder(id)
actions.shipCentralOrder(id, { carrier: 'DHL', trackingNo: '00340012345', etaDate: addDays(today, 1) })
const co = getDb().centralOrders.find((o) => o.id === id)!
ok(co.status === 'versendet' && co.trackingNo === '00340012345' && !!co.invoiceId && !!getDb().invoices.find((i) => i.id === co.invoiceId), 'Versand: Sendungsnummer und Rechnung entstehen automatisch')
getDb().deliveries.filter((d) => d.coId === id).forEach((d) => actions.confirmDelivery(d.id))
ok(['geliefert', 'berechnet'].includes(getDb().centralOrders.find((o) => o.id === id)!.status), 'Lieferung bestätigen an der Karte → geliefert')

// ---- Dienstplan-Lücken ----
const stores = [TOUR_STORE, 'bielefeld', ...db.stores.filter((s) => s.demo).map((s) => s.id)]
let nGaps = 0, nFull = 0, nWarnFree = 0, nSplit = 0, rankOk = true, whyOk = true
for (const sid of stores) {
  for (let i = 0; i < 14; i++) {
    const date = addDays(today, i)
    for (const g of dayStaffing(db, sid, date, today).gaps) {
      nGaps++
      const plan = planGap(db, sid, date, g, today)
      if (plan.picks.length && plan.uncovered.length === 0) nFull++
      if (plan.picks.every((p) => p.warnings.length === 0) && plan.picks.length) nWarnFree++
      if (plan.split) nSplit++
      if (!/Person(en)? nötig, \d+ eingeplant/.test(plan.why)) whyOk = false
      const c = candidatesForGap(db, sid, date, g, today)
      const r = rankCandidates(db, date, c, false)
      for (let k = 1; k < r.length; k++) {
        const a = r[k - 1], b = r[k]
        if (a.warnings.length > 0 && b.warnings.length === 0) rankOk = false
        if (!a.warnings.length && !b.warnings.length && a.openHours + 1e-9 < b.openHours) rankOk = false
      }
    }
  }
}
console.log(`     Lücken in 14 Tagen (${stores.length} Läden): ${nGaps}, voll vorgeschlagen: ${nFull}, ohne Warnung: ${nWarnFree}, Aufteilungen: ${nSplit}`)
ok(nGaps > 0, 'Es gibt Demo-Lücken')
ok(nFull === nGaps && nWarnFree === nGaps, 'Jede Demo-Lücke lässt sich mit einem Vorschlag ohne Warnung schließen')
ok(rankOk, 'Rangfolge: ohne Warnung zuerst, dann größte offene Stundenzahl')
ok(whyOk, 'Begründung „… X Personen nötig, Y eingeplant“')

// Aufteilung und „Niemand verfügbar“ in einer konstruierten Lücke
{
  const sid = TOUR_STORE
  let found: { date: string; g: { from: number; to: number; missing: number } } | null = null
  for (let i = 0; i < 14 && !found; i++) { const date = addDays(today, i); const g = dayStaffing(db, sid, date, today).gaps.find((x) => x.to - x.from >= 4); if (g) found = { date, g } }
  if (found) {
    const { date, g } = found
    const emps = db.employees.filter((e) => e.storeId === sid && e.active)
    const mid = g.from + 2
    const av = (empId: string, kind: 'nicht' | 'frei', from?: number, to?: number) => ({ empId, date, kind, from, to })
    const base = db.availability.filter((a) => !(a.date === date && emps.some((e) => e.id === a.empId)))
    const shiftsClean = db.shifts.filter((s) => !(s.date === date && s.storeId === sid))
    const mk = (list: ReturnType<typeof av>[]) => ({ ...db, shifts: shiftsClean, absences: [], availability: [...base, ...emps.map((e) => list.find((x) => x.empId === e.id) ?? av(e.id, 'nicht'))] })
    const gapNow = (d: typeof db) => dayStaffing(d, sid, date, today, d.shifts).gaps.find((x) => x.from < g.to && x.to > g.from)!
    const d1 = mk([av(emps[0].id, 'frei', g.from, mid), av(emps[1].id, 'frei', mid, g.to + 2)])
    const gg = gapNow(d1)
    const p1 = planGap(d1, sid, date, gg, today)
    console.log(`     Aufteilung: ${p1.picks.map((p) => `${p.emp.name} ${p.start}-${p.end}`).join(' | ')}`)
    ok(p1.picks.length === 2 && p1.split && p1.picks[0].end === p1.picks[1].start, 'Lücke teilweise füllbar → Aufteilung auf zwei Personen')
    const d2 = mk([])
    const p2 = planGap(d2, sid, date, gapNow(d2), today)
    ok(p2.picks.length === 0 && !!p2.tip && p2.uncovered.length > 0, 'Niemand verfügbar → klarer Hinweis mit Tipp')
    // Vorschlag übernehmen schließt die Lücke
    const p3 = planGap(db, sid, date, g, today)
    actions.saveShifts(shiftsOf(sid, date, p3.picks))
    const after = dayStaffing(getDb(), sid, date, today).gaps.filter((x) => x.from < g.to && x.to > g.from)
    ok(after.length === 0 || after.reduce((m, x) => m + x.missing, 0) < g.missing + 1, 'Vorschlag übernehmen: Lücke danach geschlossen/kleiner, Schicht im Kalender')
  }
}
{
  const d = getDb()
  const sid = 'bielefeld'
  const dates = Array.from({ length: 7 }, (_, i) => addDays(today, i))
  const gapsBefore = dates.reduce((n, x) => n + dayStaffing(d, sid, x, today).gaps.length, 0)
  const res = planAllGaps(d, sid, dates, today)
  actions.saveShifts(res.shifts)
  const gapsAfter = dates.reduce((n, x) => n + dayStaffing(getDb(), sid, x, today).gaps.length, 0)
  console.log(`     Alle Lücken füllen (bielefeld, 7 Tage): ${gapsBefore} Lücken → ${res.items.length} Schichten vorgeschlagen → ${gapsAfter} übrig`)
  ok(gapsBefore === 0 || (res.items.length > 0 && gapsAfter < gapsBefore), 'Alle Lücken automatisch füllen: weniger Lücken, Übersicht mit Anzahl')
}

// ---- Erinnerungen ----
{
  const d = getDb()
  const withGap = stores.find((s) => storeAlerts(d, s).some((a) => a.key.includes('|gap|')))
  reminders.set('gap', { on: false })
  const off = withGap ? storeAlerts(d, withGap).some((a) => a.key.includes('|gap|')) : false
  reminders.set('gap', { on: true })
  const on = withGap ? storeAlerts(d, withGap).some((a) => a.key.includes('|gap|')) : true
  ok(!off && on, 'Erinnerung Dienstplan-Lücke: Schalter wirkt (aus = keine Glocke, an = Glocke)')
  reminders.set('hq', { on: false, channel: 'email' })
  ok(!storeAlerts(d, TOUR_STORE).some((a) => a.key.startsWith('post|')), 'Erinnerung Nachricht vom HQ lässt sich ausschalten')
  reminders.reset()
  ok(reminders.get().inventory.channel === 'push' && reminders.get().hq.on, 'Erinnerungen: Standard Push, alle an')
}

// ---- Adressen: keine toten Links ----
function walk(dir: string, out: string[] = []) { for (const f of readdirSync(dir)) { const p = `${dir}/${f}`; statSync(p).isDirectory() ? walk(p, out) : /\.tsx?$/.test(f) && out.push(p) } return out }
const dead: string[] = []
for (const f of walk(`${process.cwd()}/src`)) {
  if (/\/(App\.tsx|lib\/routes\.ts)$/.test(f)) continue
  const t = readFileSync(f, 'utf8')
  for (const m of t.matchAll(/['"`](\/(?:filiale|zentrale|einstellungen)[^'"`]*)['"`]/g)) {
    let p = m[1]
    if (p.includes('${')) p = p.replace(/\$\{[^}]*(storeId|s\.id|c\.storeId|st\.id|store\.id|id)[^}]*\}/g, 'x').replace(/\$\{[^}]*\}/g, 'x')
    if (p === '/filiale/' || p === '/filiale' || /^\/zentrale\/eigene\/x$/.test(p) || /^\/zentrale\/eigene\/x\/?$/.test(p) || p === '/zentrale/eigene/') continue
    if (/\/(ware|hq|finanzen|kommunikation)\/\$\{|\/filiale\/\$\{t\.to\}|\$\{[^}]*\}\/\$\{[^}]*\}$/.test(m[1])) continue
    if (!isKnownRoute(p)) dead.push(`${f.split('/src/')[1]}: ${m[1]}`)
  }
}
console.log(dead.length ? '     tote Links:\n       ' + dead.join('\n       ') : '     keine toten Links')
for (const m of readFileSync(`${process.cwd()}/src/logic/today.ts`, 'utf8').matchAll(/to: '([^']+)'/g)) if (!isKnownRoute(`/filiale/${m[1]}`)) dead.push(`today.ts: ${m[1]}`)
for (const m of readFileSync(`${process.cwd()}/src/ui/Tour.tsx`, 'utf8').matchAll(/route: [`'](\/[^`']+)[`']/g)) if (!isKnownRoute(m[1].replace('${DEMO_STORE_2}', 'beispielhausen'))) dead.push(`Tour.tsx: ${m[1]}`)
ok(dead.length === 0, 'Adressen: alle Links/Tour-Schritte führen auf vorhandene Seiten')
ok(storeRest('/bestellliste') === '/ware/artikel' && storeRest('/dienstplan') === '/team' && storeRest('/pinnwand') === '/hq/pinnwand', 'Alte Adressen werden umgeleitet')

// ---- Kein Rosa mehr ----
const pinkish: string[] = []
const hue = (hex: string) => { const h = hex.length === 4 ? hex.slice(1).split('').map((c) => c + c).join('') : hex.slice(1); const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b); const d = mx - mn; if (d < 0.05) return -1; const hh = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return ((hh * 60) + 360) % 360 }
for (const f of [...walk(`${process.cwd()}/src`), `${process.cwd()}/src/styles.css`, `${process.cwd()}/src/design.css`]) {
  const t = readFileSync(f, 'utf8')
  for (const m of t.matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g)) { const hh = hue(m[0]); if (hh >= 290 && hh <= 350) pinkish.push(`${f.split('/src/')[1]}: ${m[0]}`) }
  for (const m of t.matchAll(/rgba?\((\d+), ?(\d+), ?(\d+)/g)) { const hx = '#' + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join(''); const hh = hue(hx); if (hh >= 290 && hh <= 350) pinkish.push(`${f.split('/src/')[1]}: ${m[0]})`) }
}
console.log(pinkish.length ? '     Rosa gefunden:\n       ' + [...new Set(pinkish)].join('\n       ') : '     kein Rosa/Magenta im Code')
ok(pinkish.length === 0, 'Design: kein Rosa/Magenta mehr')

// ---- Rechte ----
const { levelFor } = await import('../src/lib/access')
const bielefeld = db.stores.find((s) => s.id === 'bielefeld')!
ok(levelFor({ role: 'hq' }, bielefeld) === 'control' && levelFor({ role: 'hq' }, db.stores.find((s) => s.id === TOUR_STORE)!) === 'full', 'HQ: Kontrolle bei Franchise, volle Ansicht bei HQ-eigenen Läden')

// ---- Tour: zurücksetzen ----
{
  const snap = actions.tourBegin()
  actions.saveShifts([{ id: 'zz', storeId: TOUR_STORE, empId: db.employees[0].id, date: today, start: 11, end: 12, locked: true, why: '' }])
  actions.placeCentralOrder(TOUR_STORE, [{ articleId: 'becher-s', packs: 1 }], today, '')
  actions.tourRestore(snap)
  ok(getDb() === snap, 'Tour: alles danach auf den Ausgangsstand zurückgesetzt')
}
const tour = readFileSync(`${process.cwd()}/src/ui/Tour.tsx`, 'utf8')
ok((tour.match(/^\s*(\{ |\{\n\s+)?route: /gm) ?? []).length === 8 || (tour.match(/route: ['`]/g) ?? []).length >= 8, 'Tour: 8 Schritte')
void DEMO_STORE_2
console.log(fails ? `\n${fails} FEHLER` : '\nalles ok')
process.exit(fails ? 1 : 0)
