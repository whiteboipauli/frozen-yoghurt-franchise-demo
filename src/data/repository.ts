import { useSyncExternalStore } from 'react'
import { inventoryState } from '../logic/inventory'
import type { CostTargets, Absence, Article, Availability, Campaign, KnowEntry, Post, CaseRec, CaseStatus, CentralOrder, CoLine, Company, Db, Delivery, Employee, Holiday, HrSettings, Invoice, InventoryLine, Order, OrderLine, Outflow, OutflowReason, Recipe, SaleDay, SchoolHoliday, Settings, Shift, Store } from './types'
import { makeTracking } from '../logic/shipping'
import { load, reset, save } from './storage'
import { addDays, todayISO } from '../lib/date'
import { packBase, toBase } from '../logic/consumption'
import { stockNow } from '../logic/stock'
import { tuneMango } from '../logic/tourprep'
import { TOUR_STORE } from './stores'
import { formatInvoiceNumber, makeInvoice, makeStorno, nextCoNo, packsOf, round2, totalsOf } from '../logic/invoice'
import { availWindow, isAbsent, planRange } from '../logic/hr'
import { openHours } from '../logic/history'
import { staffDay } from '../logic/staffing'
import { reportSick, requestCover, answerCover, leaveOpen, setEau } from '../logic/callouts'
import { feeFor, feeInvoiceOf, makeFeeInvoice, revCtx } from '../logic/fees'

/**
 * Datenschicht: Alle Lese- und Schreibzugriffe der Oberfläche laufen über diese Datei.
 * Für eine echte Datenbank genügt es, `load/save` (storage.ts) bzw. die Funktionen in `actions`
 * gegen API-Aufrufe auszutauschen – die Oberfläche bleibt unverändert.
 */
let state: Db = load()
const listeners = new Set<() => void>()

function commit(next: Db) {
  state = next
  save(state)
  listeners.forEach((l) => l())
}
const update = (fn: (db: Db) => Db) => commit(fn(state))

export const getDb = () => state
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
export const useDb = () => useSyncExternalStore(subscribe, getDb)

const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

/* ---------- reine Änderungsfunktionen (auch für Tests) ---------- */
export function placeCentralOrder(db: Db, storeId: string, lines: CoLine[], wishDate: string, note: string, id = uid('co')): { db: Db; id: string } | null {
  const ls = lines.filter((l) => l.packs > 0)
  if (!ls.length) return null
  const co: CentralOrder = { id, no: nextCoNo(db), storeId, createdOn: todayISO(), wishDate, note: note.trim(), lines: ls.map((l) => ({ articleId: l.articleId, packs: l.packs })), status: 'eingegangen' }
  return { db: { ...db, centralOrders: [...db.centralOrders, co] }, id }
}

/** HQ bestätigt (Mengen anpassbar, dann mit Begründung) */
export function confirmCentralOrder(db: Db, id: string, changes: Record<string, { packs: number; reason?: string }> = {}): Db {
  const co = db.centralOrders.find((c) => c.id === id)
  if (!co || co.status !== 'eingegangen') return db
  const lines = co.lines.map((l) => {
    const ch = changes[l.articleId]
    return ch && ch.packs !== l.packs ? { ...l, confirmed: Math.max(0, ch.packs), reason: ch.reason?.trim() || undefined } : l
  })
  return { ...db, centralOrders: db.centralOrders.map((c) => (c.id === id ? { ...c, lines, status: 'bestätigt', confirmedOn: todayISO() } : c)) }
}

