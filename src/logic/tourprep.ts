import type { Db, SaleDay } from '../data/types'
import { addDays, todayISO } from '../lib/date'
import { portionBase } from './consumption'
import { expectedUse } from './forecast'
import { shrinkRate, stockNow, usedOn } from './stock'

/** Heutigen Verbrauch auf die Tagesprognose anheben (dann mindert ein weiterer Verkauf die Prognose nicht) und offene Bestellungen entfernen. */
function neutralize(db: Db, storeId: string, articleId: string): Db {
  const a = db.articles.find((x) => x.id === articleId)!
  const today = todayISO()
  const orders = db.orders
    .map((o) => (o.storeId === storeId && o.status === 'bestellt' && o.lines.some((l) => l.articleId === articleId) ? { ...o, lines: o.lines.filter((l) => l.articleId !== articleId) } : o))
    .filter((o) => o.lines.length > 0)
  const centralOrders = db.centralOrders
    .map((o) => (o.storeId === storeId && (o.status === 'eingegangen' || o.status === 'bestätigt') && o.lines.some((l) => l.articleId === articleId) ? { ...o, lines: o.lines.filter((l) => l.articleId !== articleId) } : o))
    .filter((o) => o.lines.length > 0)
  let cur: Db = { ...db, orders, centralOrders }
  const gap = expectedUse(cur, storeId, articleId, today, today) - usedOn(cur, storeId, articleId, today)
  if (gap > 0) {
    const idx = cur.saleDays.findIndex((d) => d.storeId === storeId && d.date === today)
    const day: SaleDay = idx >= 0 ? structuredClone(cur.saleDays[idx]) : { storeId, date: today, counts: {}, toppings: {} }
    const isTop = a.category === 'Topping'
    if (isTop) day.toppings[articleId] = (day.toppings[articleId] ?? 0) + Math.ceil((gap * (1 - shrinkRate(cur, articleId))) / portionBase(a)) + 1
    else return cur // Nicht-Toppings: Restverbrauch heute bleibt in der Prognose (kein Problem für die Liste)
    cur = { ...cur, saleDays: idx >= 0 ? cur.saleDays.map((d, i) => (i === idx ? day : d)) : [...cur.saleDays, day] }
  }
  return cur
}

function setStock(db: Db, storeId: string, articleId: string, target: number): Db {
  const shift = target - stockNow(db, storeId, articleId)
  return { ...db, openingStock: { ...db.openingStock, [storeId]: { ...db.openingStock[storeId], [articleId]: (db.openingStock[storeId]?.[articleId] ?? 0) + shift } } }
}

/** Bestand so einstellen, dass der Artikel in genau k Tagen leer ist (Mitte des Tages k) */
function tuneDays(db: Db, storeId: string, articleId: string, k: number): Db {
  const today = todayISO()
  const cur = neutralize(db, storeId, articleId)
  let c = Math.max(0, expectedUse(cur, storeId, articleId, today, today) - usedOn(cur, storeId, articleId, today))
  for (let i = 1; i < k; i++) c += expectedUse(cur, storeId, articleId, addDays(today, i), today)
  return setStock(cur, storeId, articleId, c + 0.5 * expectedUse(cur, storeId, articleId, addDays(today, k), today))
}

/**
 * Demo-Vorbereitung für Düsseldorf Carlstadt:
 * – Mango knapp, knapp über der Gelb-Schwelle: der Tour-Verkauf (Becher M + 2× Mango) löst den Alarm aus.
 * – Löffel und Becher M stehen auf der Bestellliste (Artikel des Headquarters), ohne selbst Alarm auszulösen.
 */
export function tuneMango(db: Db, storeId = 'duesseldorf-carlstadt'): Db {
  if (!db.stores.some((s) => s.id === storeId) || !db.articles.some((a) => a.id === 'mango')) return db
  const a = db.articles.find((x) => x.id === 'mango')!
  const today = todayISO()
  const rate = shrinkRate(db, 'mango')
  let cur = neutralize(db, storeId, 'mango')
  let c3 = 0
  for (let i = 1; i <= 3; i++) c3 += expectedUse(cur, storeId, 'mango', addDays(today, i), today)
  const drop = (2 * portionBase(a)) / (1 - rate)
  cur = setStock(cur, storeId, 'mango', c3 + drop * 0.55)
  // Artikel des Headquarters: spätester Bestelltag in 2–3 Tagen
  for (const [id, k] of [['loeffel', 2], ['karamellsauce', 3], ['becher-m', 8]] as const) if (cur.articles.some((x) => x.id === id)) cur = tuneDays(cur, storeId, id, k)
  return cur
}
