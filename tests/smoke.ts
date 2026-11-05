const store: Record<string, string> = {}
;(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v }, removeItem: (k: string) => { delete store[k] } }
const t0 = Date.now()
const { buildSeed } = await import('../src/data/seed')
const db = buildSeed()
console.log('seed ms', Date.now() - t0, 'stores', db.stores.length, 'saleDays', db.saleDays.length, 'deliveries', db.deliveries.length, 'cos', db.centralOrders.length, 'inv', db.invoices.length, 'emps', db.employees.length, 'shifts', db.shifts.length)
const { storeShrinkage } = await import('../src/logic/shrinkage')
const t1 = Date.now()
for (const s of db.stores) { const sh = storeShrinkage(db, s.id); console.log(s.id.padEnd(26), sh.light.padEnd(7), (sh.cups?.pct ?? 0).toFixed(1), (sh.powder?.pct ?? 0).toFixed(1), 'unusual', sh.unusualOutflows.length) }
console.log('shrink ms', Date.now() - t1)
const { invoiceSums, invoiceState } = await import('../src/logic/invoice')
console.log(invoiceSums(db.invoices), db.invoices.slice(0, 2).map((i) => [i.number, i.date, i.gross, invoiceState(i)]))
const states: Record<string, number> = {}
for (const i of db.invoices) states[invoiceState(i)] = (states[invoiceState(i)] ?? 0) + 1
console.log(states, 'co status', db.centralOrders.reduce((m: any, c) => ((m[c.status] = (m[c.status] ?? 0) + 1), m), {}))
const { dayStaffing, staffDay } = await import('../src/logic/staffing')
const { todayISO, addDays } = await import('../src/lib/date')
const today = todayISO()
const t2 = Date.now()
for (const id of ['duesseldorf-carlstadt', 'hamburg-rathaus']) {
  for (let i = 0; i < 7; i++) { const d = addDays(today, i); const sd = staffDay(db, id, d); const ds = dayStaffing(db, id, d); console.log(id, d, 'cups', Math.round(sd.cups), 'peak', sd.peak, 'light', ds.light, 'gaps', JSON.stringify(ds.gaps), sd.level) }
}
console.log('staff ms', Date.now() - t2)
const { hourAccount, validateShifts } = await import('../src/logic/hr')
const emps = db.employees.filter((e) => e.storeId === 'duesseldorf-carlstadt')
for (const e of emps) { const a = hourAccount(db, e); console.log(e.name.padEnd(22), e.contractId.padEnd(12), 'soll', e.targetHours, 'ist', a.gearbeitet.toFixed(1), 'plan', a.geplant.toFixed(1), 'saldo', a.saldo.toFixed(1), 'kum', a.kumuliert.toFixed(1), a.flag) }
let viol = 0
for (const s of db.stores) viol += validateShifts(db, s.id, addDays(today, -120), addDays(today, 14)).length
console.log('violations total', viol)
const { forecastAll } = await import('../src/logic/forecast')
const t3 = Date.now()
const fc = forecastAll(db, 'duesseldorf-carlstadt')
console.log('forecast ms', Date.now() - t3, fc.filter((f) => f.light !== 'green').map((f) => f.article.id + ':' + f.light).join(' '))
