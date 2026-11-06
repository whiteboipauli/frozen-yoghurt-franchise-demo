import { useMemo, useState } from 'react'
import { useDb } from '../data/repository'
import { TOUR_STORE } from '../data/stores'
import { cart } from '../lib/cart'
import { todayISO } from '../lib/date'
import { go } from '../lib/router'
import { manualList } from '../lib/manual-list'
import { fmt0, fmtDate, fmtQty } from '../lib/format'
import { portionBase } from '../logic/consumption'
import { forecastAll, LIGHT_RANK, reachPct, reachTone, type ArticleForecast } from '../logic/forecast'
import { lastCount, roughReach, roughShort } from '../logic/inventory'
import { GROUP_LABEL, groupOf, orderPlan, type StockGroup } from '../logic/orderplan'
import { ProductArt } from '../icons'
import { ArtIcon, TopBadge } from '../ui/art'
import { ArticleModal } from '../ui/ArticleModal'
import { Btn, Card, Info, LightPill, PageHead, Segmented, useToast } from '../ui/kit'
import { useTour } from '../ui/tour-state'

const COL = { green: 'var(--ok)', yellow: 'var(--warn)', red: 'var(--bad)' }

export function StockPage({ storeId }: { storeId: string }) {
  const db = useDb()
  const tour = useTour()
  const toast = useToast()
  const [group, setGroup] = useState<StockGroup>('alle')
  const [view, setView] = useState<'kacheln' | 'tabelle'>('kacheln')
  const [open, setOpen] = useState<string | null>(null)
  // Sortierung: wem es nicht gut geht, steht oben (rot, dann gelb), viel Reichweite unten
  const fc = useMemo(() => forecastAll(db, storeId).filter((f) => group === 'alle' || groupOf(f.article) === group)
    .sort((a, b) => LIGHT_RANK[reachTone(a)] - LIGHT_RANK[reachTone(b)] || (a.reach ?? 1e9) - (b.reach ?? 1e9) || a.article.name.localeCompare(b.article.name, 'de')), [db, storeId, group])
  const counted = (id: string) => {
    const c = lastCount(db, storeId, id)
    const a = db.articles.find((x) => x.id === id)!
    return c ? `${fmtQty(a, c.counted)} (${fmtDate(c.date)})` : 'noch nicht gezählt'
  }
  const portions = (f: ArticleForecast) => `${fmt0(Math.max(0, f.stock) / portionBase(f.article))} Portionen`
  const suggestion = (f: ArticleForecast) => (reachTone(f) !== 'green' && !f.ordered ? orderPlan(f, db.settings.targetDays).opt : null)
  const quick = (f: ArticleForecast, n: number) => {
    if (f.article.source === 'zentrale') { cart.bind(storeId); cart.set(f.article.id, n); toast(`${n} × ${f.article.name} im Warenkorb`, { action: { label: 'Zum Warenkorb', onClick: () => go('/filiale/bestellen') } }) }
    else { manualList.add(storeId, f.article.id, n); toast(`${f.article.name} steht auf der Bestellliste`, { action: { label: 'Zur Bestellliste', onClick: () => go('/filiale/bestellliste') } }) }
  }

  return (
    <>
      <PageHead title="Bestand" hint="Was ist noch da und wie lange reicht es? Wem es nicht gut geht, steht oben. Tippe einen Artikel an, um die Menge zu planen und zu bestellen." />
      <div className="toolbar no-print">
        <Segmented value={group} onChange={setGroup} w={152} tour="stock-groups" options={(Object.keys(GROUP_LABEL) as StockGroup[]).map((g) => ({ value: g, label: GROUP_LABEL[g] }))} />
        <Segmented value={view} onChange={setView} w={112} options={[{ value: 'kacheln', label: 'Kacheln', icon: 'grid' }, { value: 'tabelle', label: 'Tabelle', icon: 'list' }]} />
      </div>
      {view === 'kacheln' ? (
        <div className="stock-grid">
          {fc.map((f, i) => {
            const a = f.article
            const yo = a.source === 'zentrale'
            const tone = reachTone(f)
            const sug = suggestion(f)
            const isMango = a.id === 'mango' && storeId === TOUR_STORE
            const showChange = isMango && tour.active && tour.mangoBefore !== null && tour.mangoAfter !== null && tour.mangoBefore !== tour.mangoAfter
            return (
              <div key={a.id} className={`glass stock-tile card in ${tone}`} style={{ ['--i' as string]: Math.min(i, 12) * 0.4, ['--tc' as string]: COL[tone] }} data-tour={isMango ? 'mango-tile' : undefined}>
                <button className="st-main" onClick={() => setOpen(a.id)} aria-label={`${a.name} – Details und bestellen`}>
                  <span className="st-art">{yo ? <ProductArt article={a} size={64} /> : <TopBadge id={a.id} size={64} />}</span>
                  <span className="st-info">
                    <b>{a.name}</b>
                    <span className="st-reach" style={{ color: COL[tone] }}>{yo ? roughShort(f.daysLeft) : f.daysLeft === null ? '90+ Tage' : `${f.daysLeft} Tag${f.daysLeft === 1 ? '' : 'e'}`}</span>
                    <span className="small muted">{yo ? `gezählt: ${counted(a.id).split(' (')[0]}` : portions(f)}</span>
                  </span>
                </button>
                <div className="st-gauge" title={`Füllstand passend zur Reichweite`}><i style={{ width: `${reachPct(f)}%`, background: COL[tone] }} /></div>
                <div className="st-foot">
                  {f.ordered ? <span className="pill blue">bestellt</span> : sug ? <span className="st-sug">Vorschlag: {sug} {yo ? 'Karton' : 'Packung'}{sug === 1 ? '' : yo ? 's' : 'en'}</span> : <LightPill light={tone} />}
                  {sug ? <Btn size="sm" kind="cta" icon="cart" onClick={() => quick(f, sug)}>Bestellen</Btn> : null}
                </div>
                {showChange && <div className="pill accent" style={{ marginTop: 6 }}>{tour.mangoBefore} → {tour.mangoAfter} Portionen</div>}
              </div>
            )
          })}
        </div>
      ) : (
        <Card>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Artikel</th><th>Ampel</th><th>Reicht noch<Info text="Reichweite: so viele Tage reicht der Bestand, wenn alles wie prognostiziert verkauft wird. Bei Waren vom Headquarter ist sie grob – genau gezählt wird bei der Inventur." /></th><th className="r">Bestand / zuletzt gezählt</th><th className="r">Spätestens bestellen</th><th className="r">Lieferzeit</th><th /></tr></thead>
              <tbody>
                {fc.map((f) => {
                  const yo = f.article.source === 'zentrale'
                  const sug = suggestion(f)
                  return (
                    <tr key={f.article.id} className="clicky" onClick={() => setOpen(f.article.id)}>
                      <td className="strong"><span style={{ marginRight: 8 }}><ArtIcon article={f.article} /></span>{f.article.name}</td>
                      <td>{f.ordered ? <span className="pill blue">bestellt</span> : <LightPill light={reachTone(f)} />}</td>
                      <td>{yo ? roughReach(f.daysLeft) : f.daysLeft === null ? '90+ Tage' : f.daysLeft <= 0 ? 'heute leer' : `${f.daysLeft} Tage`}</td>
                      <td className="r">{yo ? counted(f.article.id) : portions(f)}</td>
                      <td className="r">{f.latestOrderDate ? (f.latestOrderDate <= todayISO() ? 'jetzt' : fmtDate(f.latestOrderDate)) : '–'}</td>
                      <td className="r">{f.article.leadTimeDays} Tage</td>
                      <td className="r" onClick={(e) => e.stopPropagation()}>{sug ? <Btn size="sm" kind="cta" onClick={() => quick(f, sug)}>{sug} bestellen</Btn> : null}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {open && <ArticleModal storeId={storeId} articleId={open} onClose={() => setOpen(null)} />}
    </>
  )
}
