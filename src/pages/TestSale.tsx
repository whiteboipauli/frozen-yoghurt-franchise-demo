import { useState } from 'react'
import { actions, useDb } from '../data/repository'
import { useSaleDraft, saleDraft } from '../lib/sale-draft'
import { fmt0, fmtQty } from '../lib/format'
import { consumptionOfDay, lookup } from '../logic/consumption'
import { CupArt, GROUPS, metaOf, TopBadge } from '../ui/art'
import { Icon } from '../ui/icons'
import { Btn, Card, PageHead, useToast } from '../ui/kit'

export function TestSalePage({ storeId }: { storeId: string }) {
  const db = useDb()
  const toast = useToast()
  const draft = useSaleDraft()
  const [group, setGroup] = useState<(typeof GROUPS)[number]>('Alle')
  const [q, setQ] = useState('')
  const recipe = db.recipes.find((r) => r.id === draft.recipeId)!
  const isSize = true
  const sizes = db.recipes.filter((r) => r.kind === 'size')
  const tops = db.articles.filter((a) => a.category === 'Topping').filter((a) => (group === 'Alle' || metaOf(a.id).group === group) && a.name.toLowerCase().includes(q.trim().toLowerCase()))
  const chosen = Object.entries(draft.toppings)
  const lk = lookup(db)
  const ded = consumptionOfDay({ counts: { [recipe.id]: 1 }, toppings: isSize ? draft.toppings : {} }, lk)
  const topIds = isSize ? chosen.flatMap(([id, n]) => Array(n).fill(id)) : recipe.fixedToppings
  const sizeLetter = (recipe.cupId.endsWith('-s') ? 'S' : recipe.cupId.endsWith('-m') ? 'M' : 'L') as 'S' | 'M' | 'L'

  const book = () => {
    actions.recordSale(storeId, recipe.id, chosen.flatMap(([id, n]) => Array(n).fill(id)))
    saleDraft.reset()
    toast(`${recipe.name} gebucht – Bestand wurde reduziert`)
  }

  return (
    <>
      <PageHead title="Verkauf testen" hint="So kommt ein Verkauf aus der Kasse an: Größe S, M oder L wählen, Toppings antippen, buchen. Der Bestand sinkt sofort." />
      <div className="sale" data-tour="sale-area">
        <div className="stack">
          <Card title="1 · Größe wählen" i={0}>
            <div className="sizes">
              {sizes.map((r) => {
                const l = r.cupId.endsWith('-s') ? 'S' : r.cupId.endsWith('-m') ? 'M' : 'L'
                return (
                  <button key={r.id} className="size" aria-pressed={draft.recipeId === r.id} data-tour={`size-${l.toLowerCase()}`} onClick={() => saleDraft.setRecipe(r.id, false)}>
                    <CupArt size={l} height={96} /><b>{l}</b><span>{r.powderGrams} g Yoghurt</span>
                  </button>
                )
              })}
            </div>
          </Card>

          {isSize && (
            <Card title="2 · Toppings antippen" i={1} right={
              <div className="row">
                <label className="input" style={{ display: 'flex', alignItems: 'center', gap: 8, width: 210 }}><Icon name="search" size={16} /><input style={{ border: 0, background: 'none', outline: 0, font: 'inherit', width: '100%', color: 'inherit' }} placeholder="Suchen …" value={q} onChange={(e) => setQ(e.target.value)} /></label>
              </div>}>
              <div className="chips" style={{ marginBottom: 18 }}>{GROUPS.map((g) => <button key={g} className="chip" aria-pressed={group === g} onClick={() => setGroup(g)}>{g}</button>)}</div>
              <div className="topgrid">
                {tops.map((a) => {
                  const n = draft.toppings[a.id] ?? 0
                  return (
                    <div key={a.id} className="topk" role="button" tabIndex={0} data-tour={`top-${a.id}`} onClick={() => saleDraft.add(a.id)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && saleDraft.add(a.id)}>
                      {n > 0 && <span className="cnt" key={n}>{n}</span>}
                      {n > 0 && <button className="minus" aria-label={`${a.name} entfernen`} onClick={(e) => { e.stopPropagation(); saleDraft.sub(a.id) }}><Icon name="minus" size={16} /></button>}
                      <TopBadge id={a.id} size={64} />
                      <b>{a.name}</b>
                    </div>
                  )
                })}
                {tops.length === 0 && <p className="muted">Kein Topping gefunden.</p>}
              </div>
            </Card>
          )}
        </div>

        <Card className="cart" i={2}>
          <div className="cap">Dein Becher</div>
          <CupArt size={sizeLetter} tops={topIds} height={170} />
          <div style={{ fontSize: 22, fontWeight: 750, textAlign: 'center' }}>{recipe.name}</div>
          <div className="cart-lines">
            <div className="cap" style={{ marginBottom: 4 }}>Wird vom Bestand abgebucht</div>
            {Object.entries(ded).map(([id, q]) => {
              const a = db.articles.find((x) => x.id === id)!
              const portions = a.category === 'Topping' ? ` (${fmt0(q / (a.portionGrams ?? 1))}×)` : ''
              return <div key={id}><span>{a.name}{portions}</span><span>{fmtQty(a, q)}</span></div>
            })}
          </div>
          <Btn kind="cta" size="lg" icon="check" style={{ width: '100%' }} onClick={book} data-tour="book-btn">Buchen</Btn>
        </Card>
      </div>
    </>
  )
}
