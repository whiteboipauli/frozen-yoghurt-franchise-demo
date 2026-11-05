import type { Article, Db, Recipe, SaleDay } from '../data/types'

/** Menge in Artikel-Einheit → Basiseinheit (kg → g) */
export const toBase = (a: Pick<Article, 'unit'>, q: number) => (a.unit === 'kg' ? q * 1000 : q)
export const fromBase = (a: Pick<Article, 'unit'>, b: number) => (a.unit === 'kg' ? b / 1000 : b)
export const packBase = (a: Article) => toBase(a, a.packSize)
/** Basiseinheit pro Portion (Topping: Gramm je Löffel, Becher/Löffel: 1) */
export const portionBase = (a: Article) => (a.unit === 'kg' ? a.portionGrams ?? 100 : 1)

export interface Lookup {
  articles: Map<string, Article>
  recipes: Map<string, Recipe>
}
export const lookup = (db: Pick<Db, 'articles' | 'recipes'>): Lookup => ({
  articles: new Map(db.articles.map((a) => [a.id, a])),
  recipes: new Map(db.recipes.map((r) => [r.id, r])),
})

/** Kassenverbrauch eines Tages je Artikel (Basiseinheit), abgeleitet aus den Rezepturen */
export function consumptionOfDay(day: Pick<SaleDay, 'counts' | 'toppings'>, lk: Lookup): Record<string, number> {
  const out: Record<string, number> = {}
  const add = (id: string, q: number) => {
    out[id] = (out[id] ?? 0) + q
  }
  for (const [rid, count] of Object.entries(day.counts)) {
    const r = lk.recipes.get(rid)
    if (!r || !count) continue
    add(r.cupId, count)
    add(r.spoonId, count)
    add(r.powderId, count * r.powderGrams)
    for (const [eid, per] of Object.entries(r.extras ?? {})) add(eid, count * per)
    for (const t of r.fixedToppings) {
      const a = lk.articles.get(t)
      if (a) add(t, count * portionBase(a))
    }
  }
  for (const [tid, portions] of Object.entries(day.toppings)) {
    const a = lk.articles.get(tid)
    if (a && portions) add(tid, portions * portionBase(a))
  }
  return out
}

export const cupsSold = (day: Pick<SaleDay, 'counts'>) => Object.values(day.counts).reduce((s, n) => s + n, 0)