export interface ShipDetails { carrier: string; trackingNo: string; etaDate: string }
/** Als versendet markieren (mit Versanddienstleister, Sendungsnummer, voraussichtlichem Lieferdatum): die Lieferung erscheint beim Laden als Wareneingang (noch unbestätigt) */
export function shipCentralOrder(db: Db, id: string, details?: Partial<ShipDetails>, date = todayISO()): Db {
  const co = db.centralOrders.find((c) => c.id === id)
  if (!co || co.status !== 'bestätigt') return db
  const deliveries: Delivery[] = co.lines
    .filter((l) => packsOf(l) > 0)
    .map((l, i) => {
      const a = db.articles.find((x) => x.id === l.articleId)!
      return { id: `${uid('d')}${i}`, storeId: co.storeId, articleId: l.articleId, date, qty: packsOf(l) * packBase(a), coId: co.id, bookedBy: 'zentrale', confirmed: false }
    })
  const carrier = details?.carrier || 'DHL'
  const ship = { carrier, trackingNo: details?.trackingNo?.trim() || makeTracking(carrier, id + date), etaDate: details?.etaDate || addDays(date, 1) }
  const shipped: Db = { ...db, deliveries: [...db.deliveries, ...deliveries], centralOrders: db.centralOrders.map((c) => (c.id === id ? { ...c, status: 'versendet', shippedOn: date, ...ship } : c)) }
  // Mit dem Versand entsteht automatisch die Rechnung (die Bestellung bleibt „versendet“, bis der Laden den Empfang bestätigt)
  return createInvoice(shipped, [id], date, true)?.db ?? shipped
}

/** Nach Bestätigung der Filiale: Bestellung gilt als geliefert */
function settleDelivered(db: Db, coId?: string): Db {
  if (!coId) return db
  const co = db.centralOrders.find((c) => c.id === coId)
  if (!co || co.status !== 'versendet') return db
  if (db.deliveries.filter((d) => d.coId === coId).every((d) => d.confirmed)) return { ...db, centralOrders: db.centralOrders.map((c) => (c.id === coId ? { ...c, status: c.invoiceId ? 'berechnet' : 'geliefert', deliveredOn: todayISO() } : c)) }
  return db
}

/** Rechnung aus einer oder mehreren Lieferungen derselben Filiale */
export function createInvoice(db: Db, coIds: string[], date = todayISO(), keepStatus = false): { db: Db; id: string } | null {
  const cos = db.centralOrders.filter((c) => coIds.includes(c.id))
  if (!cos.length || cos.length !== coIds.length) return null
  if (cos.some((c) => c.storeId !== cos[0].storeId || c.invoiceId || !['versendet', 'geliefert'].includes(c.status))) return null
  const store = db.stores.find((s) => s.id === cos[0].storeId)!
  const cfg = db.settings.invoiceNo
  const id = uid('inv')
  const inv = makeInvoice({ id, number: formatInvoiceNumber(cfg, date), date, store, company: db.settings.company, paymentDays: db.settings.paymentDays, articles: db.articles, cos })
  if (!inv.lines.length) return null
  return {
    id,
    db: {
      ...db,
      invoices: [...db.invoices, inv],
      settings: { ...db.settings, invoiceNo: { ...cfg, next: cfg.next + 1 } },
      centralOrders: db.centralOrders.map((c) => (coIds.includes(c.id) ? { ...c, status: keepStatus ? c.status : 'berechnet', invoiceId: id } : c)),
    },
  }
}
/** Lieferungen eines Monats (noch nicht berechnet) einer Filiale */
export const openForInvoice = (db: Db, storeId: string, month?: string) =>
  db.centralOrders.filter((c) => c.storeId === storeId && !c.invoiceId && (c.status === 'versendet' || c.status === 'geliefert') && (!month || (c.shippedOn ?? '').slice(0, 7) === month))

