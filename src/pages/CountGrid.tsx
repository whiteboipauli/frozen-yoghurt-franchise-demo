import { useEffect, useRef, useState } from 'react'
import { useDb } from '../data/repository'
import type { Inventory } from '../data/types'
import { todayISO } from '../lib/date'
import { fmtDate, fmtQty } from '../lib/format'
import { INV_GREEN, INV_YELLOW, MONTHS, countedLate, inventoriesOf, isYearEnd, monthLabel, stichtagOf, zentraleArticles } from '../logic/inventory'
import { Signal, type Level } from '../ui/signal'
import { ArtIcon } from '../ui/art'
import { Btn, Card, Empty, Modal } from '../ui/kit'

/** Wer hat gezählt (Demo: deterministisch aus dem Team des Ladens) */
export function countedBy(db: ReturnType<typeof useDb>, inv: Inventory) {
  const team = db.employees.filter((e) => e.storeId === inv.storeId && e.active)
  if (!team.length) return 'Team'
  let h = 0
  for (const ch of inv.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return team[h % team.length].name
}

const kindOf = (i: Inventory) => (i.kind === 'sonder' ? 'zwischen' : isYearEnd(stichtagOf(i)) ? 'jahr' : 'monat')
const KIND_LABEL = { monat: 'Monatsinventur', zwischen: 'Zwischenzählung', jahr: 'Jahresinventur' }
const KIND_SHORT = { monat: 'Monat', zwischen: 'Zwischen', jahr: 'Jahr' }
const levelOf = (counted: number, expected: number): Level => { const p = Math.abs(((counted - expected) / Math.max(1, Math.abs(expected))) * 100); return p <= INV_GREEN ? 'gruen' : p <= INV_YELLOW ? 'bernstein' : 'rot' }
const WORD = { gruen: 'passt', bernstein: 'kleine Abweichung', rot: 'große Abweichung', info: '' } as const

/** Abweichungen nach Monat: Artikel × Zählungen als kleine Signal-Symbole (im Laden ohne Sollwerte); Klick öffnet die Zählung */
export function CountGridCard({ storeId }: { storeId: string }) {
  const db = useDb()
  const today = todayISO()
  const year = +today.slice(0, 4)
  const [open, setOpen] = useState<Inventory | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const arts = zentraleArticles(db)
  const cols = inventoriesOf(db, storeId).filter((i) => (i.kind === 'sonder' ? i.date >= `${year}-01-01` : stichtagOf(i) >= `${year - 1}-12-31`))
    .sort((a, b) => (stichtagOf(a) + a.date).localeCompare(stichtagOf(b) + b.date))
  useEffect(() => { const el = scrollRef.current; if (el) el.scrollLeft = el.scrollWidth }, [cols.length])
  const bad = (i: Inventory) => i.lines.some((l) => levelOf(l.counted, l.expected) !== 'gruen')
  const monthly = cols.filter((i) => i.kind !== 'sonder')
  const dev = monthly.filter(bad).length
  const inter = cols.length - monthly.length
  return (
    <Card title="Abweichungen nach Monat" tour="inv-hist" right={<span className="small muted">So genau haben die Zählungen zum Soll gepasst.</span>}>
      {cols.length === 0 ? <Empty icon="orders">Noch keine Inventur durchgeführt.</Empty> : (
        <>
          <div className="cgscroll" ref={scrollRef}>
          <div className="cgrid" style={{ gridTemplateColumns: `150px repeat(${cols.length}, minmax(56px, 1fr))`, minWidth: 150 + cols.length * 60 }} role="table">
            <div className="cg-corner" />
            {cols.map((i) => {
              const k = kindOf(i)
              return (
                <button key={i.id} className={`cg-head ${k}`} onClick={() => setOpen(i)} title={`${KIND_LABEL[k]} · ${fmtDate(stichtagOf(i))}`}>
                  <b>{k === 'zwischen' ? fmtDate(i.date).slice(0, 5) : MONTHS[+stichtagOf(i).slice(5, 7) - 1].slice(0, 3)}</b>
                  <span className="cg-mark">{KIND_SHORT[k]}</span>
                </button>
              )
            })}
            {arts.map((a) => (
              <div className="cg-row" key={a.id}>
                <div className="cg-art"><span className="count-ico"><ArtIcon article={a} size={20} /></span>{a.name.replace('Frozen-Yoghurt-', '')}</div>
                {cols.map((i) => {
                  const l = i.lines.find((x) => x.articleId === a.id)
                  return (
                    <button key={i.id} className="cg-cell" onClick={() => setOpen(i)} aria-label={`${a.name}, ${fmtDate(stichtagOf(i))}: ${l ? WORD[levelOf(l.counted, l.expected)] : 'nicht gezählt'}`}>
                      {l ? <Signal level={levelOf(l.counted, l.expected)} size={20} /> : <span className="muted">–</span>}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
          </div>
          <div className="cg-foot">
            <span><b>{monthly.length}</b> {monthly.length === 1 ? 'Monat' : 'Monate'} gezählt · <b>{dev}</b> mit Abweichung{inter ? ` · ${inter} Zwischenzählung${inter > 1 ? 'en' : ''}` : ''}</span>
            <span className="cg-key"><Signal level="gruen" size={16} /> passt (bis {INV_GREEN} %) <Signal level="bernstein" size={16} /> bis {INV_YELLOW} % <Signal level="rot" size={16} /> darüber</span>
          </div>
        </>
      )}
      {open && (
        <Modal onClose={() => setOpen(null)}>
          <h2>{KIND_LABEL[kindOf(open)]} {kindOf(open) === 'zwischen' ? fmtDate(open.date) : monthLabel(open.period ?? stichtagOf(open).slice(0, 7))}</h2>
          <p className="muted" style={{ margin: '4px 0 14px' }}>
            {kindOf(open) === 'zwischen' ? `Gezählt am ${fmtDate(open.date)}` : `Stichtag ${fmtDate(stichtagOf(open))}${countedLate(open) ? `, gezählt am ${fmtDate(open.date)}` : ''}`} · von {countedBy(db, open)}
          </p>
          <div className="cg-dlg">
            {arts.map((a) => {
              const l = open.lines.find((x) => x.articleId === a.id)
              return <div key={a.id}><span className="count-ico"><ArtIcon article={a} size={20} /></span><span>{a.name}</span><b>{l ? fmtQty(a, l.counted) : '–'}</b>{l && <Signal level={levelOf(l.counted, l.expected)} size={18} />}</div>
            })}
          </div>
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}><Btn kind="glass" onClick={() => setOpen(null)}>Schließen</Btn></div>
        </Modal>
      )}
    </Card>
  )
}
