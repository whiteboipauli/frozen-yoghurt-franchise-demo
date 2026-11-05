import { SignalChip, type Level } from './signal'
import type { CentralOrder, Db, Invoice, InvoiceState } from '../data/types'
import { CO_FLOW } from '../data/types'
import { packsOf, round2 } from '../logic/invoice'
import { Pill } from './kit'

/** Status-Kette einer Bestellung: eingegangen → bestätigt → versendet → geliefert → berechnet */
export function CoSteps({ status }: { status: CentralOrder['status'] }) {
  const idx = CO_FLOW.indexOf(status)
  return (
    <div className="steps" aria-label={`Status: ${status}`}>
      {CO_FLOW.map((s, i) => (
        <span key={s} className={`step ${i < idx ? 'done' : i === idx ? 'now' : ''}`}>{s}</span>
      ))}
    </div>
  )
}

const TONE: Record<InvoiceState, '' | 'green' | 'yellow' | 'red' | 'blue'> = { offen: 'yellow', bezahlt: 'green', überfällig: 'red', storniert: '', Gutschrift: 'blue' }
export const InvoicePill = ({ state }: { state: InvoiceState }) => {
  const m: Record<InvoiceState, { l: Level; t: string; v?: 'uhr' }> = { offen: { l: 'bernstein', t: 'Offen', v: 'uhr' }, bezahlt: { l: 'gruen', t: 'Bezahlt' }, überfällig: { l: 'rot', t: 'Überfällig' }, storniert: { l: 'info', t: 'Storniert' }, Gutschrift: { l: 'info', t: 'Storno' } }
  const x = m[state]
  return <SignalChip level={x.l} variant={x.v}>{x.t}</SignalChip>
}
void TONE

/** Nettowert einer Bestellung (bestätigte Mengen) */
export const coNet = (db: Pick<Db, 'articles'>, co: CentralOrder) =>
  round2(co.lines.reduce((s, l) => s + packsOf(l) * (db.articles.find((a) => a.id === l.articleId)?.packPrice ?? 0), 0))
export const storeName = (db: Pick<Db, 'stores'>, id: string) => db.stores.find((s) => s.id === id)?.name ?? id
export const invoiceOfCo = (db: Pick<Db, 'invoices'>, co: CentralOrder): Invoice | undefined => db.invoices.find((i) => i.id === co.invoiceId)