export function cancelInvoice(db: Db, invoiceId: string, reason: string, date = todayISO()): { db: Db; id: string } | null {
  const orig = db.invoices.find((i) => i.id === invoiceId)
  if (!orig || orig.type !== 'rechnung' || orig.cancelledBy) return null
  const cfg = db.settings.invoiceNo
  const id = uid('inv')
  const st = makeStorno(orig, id, formatInvoiceNumber(cfg, date), date, reason.trim() || 'Korrektur')
  return {
    id,
    db: {
      ...db,
      invoices: [...db.invoices.map((i) => (i.id === invoiceId ? { ...i, cancelledBy: id } : i)), st],
      settings: { ...db.settings, invoiceNo: { ...cfg, next: cfg.next + 1 } },
      centralOrders: db.centralOrders.map((c) => (c.invoiceId === invoiceId ? { ...c, status: c.status === 'berechnet' ? 'geliefert' : c.status, invoiceId: undefined } : c)),
    },
  }
}

/** Franchise-Gebühren-Rechnung für einen Monat (nur Franchise-Läden, nur einmal je Monat) */
export function createFeeInvoice(db: Db, storeId: string, ym: string, date = todayISO()): { db: Db; id: string } | null {
  const store = db.stores.find((s) => s.id === storeId)
  if (!store || store.own || feeInvoiceOf(db, storeId, ym) || ym >= date.slice(0, 7)) return null
  const fee = feeFor(revCtx(db), db.settings.fees, storeId, ym)
  if (fee.total <= 0) return null
  const cfg = db.settings.invoiceNo
  const id = uid('inv')
  const inv = makeFeeInvoice({ id, number: formatInvoiceNumber(cfg, date), date, store, company: db.settings.company, paymentDays: db.settings.paymentDays, ym, fee, pct: db.settings.fees })
  return { id, db: { ...db, invoices: [...db.invoices, inv], settings: { ...db.settings, invoiceNo: { ...cfg, next: cfg.next + 1 } } } }
}

/** Dienstplan erstellen: gesperrte Schichten bleiben, alle anderen im Zeitraum werden neu verteilt */
export function generateSchedule(db: Db, storeId: string, from: string, days: number, newId: () => string, today = todayISO()): Db {
  const st = db.stores.find((s) => s.id === storeId)!
  const dates = Array.from({ length: days }, (_, i) => addDays(from, i))
  const to = dates[dates.length - 1]
  const inRange = (s: Shift) => s.storeId === storeId && s.date >= from && s.date <= to
  const kept = db.shifts.filter((s) => !inRange(s) || s.locked)
  const emps = db.employees.filter((e) => e.storeId === storeId && e.active)
  const hr = db.settings.hr
  const avail = (e: Employee, date: string): [number, number] | null => {
    if (isAbsent(db.absences, e.id, date)) return null
    const { open, close } = openHours(st, date)
    let w = availWindow(db.availability.find((a) => a.empId === e.id && a.date === date), open, close)
    if (w && e.under18) w = [w[0], Math.min(w[1], hr.under18.latestEnd)]
    return w && w[1] > w[0] ? w : null
  }
  const tmp: Db = { ...db, shifts: kept }
  const res = planRange({ hr, storeId, employees: emps, open: (d) => openHours(st, d), avail, need: (d) => staffDay(tmp, storeId, d, today).need, fixed: kept.filter((s) => s.storeId === storeId), newId }, dates)
  return { ...db, shifts: [...kept, ...res.shifts] }
}

