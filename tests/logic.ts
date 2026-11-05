const store: Record<string, string> = {}
;(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v }, removeItem: (k: string) => { delete store[k] } }
let fails = 0
const ok = (c: boolean, m: string) => { if (!c) { fails++; console.log('FAIL', m) } else console.log('ok  ', m) }
const eq = (a: unknown, b: unknown, m: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} (${JSON.stringify(a)} vs ${JSON.stringify(b)})`)

const { legalHolidays, easterSunday } = await import('../src/data/holidays')
eq(easterSunday(2026), '2026-04-05', 'Ostern 2026')
eq(easterSunday(2027), '2027-03-28', 'Ostern 2027')
const nw = legalHolidays('NW', 2026).map((h) => h.date)
ok(nw.includes('2026-04-03') && nw.includes('2026-04-06') && nw.includes('2026-05-14') && nw.includes('2026-05-25') && nw.includes('2026-06-04') && nw.includes('2026-11-01'), 'NRW: Karfreitag, Ostermo, Himmelfahrt, Pfingstmo, Fronleichnam, Allerheiligen')
ok(!nw.includes('2026-10-31') && !nw.includes('2026-01-06'), 'NRW: kein Reformationstag/Drei Könige')
ok(legalHolidays('HH', 2026).some((h) => h.date === '2026-10-31'), 'HH: Reformationstag')
ok(legalHolidays('BY', 2026).some((h) => h.date === '2026-01-06'), 'BY: Heilige Drei Könige')
ok(legalHolidays('SH', 2027).some((h) => h.date === '2027-10-31'), 'SH 2027 Reformationstag')

const { buildSeed } = await import('../src/data/seed')
const { getDb, actions } = await import('../src/data/repository')
const { TOUR_STORE } = await import('../src/data/stores')
const { todayISO, addDays } = await import('../src/lib/date')
const today = todayISO()
const base = getDb()
ok(base.stores.length === 24, '24 Läden')
ok(!JSON.stringify(base.recipes).toLowerCase().includes('cloudy') && !base.articles.some((a) => a.id === 'fluff'), 'keine Cloudys / Fluff')
ok(!JSON.stringify([base.settings, base.stores]).match(/Kuala|Malay|RM /), 'nichts Malaysisches')

// Bestellung -> Rechnung
const inv = await import('../src/logic/invoice')
const lines = [{ articleId: 'pulver', packs: 3 }, { articleId: 'becher-m', packs: 5 }, { articleId: 'loeffel', packs: 2 }]
const n0 = base.invoices.length, nextBefore = base.settings.invoiceNo.next
const id = actions.placeCentralOrder(TOUR_STORE, lines, addDays(today, 3), 'Test')!
let db = getDb()
eq(db.centralOrders.find((c) => c.id === id)!.status, 'eingegangen', 'Status eingegangen')
actions.confirmCentralOrder(id, { 'becher-m': { packs: 4, reason: 'Lieferengpass' } })
db = getDb(); const co = db.centralOrders.find((c) => c.id === id)!
eq([co.status, co.lines[1].confirmed, co.lines[1].reason], ['bestätigt', 4, 'Lieferengpass'], 'bestätigt mit angepasster Menge')
const delBefore = db.deliveries.length
actions.shipCentralOrder(id)
db = getDb()
eq(db.deliveries.length - delBefore, 3, 'Lieferung als Wareneingang (3 Positionen)')
const dq = db.deliveries.filter((d) => d.coId === id).find((d) => d.articleId === 'becher-m')!
eq(dq.qty, 4 * 50, 'gelieferte Menge = bestätigte Menge')
ok(!dq.confirmed, 'Filiale muss Empfang bestätigen')
db = getDb()
const invId = db.centralOrders.find((c) => c.id === id)!.invoiceId!
ok(!!invId, 'beim Versand entsteht automatisch die Rechnung')
eq(db.centralOrders.find((c) => c.id === id)!.status, 'versendet', 'Bestellung bleibt bis zum Empfang „versendet“')
const iv = db.invoices.find((i) => i.id === invId)!
eq(iv.number, inv.formatInvoiceNumber({ ...base.settings.invoiceNo }, today, nextBefore), 'Rechnungsnummer = nächste Nummer')
// Steuer: pulver 3*94=282 (7%), becher 4*11.5=46 + loeffel 2*7.9=15.8 (19%)
eq(iv.taxes, [{ rate: 7, net: 282, vat: 19.74 }, { rate: 19, net: 61.8, vat: 11.74 }], 'Steuersummen je Satz')
eq([iv.net, iv.vat, iv.gross], [343.8, 31.48, 375.28], 'Netto/USt/Brutto')
ok(actions.createInvoice([id]) === null, 'keine Doppelberechnung')
eq(db.settings.invoiceNo.next, nextBefore + 1, 'Zähler +1')
// Empfang bestätigen -> berechnet bleibt berechnet
db.deliveries.filter((d) => d.coId === id).forEach((d) => actions.confirmDelivery(d.id))
eq(getDb().centralOrders.find((c) => c.id === id)!.status, 'berechnet', 'nach Empfang und Rechnung: Status berechnet')
// Storno
const sid = actions.cancelInvoice(invId, 'falsche Menge')!
db = getDb(); const st = db.invoices.find((i) => i.id === sid)!
eq([st.type, st.refNumber, st.gross], ['storno', iv.number, -375.28], 'Stornorechnung negativ mit Bezug')
eq(st.number, inv.formatInvoiceNumber(base.settings.invoiceNo, today, nextBefore + 1), 'Storno: nächste fortlaufende Nummer')
eq(db.invoices.find((i) => i.id === invId)!.cancelledBy, sid, 'Original verweist auf Storno')
eq(db.invoices.find((i) => i.id === invId)!.lines, iv.lines, 'Original unverändert')
ok(actions.cancelInvoice(invId, 'nochmal') === null, 'nicht doppelt stornierbar')
// Nummern lückenlos
const nums = db.invoices.map((i) => Number(i.number.slice(-4)))
ok(nums.every((n, i) => n === i + 1) && db.invoices.length === n0 + 2, 'Nummern lückenlos 1..n')
actions.setInvoiceNumbering('FY-{JJJJ}-', 3, 4)
eq(getDb().settings.invoiceNo.next, nextBefore + 2, 'Nummernkreis nicht unter vergebene Nummer setzbar')
// Status
eq(inv.invoiceState({ ...iv, dueDate: addDays(today, -1) }, today), 'überfällig', 'überfällig')
eq(inv.invoiceState({ ...iv, dueDate: addDays(today, 5) }, today), 'offen', 'offen')
eq(inv.invoiceState({ ...iv, paidOn: today }, today), 'bezahlt', 'bezahlt')
actions.markPaid(base.invoices.find((i) => !i.paidOn && i.type === 'rechnung' && !i.cancelledBy)!.id)
const sums = inv.invoiceSums(getDb().invoices, today)
ok(sums.open >= sums.overdue && sums.overdue > 0, 'Summen offen/überfällig')
const en = inv.toEn16931(iv)
eq([en.BT3_typeCode, en.BT112_gross ?? en.BG22_totals.BT112_gross], ['380', 375.28], 'EN16931-Abbild')

// Wetter-Forecast Deutschland: Ähnliche Tage
const { similarDays } = await import('../src/logic/history')
const r = similarDays(db, TOUR_STORE, { date: addDays(today, 3), wx: { tmax: 26, rain: 0, code: 0, sun: 11 }, type: 'sa-so', ferien: false }, today)
ok(r.days.length >= 3, `ähnliche Tage gefunden (${r.days.length}, ${r.level})`)
const { wxOn, dayCups, saleDayOf } = await import('../src/logic/history')
// Saison: Sommer deutlich mehr als Winter
let sum = (m: string) => { let s = 0, n = 0; for (const d of db.saleDays) if (d.storeId === TOUR_STORE && d.date.slice(5, 7) === m && d.date < today) { s += dayCups(d); n++ } return s / n }
ok(sum('07') > 1.6 * sum('01') || sum('08') > 1.6 * sum('02'), `Saison: Sommer ${Math.round(sum('08'))} vs Winter ${Math.round(sum('02'))}`)
void wxOn; void saleDayOf

// Personalbedarf
const { staffDay } = await import('../src/logic/staffing')
const sd = staffDay(db, TOUR_STORE, addDays(today, 3), today)
ok(sd.hours.every((h) => h.staff >= 2 && h.staff === Math.max(2, Math.ceil(h.cups / 25 - 1e-9))), 'Bedarf = ceil(Becher/25), mind. 2')
ok(sd.noWeather, 'Tage ohne Wetter markiert (offline)')

// Planer
const { planRange, validateShifts, hourAccount, maxMonthHours, blocksFromNeed } = await import('../src/logic/hr')
const emps = db.employees.filter((e) => e.storeId === 'bielefeld')
eq(blocksFromNeed({ 11: 2, 12: 2, 13: 2, 14: 2, 15: 3, 16: 3, 17: 2, 18: 2, 19: 2 }, Array(9).fill(0), 11, 20, 3, 8).map((b) => [b.start, b.end]), [[11, 16], [16, 20], [11, 16], [16, 20], [15, 18]], 'Blöcke 3–8 Std.')
const hr = db.settings.hr
const mk = (over: any[]) => over.map((o, i) => ({ ...emps[0], id: 'p' + i, storeId: 'bielefeld', quals: [], active: true, under18: false, contractId: 'teilzeit', targetHours: 80, maxWeekHours: 30, wage: 15, name: 'P' + i + ' X', ...o }))
const ctx = (es: any[], av: any, fixed: any[] = [], need: any = { 11: 1, 12: 1, 13: 1, 14: 1, 15: 1, 16: 1, 17: 1, 18: 1, 19: 1 }) => {
  let n = 0
  return { hr, storeId: 'bielefeld', employees: es, open: () => ({ open: 11, close: 20 }), avail: av, need: () => need, fixed, newId: () => 'x' + ++n }
}
// Vorrang offener Stunden
let es = mk([{ targetHours: 40 }, { targetHours: 90 }])
let out = planRange(ctx(es, () => [11, 20]), ['2026-12-01']).shifts
ok(out.length > 0 && out[0].empId === 'p1' && out[0].why.includes('noch 90'), 'Vorrang: größte offene Stundenzahl zuerst')
// nur Verfügbare
out = planRange(ctx(es, (e: any) => (e.id === 'p0' ? [11, 20] : null)), ['2026-12-01']).shifts
ok(out.length > 0 && out.every((s) => s.empId === 'p0'), 'nur verfügbare Personen')
out = planRange(ctx(es, () => null), ['2026-12-01']).shifts
eq(out.length, 0, 'niemand verfügbar → Lücke')
// Verfügbarkeit nachmittags
out = planRange(ctx(es.slice(0, 1), () => [15, 20]), ['2026-12-01']).shifts
ok(out.every((s) => s.start >= 15), 'Fenster nachmittags respektiert')
// Minijob-Grenze
es = mk([{ contractId: 'minijob', wage: 14, targetHours: 60, maxWeekHours: 40 }])
const mmj = maxMonthHours(hr, es[0], '2026-12-01')!
eq(mmj, Math.floor((603 / 14) * 10) / 10, 'Minijob-Maximalstunden aus Lohn')
let tot = 0
const days = Array.from({ length: 28 }, (_, i) => addDays('2026-12-01', i))
const mj = planRange(ctx(es, () => [11, 20]), days).shifts.filter((s) => s.date.startsWith('2026-12'))
for (const s of mj) tot += s.end - s.start - (s.end - s.start > 6 ? 0.5 : 0)
ok(tot <= mmj + 1e-9 && tot > mmj - 6, `Minijob-Grenze eingehalten (${tot} ≤ ${mmj})`)
// Höchststunden/Woche + Ruhezeit + Tagesgrenze
es = mk([{ maxWeekHours: 12, targetHours: 200 }])
const wk = planRange(ctx(es, () => [11, 20]), ['2026-12-07', '2026-12-08', '2026-12-09', '2026-12-10', '2026-12-11']).shifts
const wh = wk.reduce((s, x) => s + x.end - x.start - (x.end - x.start > 6 ? 0.5 : 0), 0)
ok(wh <= 12, `Wochenhöchststunden (${wh} ≤ 12)`)
es = mk([{ targetHours: 200, maxWeekHours: 60 }])
const rest = planRange(ctx(es, (_e: any, d: string) => (d === '2026-12-07' ? [11, 20] : [11, 20]), [{ id: 'f', storeId: 'bielefeld', empId: 'p0', date: '2026-12-07', start: 14, end: 23, locked: true, why: '' }], { 11: 1, 12: 1, 13: 1, 14: 1 }), ['2026-12-08']).shifts
ok(rest.every((s) => 24 + s.start - 23 >= 11), 'Ruhezeit 11 Std. nach Spätschicht')
const u18 = mk([{ under18: true, targetHours: 100 }])
const uo = planRange(ctx(u18, () => [11, 20]), ['2026-12-09']).shifts
ok(uo.every((s) => s.end - s.start <= 8 && s.end <= 20), 'unter 18: strengere Grenzen')
// Schichtleitung
es = mk([{ targetHours: 100 }, { targetHours: 20, quals: ['Schichtleitung'] }])
out = planRange(ctx(es, () => [11, 20]), ['2026-12-02']).shifts
ok(out.some((s) => s.empId === 'p1'), 'Schichtleitung bevorzugt trotz weniger offener Stunden')
// Gesperrte Schichten bleiben beim erneuten Erstellen
actions.generateSchedule(TOUR_STORE, today, 14)
db = getDb(); const one = db.shifts.find((s) => s.storeId === TOUR_STORE && s.date > today)!
actions.saveShift({ ...one, locked: true, why: 'x' })
actions.generateSchedule(TOUR_STORE, today, 14)
ok(getDb().shifts.some((s) => s.id === one.id && s.locked), 'gesperrte Schicht bleibt')
ok(validateShifts(getDb(), TOUR_STORE, today, addDays(today, 13)).length === 0, 'Plan ohne Regelverstöße')
// Stundenkonto
const e0 = getDb().employees.find((e) => e.storeId === TOUR_STORE)!
const ac = hourAccount(getDb(), e0, today)
ok(Math.abs(ac.kumuliert) < 40 && ac.soll === e0.targetHours, `Stundenkonto plausibel (kum ${ac.kumuliert.toFixed(1)})`)
// Import
const ad = await import('../src/logic/adapters')
const pe = getDb().employees.filter((e) => e.storeId === TOUR_STORE)
const csv = ad.sampleCsv(pe, addDays(today, 1))
const pr = ad.parseAvailabilityCsv(csv, pe)
ok(pr.errors.length === 0 && pr.rows.length === 12, 'CSV-Beispiel importierbar')
const pj = ad.parseAvailabilityJson(ad.sampleJson(pe, addDays(today, 1)), pe)
eq(pj.rows, pr.rows, 'JSON = CSV')
ok(ad.parseAvailabilityCsv('mitarbeiter;datum;verfuegbarkeit\nNiemand;2026-01-01;ganztags', pe).errors.length === 1, 'Importfehler erkannt')
ok(ad.exportScheduleCsv(getDb(), TOUR_STORE, today, addDays(today, 13)).split('\n').length > 10, 'CSV-Export')
// Tour: Snapshot/Reset
const snap = actions.tourBegin()
actions.placeCentralOrder(TOUR_STORE, lines, today, '')
actions.tourRestore(snap)
eq(getDb().settings.invoiceNo.next, snap.settings.invoiceNo.next, 'Tour-Reset: Rechnungsnummer')
ok(getDb() === snap, 'Tour-Reset: Daten identisch')
// Storage Delta
const { flushNow, getBase } = await import('../src/data/storage')
flushNow()
const raw = store['fj-ww-delta-v5']
ok(!!raw && raw.length < 400000, `nur Änderungen gespeichert (${raw?.length} Zeichen)`)
const { applyNode, diffNode } = await import('../src/data/storage')
const patch = diffNode(getBase(), getDb(), '')!
const re = applyNode(getBase(), patch, '') as any
eq(re.invoices.length, getDb().invoices.length, 'Patch rekonstruiert Rechnungen')
console.log(fails ? `${fails} FEHLER` : 'ALLE TESTS OK')
