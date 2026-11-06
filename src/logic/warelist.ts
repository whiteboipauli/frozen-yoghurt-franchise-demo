import type { Db } from '../data/types'
import { forecastAll, LIGHT_RANK, reachTone, type ArticleForecast } from './forecast'
import { groupOf, type StockGroup } from './orderplan'
import { orderList } from './orderlist'

/** EINE Liste aller Artikel – das Dringendste oben: rot, dann gelb, dann grün (innerhalb davon: kürzeste Reichweite zuerst) */
export function articleRows(db: Db, storeId: string, group: StockGroup = 'alle'): ArticleForecast[] {
  return forecastAll(db, storeId).filter((f) => group === 'alle' || groupOf(f.article) === group)
    .sort((a, b) => LIGHT_RANK[reachTone(a)] - LIGHT_RANK[reachTone(b)] || (a.reach ?? 1e9) - (b.reach ?? 1e9) || a.article.name.localeCompare(b.article.name, 'de'))
}

export interface OrderAll {
  /** Vom Headquarter bezogen: kommt in den Warenkorb */
  zentrale: { articleId: string; packs: number }[]
  /** Toppings: je Lieferant als bestellt markieren (mit druckbarer Liste) */
  suppliers: { supplier: string; lines: { articleId: string; name: string; packs: number }[] }[]
}
/** „Alle Vorschläge bestellen“ */
export function orderAllPlan(db: Db, storeId: string): OrderAll {
  const items = orderList(db, storeId).filter((i) => i.status === 'offen')
  const bySup = new Map<string, OrderAll['suppliers'][number]>()
  for (const i of items.filter((x) => x.supplier !== 'Headquarter')) {
    const e = bySup.get(i.supplier) ?? { supplier: i.supplier, lines: [] }
    e.lines.push({ articleId: i.article.id, name: i.article.name, packs: i.packs })
    bySup.set(i.supplier, e)
  }
  return { zentrale: items.filter((i) => i.supplier === 'Headquarter').map((i) => ({ articleId: i.article.id, packs: i.packs })), suppliers: [...bySup.values()] }
}