export const actions = {
  resetDemo() {
    commit(reset())
  },

  /** Kassenverkauf buchen (später: Import aus helloTESS!). Toppings: je Eintrag eine Portion (Wiederholung = mehrere Portionen). */
  recordSale(storeId: string, recipeId: string, toppingIds: string[]) {
    update((db) => {
      const today = todayISO()
      const idx = db.saleDays.findIndex((d) => d.storeId === storeId && d.date === today)
      const day: SaleDay = idx >= 0 ? structuredClone(db.saleDays[idx]) : { storeId, date: today, counts: {}, toppings: {} }
      day.counts[recipeId] = (day.counts[recipeId] ?? 0) + 1
      for (const t of toppingIds) day.toppings[t] = (day.toppings[t] ?? 0) + 1
      const saleDays = idx >= 0 ? db.saleDays.map((d, i) => (i === idx ? day : d)) : [...db.saleDays, day]
      return { ...db, saleDays }
    })
  },

  /** Topping-Position(en) bei externem Lieferanten als bestellt markieren */
  placeOrder(storeId: string, supplier: string, lines: OrderLine[]) {
    update((db) => {
      const ls = lines.filter((l) => l.packs > 0)
      if (!ls.length) return db
      const lead = Math.max(...ls.map((l) => db.articles.find((a) => a.id === l.articleId)?.leadTimeDays ?? 1))
      const today = todayISO()
      const o: Order = { id: uid('o'), storeId, supplier, status: 'bestellt', orderedOn: today, expectedOn: addDays(today, lead), lines: ls }
      return { ...db, orders: [...db.orders, o] }
    })
  },

  /** Filiale: Topping-Lieferung buchen (Mengen in Packungen anpassbar) */
  receiveToppingOrder(orderId: string, packsByArticle?: Record<string, number>) {
    update((db) => {
      const o = db.orders.find((x) => x.id === orderId)
      if (!o || o.status !== 'bestellt') return db
      const today = todayISO()
      const nd: Delivery[] = o.lines.map((l) => {
        const a = db.articles.find((x) => x.id === l.articleId)!
        return { id: uid('d'), storeId: o.storeId, articleId: l.articleId, date: today, qty: (packsByArticle?.[l.articleId] ?? l.packs) * packBase(a), orderId: o.id, bookedBy: 'filiale', confirmed: true }
      })
      return { ...db, orders: db.orders.map((x) => (x.id === orderId ? { ...x, status: 'geliefert', deliveredOn: today } : x)), deliveries: [...db.deliveries, ...nd] }
    })
  },

  /* ----- Bestellung beim Headquarter ----- */
  placeCentralOrder(storeId: string, lines: CoLine[], wishDate: string, note: string): string | null {
    const r = placeCentralOrder(state, storeId, lines, wishDate, note)
    if (!r) return null
    commit(r.db)
    return r.id
  },
  confirmCentralOrder(id: string, changes?: Record<string, { packs: number; reason?: string }>) { update((db) => confirmCentralOrder(db, id, changes)) },
  shipCentralOrder(id: string, details?: Partial<ShipDetails>) { update((db) => shipCentralOrder(db, id, details)) },

  /** HQ: freie Direktlieferung buchen (wird wie eine versendete Bestellung geführt, also auch berechenbar) */
  bookDelivery(storeId: string, articleId: string, packs: number, date: string) {
    update((db) => {
      if (packs <= 0 || !db.articles.some((x) => x.id === articleId)) return db
      const r = placeCentralOrder(db, storeId, [{ articleId, packs }], date, 'Direktlieferung')
      if (!r) return db
      return shipCentralOrder(confirmCentralOrder(r.db, r.id), r.id, undefined, date)
    })
  },
  confirmDelivery(id: string) {
    update((db) => {
      const nd = { ...db, deliveries: db.deliveries.map((d) => (d.id === id ? { ...d, confirmed: true } : d)) }
      return settleDelivered(nd, db.deliveries.find((d) => d.id === id)?.coId)
    })
  },
  reportDeviation(id: string, text: string) {
    update((db) => {
      const nd = { ...db, deliveries: db.deliveries.map((d) => (d.id === id ? { ...d, confirmed: true, deviation: text } : d)) }
      return settleDelivered(nd, db.deliveries.find((d) => d.id === id)?.coId)
    })
  },

  /* ----- Rechnungen ----- */
  createInvoice(coIds: string[]): string | null {
    const r = createInvoice(state, coIds)
    if (!r) return null
    commit(r.db)
    return r.id
  },
  markPaid(id: string, date = todayISO()) {
    update((db) => ({ ...db, invoices: db.invoices.map((i) => (i.id === id && i.type === 'rechnung' && !i.cancelledBy && !i.paidOn ? { ...i, paidOn: date } : i)) }))
  },
  cancelInvoice(id: string, reason: string): string | null {
    const r = cancelInvoice(state, id, reason)
    if (!r) return null
    commit(r.db)
    return r.id
  },
  setInvoiceNumbering(prefix: string, next: number, pad: number) {
    update((db) => {
      const min = db.invoices.length ? Math.max(...db.invoices.map((i) => Number(i.number.replace(/\D+/g, ' ').trim().split(' ').pop()) || 0)) + 1 : 1
      if (next < min) return db // lückenlos: nie unter die höchste vergebene Nummer
      return { ...db, settings: { ...db.settings, invoiceNo: { prefix, next, pad } } }
    })
  },
  updateCompany(patch: Partial<Company>) { update((db) => ({ ...db, settings: { ...db.settings, company: { ...db.settings.company, ...patch } } })) },
  updateStore(id: string, patch: Partial<Store>) { update((db) => ({ ...db, stores: db.stores.map((s) => (s.id === id ? { ...s, ...patch } : s)) })) },

  /** Sonstiger Abgang (nicht über die Kasse). `qty` in Stück bzw. kg oder in Kartons (= Packungen). */
  addOutflow(storeId: string, articleId: string, qty: number, unit: 'einheit' | 'karton', reason: OutflowReason, note: string) {
    update((db) => {
      const a = db.articles.find((x) => x.id === articleId)
      if (!a || qty <= 0) return db
      const base = unit === 'karton' ? qty * packBase(a) : toBase(a, qty)
      const nf = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 })
      const label = unit === 'karton' ? `${nf.format(qty)} Karton${qty === 1 ? '' : 's'}` : `${nf.format(qty)} ${a.unit}`
      const o: Outflow = { id: uid('of'), storeId, articleId, date: todayISO(), qty: base, label, reason, note: note.trim() }
      return { ...db, outflows: [...db.outflows, o] }
    })
  },
  removeOutflow(id: string) {
    update((db) => ({ ...db, outflows: db.outflows.filter((o) => o.id !== id) }))
  },

  /** Monatsinventur (blind gezählt): counted je Artikel in Basiseinheit; Differenz korrigiert den Bestand. Offene Sonder-Inventuren des HQ gelten damit als erledigt. */
  saveInventory(storeId: string, counted: Record<string, number>) {
    update((db) => {
      const lines: InventoryLine[] = Object.entries(counted).map(([articleId, c]) => ({
        articleId, counted: c, expected: Math.round(stockNow(db, storeId, articleId)),
      }))
      if (!lines.length) return db
      const today = todayISO()
      const st = inventoryState(db, storeId, today)
      const monthly = st.status === 'offen' || st.status === 'überfällig'
      const inv = monthly ? { kind: 'monat' as const, period: st.period } : { kind: 'sonder' as const }
      return {
        ...db,
        inventories: [...db.inventories, { id: uid('iv'), storeId, date: today, lines, ...inv }],
        requests: db.requests.map((r) => (r.storeId === storeId && !r.doneOn ? { ...r, doneOn: today } : r)),
      }
    })
  },

  /* ----- HQ: Kontrolle ----- */
  /** Sonder-Inventur oder Erinnerung an einen Laden (erscheint dort als Alarm) */
  requestFromStore(storeId: string, kind: 'sonder-inventur' | 'erinnerung', note = '') {
    update((db) => {
      if (db.requests.some((r) => r.storeId === storeId && r.kind === kind && !r.doneOn)) return db
      return { ...db, requests: [...db.requests, { id: uid('rq'), storeId, kind, createdOn: todayISO(), note: note.trim() || undefined }] }
    })
  },
  /** Fall bearbeiten: Notiz hinzufügen und/oder Status setzen (geklärt nur mit Begründung) */
  updateCase(storeId: string, kind: string, patch: { note?: string; status?: CaseStatus; resolution?: string }) {
    update((db) => {
      const id = `${storeId}|${kind}`
      const cur: CaseRec = db.cases.find((c) => c.id === id) ?? { id, storeId, kind, status: 'offen', notes: [] }
      const today = todayISO()
      const next: CaseRec = {
        ...cur,
        notes: patch.note?.trim() ? [...cur.notes, { date: today, text: patch.note.trim() }] : cur.notes,
        status: patch.status ?? cur.status,
        resolution: patch.status === 'geklärt' ? patch.resolution?.trim() : patch.status ? undefined : cur.resolution,
        resolvedOn: patch.status === 'geklärt' ? today : patch.status ? undefined : cur.resolvedOn,
      }
      if (next.status === 'geklärt' && !next.resolution) return db
      return { ...db, cases: db.cases.some((c) => c.id === id) ? db.cases.map((c) => (c.id === id ? next : c)) : [...db.cases, next] }
    })
  },

  updateArticle(id: string, patch: Partial<Article>) {
    update((db) => ({ ...db, articles: db.articles.map((a) => (a.id === id ? { ...a, ...patch } : a)) }))
  },
  addArticle(a: Article) {
    update((db) => ({ ...db, articles: [...db.articles, a], settings: { ...db.settings, shrink: { ...db.settings.shrink, [a.id]: db.settings.shrink[a.id] ?? 3 } } }))
  },
  removeArticle(id: string) {
    update((db) => ({ ...db, articles: db.articles.filter((a) => a.id !== id) }))
  },
  updateRecipe(id: string, patch: Partial<Recipe>) {
    update((db) => ({ ...db, recipes: db.recipes.map((r) => (r.id === id ? { ...r, ...patch } : r)) }))
  },
  updateSettings(patch: Partial<Settings>) {
    update((db) => ({ ...db, settings: { ...db.settings, ...patch } }))
  },
  setShrink(articleId: string, pct: number) {
    update((db) => ({ ...db, settings: { ...db.settings, shrink: { ...db.settings.shrink, [articleId]: pct } } }))
  },
  setLocation(storeId: string, lat: number, lon: number) {
    update((db) => ({ ...db, settings: { ...db.settings, locations: { ...db.settings.locations, [storeId]: { lat, lon } } } }))
  },
  saveSpecialDay(h: Holiday) {
    update((db) => {
      const has = db.settings.specialDays.some((x) => x.id === h.id)
      const list = has ? db.settings.specialDays.map((x) => (x.id === h.id ? h : x)) : [...db.settings.specialDays, h]
      return { ...db, settings: { ...db.settings, specialDays: list.sort((a, b) => a.date.localeCompare(b.date)) } }
    })
  },
  removeSpecialDay(id: string) {
    update((db) => ({ ...db, settings: { ...db.settings, specialDays: db.settings.specialDays.filter((h) => h.id !== id) } }))
  },
  saveSchoolHoliday(h: SchoolHoliday) {
    update((db) => {
      const has = db.settings.schoolHolidays.some((x) => x.id === h.id)
      const list = has ? db.settings.schoolHolidays.map((x) => (x.id === h.id ? h : x)) : [...db.settings.schoolHolidays, h]
      return { ...db, settings: { ...db.settings, schoolHolidays: list } }
    })
  },
  removeSchoolHoliday(id: string) {
    update((db) => ({ ...db, settings: { ...db.settings, schoolHolidays: db.settings.schoolHolidays.filter((h) => h.id !== id) } }))
  },

  /* ----- Personal ----- */
  updateHr(patch: Partial<HrSettings>) { update((db) => ({ ...db, settings: { ...db.settings, hr: { ...db.settings.hr, ...patch } } })) },
  saveEmployee(e: Employee) {
    update((db) => ({ ...db, employees: db.employees.some((x) => x.id === e.id) ? db.employees.map((x) => (x.id === e.id ? e : x)) : [...db.employees, e] }))
  },
  setAvailability(empId: string, date: string, a: Omit<Availability, 'empId' | 'date'> | null) {
    update((db) => {
      const rest = db.availability.filter((x) => !(x.empId === empId && x.date === date))
      return { ...db, availability: a ? [...rest, { empId, date, ...a }] : rest }
    })
  },
  importAvailability(list: Availability[]) {
    update((db) => {
      const keys = new Set(list.map((a) => `${a.empId}|${a.date}`))
      return { ...db, availability: [...db.availability.filter((a) => !keys.has(`${a.empId}|${a.date}`)), ...list] }
    })
  },
  addAbsence(a: Omit<Absence, 'id'>) { update((db) => ({ ...db, absences: [...db.absences, { ...a, id: uid('ab') }] })) },
  removeAbsence(id: string) { update((db) => ({ ...db, absences: db.absences.filter((a) => a.id !== id) })) },
  generateSchedule(storeId: string, from: string, days = 14) { update((db) => generateSchedule(db, storeId, from, days, () => uid('sh'))) },
  saveShift(s: Shift) { update((db) => ({ ...db, shifts: db.shifts.some((x) => x.id === s.id) ? db.shifts.map((x) => (x.id === s.id ? s : x)) : [...db.shifts, s] })) },
  saveShifts(list: Shift[]) { update((db) => ({ ...db, shifts: [...db.shifts.filter((x) => !list.some((s) => s.id === x.id)), ...list] })) },
  reportSick(p: { storeId: string; empId: string; from: string; to: string; eau: 'folgt' | 'eingegangen' | 'nicht-noetig'; note: string; via: 'mitarbeiter' | 'leitung'; at?: string }) { const id = uid('ko'); update((db) => reportSick(db, { ...p, id })); return id },
  requestCover(calloutId: string, shiftId: string, empId: string, start?: number, end?: number) { update((db) => requestCover(db, calloutId, shiftId, empId, uid('rq'), start, end)) },
  answerCover(calloutId: string, reqId: string, answer: 'zugesagt' | 'abgesagt') { update((db) => answerCover(db, calloutId, reqId, answer, uid('sh'))) },
  leaveOpen(calloutId: string, shiftId: string) { update((db) => leaveOpen(db, calloutId, shiftId)) },
  setEau(calloutId: string, eau: 'folgt' | 'eingegangen' | 'nicht-noetig') { update((db) => setEau(db, calloutId, eau)) },
  removeShift(id: string) { update((db) => ({ ...db, shifts: db.shifts.filter((s) => s.id !== id) })) },

  /* ----- HQ: Franchise-Gebühren, Kommunikation ----- */
  createFreeInvoice(storeId: string, lines: { text: string; qty: number; unitNet: number; vatRate: number }[]): string | null {
    const store = state.stores.find((x) => x.id === storeId)
    if (!store || !lines.length) return null
    const date = todayISO()
    const id = uid('inv')
    const cfg = state.settings.invoiceNo
    const il = lines.map((l, i) => ({ pos: i + 1, sku: 'FREI', name: l.text, qty: l.qty, unit: 'Stk.', unitNet: l.unitNet, vatRate: l.vatRate, net: round2(l.qty * l.unitNet), serviceDate: date }))
    const co = state.settings.company
    const t = totalsOf(il)
    const inv: Invoice = {
      id, number: formatInvoiceNumber(cfg, date), type: 'rechnung', kind: 'gebuehr', date, serviceFrom: date, serviceTo: date, dueDate: addDays(date, state.settings.paymentDays), paymentDays: state.settings.paymentDays, storeId, coIds: [],
      seller: { name: co.name, street: co.street, zipCity: co.zipCity, vatId: co.vatId, taxNumber: co.taxNumber, country: 'DE', iban: co.iban, bic: co.bic, bankName: co.bankName },
      buyer: { name: store.franchise.name, street: store.franchise.street, zipCity: store.franchise.zipCity, vatId: store.franchise.vatId, country: 'DE' },
      lines: il, ...t, currency: 'EUR',
    }
    update((db) => ({ ...db, invoices: [...db.invoices, inv], settings: { ...db.settings, invoiceNo: { ...cfg, next: cfg.next + 1 } } }))
    return id
  },
  createFeeInvoice(storeId: string, ym: string): string | null {
    const r = createFeeInvoice(state, storeId, ym)
    if (!r) return null
    commit(r.db)
    return r.id
  },
  /** Laden meldet die Monatszahlen (ersetzt eine frühere Meldung für denselben Monat) */
  reportMonth(storeId: string, ym: string, v: { staffCost: number; rent: number; revenue: number; goodsCost: number; otherCost: number; datev?: boolean }) {
    update((db) => {
      const rep = { id: `mr-${storeId}-${ym}`, storeId, ym, reportedOn: todayISO(), ...v }
      return { ...db, monthlyReports: db.monthlyReports.some((r) => r.id === rep.id) ? db.monthlyReports.map((r) => (r.id === rep.id ? rep : r)) : [...db.monthlyReports, rep] }
    })
  },
  /** Laden sendet eine Meldung an das HQ */
  sendReport(storeId: string, art: 'anfrage' | 'stoerung' | 'reklamation', text: string) {
    update((db) => ({ ...db, reports: [...db.reports, { id: uid('rp'), storeId, art, text: text.trim(), createdOn: todayISO() }] }))
  },
  /** Richtwerte der Kostenquoten (HQ) */
  setCostTargets(t: CostTargets) { update((db) => ({ ...db, settings: { ...db.settings, costTargets: t } })) },
  setFees(license: number, marketing: number) { update((db) => ({ ...db, settings: { ...db.settings, fees: { license, marketing } } })) },
  addPost(p: { title: string; text: string; important: boolean; to: string[] }) {
    update((db) => ({ ...db, posts: [{ id: uid('po'), createdOn: todayISO(), readBy: {}, ...p }, ...db.posts] }))
  },
  removePost(id: string) { update((db) => ({ ...db, posts: db.posts.filter((p) => p.id !== id) })) },
  /** Laden bestätigt „Gelesen“ */
  readPost(id: string, storeId: string) {
    update((db) => ({ ...db, posts: db.posts.map((p) => (p.id === id && !p.readBy[storeId] ? { ...p, readBy: { ...p.readBy, [storeId]: todayISO() } } : p)) }))
  },
  saveCampaign(c: Omit<Campaign, 'id'> & { id?: string }) {
    update((db) => {
      const camp: Campaign = { ...c, id: c.id ?? uid('ca') }
      return { ...db, campaigns: db.campaigns.some((x) => x.id === camp.id) ? db.campaigns.map((x) => (x.id === camp.id ? camp : x)) : [...db.campaigns, camp] }
    })
  },
  removeCampaign(id: string) { update((db) => ({ ...db, campaigns: db.campaigns.filter((c) => c.id !== id) })) },
  saveKnow(k: Omit<KnowEntry, 'id'> & { id?: string }) {
    update((db) => {
      const e: KnowEntry = { ...k, id: k.id ?? uid('kn') }
      return { ...db, knowledge: db.knowledge.some((x) => x.id === e.id) ? db.knowledge.map((x) => (x.id === e.id ? e : x)) : [...db.knowledge, e] }
    })
  },
  removeKnow(id: string) { update((db) => ({ ...db, knowledge: db.knowledge.filter((k) => k.id !== id) })) },

  /* ---------- Demo-Tour ---------- */
  /** Schnappschuss für die Tour (Daten sind unveränderlich, die Referenz genügt); Mango wird knapp gestellt */
  tourBegin(): Db {
    const snap = state
    commit(tuneMango(state, TOUR_STORE))
    return snap
  },
  tourRestore(snap: Db) {
    commit(snap)
  },
}
export { toBase }
