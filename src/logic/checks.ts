import type { Db } from '../data/types'
import { addDays, range, todayISO } from '../lib/date'
import { hash01 } from '../data/seedHr'
import { DEMO_STORE, DEMO_STORE_2, DEMO_STORE_3, DEMO_STORES } from '../data/stores'
import { fmtPct } from '../lib/format'
import { CUP_IDS, POWDER_ID, expectedCups, type Light } from './forecast'
import { lastMonths, usageOfMonth } from './usage'
import { countDeadline, inventoryOfPeriod, monthlyOf, periodOf, prevMonth, INV_GREEN, INV_YELLOW, worstPct } from './inventory'
import { cupsSoldBetween, flow, flowOne, lightFor } from './shrinkage'
import { dayCups, saleDayOf } from './history'

export type CheckKind = 'pulver' | 'groessen' | 'zubehoer' | 'mehrverkauf' | 'prognose' | 'invdisz' | 'kasse'
export interface Check {
  kind: CheckKind
  title: string
  light: Light
  /** der gemessene Wert in einem Satz */
  value: string
  /** einfache Erklärung, was auffällt (oder dass alles passt) */
  text: string
  note?: string
}
export const CHECK_TITLES: Record<CheckKind, string> = {
  pulver: 'Pulver pro Becher', groessen: 'Bechergrößen', zubehoer: 'Zubehör pro Becher', mehrverkauf: 'Mehr verkauft als geliefert',
  prognose: 'Verkäufe unter Prognose', invdisz: 'Inventur-Disziplin', kasse: 'Kassen-Muster',
}

/** Demo-Auffälligkeiten der fiktiven Läden (in Prozent bzw. Faktor). Echte Läden zeigen nur Werte aus den Daten. */
const FX: Record<string, Partial<Record<'powder' | 'sizeL' | 'sizeS' | 'accessory' | 'soldOver' | 'forecast' | 'storno' | 'discount' | 'noBon', number>>> = {
  [DEMO_STORE]: { forecast: 0.66, storno: 8.6, discount: 7.4 },
  [DEMO_STORE_2]: { powder: 14, sizeL: 14, sizeS: -13 },
  [DEMO_STORE_3]: { accessory: 38, soldOver: 11, noBon: 7.5 },
}
/** Demo: stark unter Prognose liegende Läden (Faktor Ist/Prognose) */
export const demoForecastFactor = (storeId: string) => FX[storeId]?.forecast ?? 1
const worst = (...l: Light[]): Light => (l.includes('red') ? 'red' : l.includes('yellow') ? 'yellow' : 'green')
const nf1 = (n: number) => new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(n)

/** Simulierte Kassenwerte (kommen im echten System aus helloTESS!) */
export function kasseMuster(storeId: string) {
  const fx = FX[storeId] ?? {}
  return {
    storno: fx.storno ?? 1.1 + hash01(storeId + 'st') * 1.5,
    discount: fx.discount ?? 2 + hash01(storeId + 'di') * 2.5,
    noBon: fx.noBon ?? Math.round(hash01(storeId + 'nb') * 12) / 10,
  }
}

const cache = new WeakMap<Db, Map<string, Check[]>>()
export function storeChecks(db: Db, storeId: string, today = todayISO()): Check[] {
  let m = cache.get(db)
  if (!m) cache.set(db, (m = new Map()))
  const hit = m.get(`${storeId}|${today}`)
  if (hit) return hit
  const demo = DEMO_STORES.includes(storeId)
  const fx = FX[storeId] ?? {}
  const out: Check[] = []
  const cap = (l: Light): Light => (demo ? l : l === 'red' ? 'yellow' : l)
  const lamp = (pct: number | null) => cap(lightFor(db, pct === null ? null : Math.abs(pct)))
  const usageLamp = (pct: number) => cap(Math.abs(pct) <= INV_GREEN ? 'green' : Math.abs(pct) <= INV_YELLOW ? 'yellow' : 'red')
  const sayOk = (what: string) => `${what} – alles im üblichen Rahmen.`

  // 1 Pulver pro Becher
  {
    // Grundlage ist der Verbrauch aus der letzten Monatsinventur (Anfangsbestand + Wareneingang − Endbestand) gegen den erwarteten Verbrauch aus den Verkäufen
    const ym = lastMonths(3, today).reverse().find((m) => usageOfMonth(db, storeId, POWDER_ID, m))
    const u = ym ? usageOfMonth(db, storeId, POWDER_ID, ym) : null
    if (!u) out.push({ kind: 'pulver', title: CHECK_TITLES.pulver, light: 'green', value: 'noch keine Daten', text: 'Noch nicht genug Monatsinventuren für diese Prüfung.' })
    else {
      const cups = Math.max(1, cupsSoldBetween(db, storeId, u.from, u.to))
      const soll = (u.expected * 1000) / cups
      const pct = (u.pct ?? 0) + (fx.powder ?? 0)
      const ist = soll * (1 + pct / 100)
      const l = usageLamp(pct)
      out.push({ kind: 'pulver', title: CHECK_TITLES.pulver, light: l, value: `Ø ${nf1(ist)} g pro Becher · Soll ${nf1(soll)} g`, text: l === 'green' ? sayOk('Pro Becher wird so viel Pulver verbraucht, wie die Rezeptur vorsieht') : `Pro verkauftem Becher wird ${fmtPct(pct)} mehr Pulver verbraucht als vorgesehen. Mögliche Gründe: zu große Portionen oder Verkäufe ohne Kasse.` })
    }
  }
  // 2 Bechergrößen
  {
    const parts = CUP_IDS.map((id) => {
      const ym = lastMonths(3, today).reverse().find((m) => usageOfMonth(db, storeId, id, m))
      const u = ym ? usageOfMonth(db, storeId, id, ym) : null
      const p = u?.pct ?? 0
      return { id, p: p + (id === 'becher-l' ? fx.sizeL ?? 0 : id === 'becher-s' ? fx.sizeS ?? 0 : 0) }
    })
    const mx = parts.reduce((a, b) => (Math.abs(b.p) > Math.abs(a.p) ? b : a))
    const l = usageLamp(mx.p)
    const lab = (id: string) => id.slice(-1).toUpperCase()
    const l_ = parts.find((x) => x.id === 'becher-l')!, s_ = parts.find((x) => x.id === 'becher-s')!
    out.push({ kind: 'groessen', title: CHECK_TITLES.groessen, light: l, value: parts.map((x) => `${lab(x.id)} ${x.p > 0 ? '+' : ''}${nf1(x.p)} %`).join(' · '), text: l === 'green' ? sayOk('Verbrauchte und verkaufte Becher passen je Größe zusammen') : l_.p > 2 && s_.p < -2 ? 'Es werden mehr L-Becher verbraucht als verkauft, bei S dafür weniger. Das kann heißen: groß ausgegeben, klein bongeschrieben.' : `Bei Größe ${lab(mx.id)} weichen verbrauchte und verkaufte Becher um ${fmtPct(Math.abs(mx.p))} ab.` })
  }
  // 3 Zubehör
  {
    const ids = ['loeffel', 'deckel', 'servietten', 'tragetasche']
    const ps = ids.map((id) => {
      const f = flowOne(db, storeId, id, 6, today)
      return { id, p: (f ? (f.unexplained / Math.max(1, f.sold)) * 100 : 0) + (fx.accessory && (id === 'deckel' || id === 'tragetasche') ? fx.accessory : 0) }
    })
    const mx = ps.reduce((a, b) => (b.p > a.p ? b : a))
    // Zubehör wird in großen Kartons geliefert und schwankt stärker: großzügigere Grenzen
    const l = cap(mx.p > 15 ? 'red' : mx.p > 8 ? 'yellow' : 'green')
    const nm = (id: string) => db.articles.find((a) => a.id === id)?.name ?? id
    out.push({ kind: 'zubehoer', title: CHECK_TITLES.zubehoer, light: l, value: ps.map((x) => `${nm(x.id)} ${x.p > 0 ? '+' : ''}${nf1(x.p)} %`).join(' · '), text: l === 'green' ? sayOk('Löffel, Deckel, Servietten und Tragetaschen pro Becher liegen im Normalwert') : `${nm(mx.id)} wird ${fmtPct(mx.p)} mehr verbraucht als pro verkauftem Becher üblich. Mögliche Gründe: Weitergabe, Verschwendung oder Verkäufe ohne Kasse.` })
  }
  // 4 Mehr verkauft als geliefert
  {
    const f = flow(db, storeId, CUP_IDS)
    const pct = f ? ((f.sold - f.delivered) / f.delivered) * 100 + (fx.soldOver ?? 0) : 0
    const l = cap(lightFor(db, pct > 0 ? pct : 0))
    out.push({ kind: 'mehrverkauf', title: CHECK_TITLES.mehrverkauf, light: l, value: f ? `Kasse ${nf1(f.sold + (fx.soldOver ? (f.delivered * fx.soldOver) / 100 : 0))} Becher · geliefert ${nf1(f.delivered)}` : 'noch keine Daten', text: l === 'green' ? sayOk('Es wurden nicht mehr Becher verkauft, als das HQ geliefert hat') : `Die Kasse zeigt ${fmtPct(pct)} mehr Becher, als das HQ geliefert hat. Das kann auf Einkauf außerhalb der Bezugspflicht hinweisen.` })
  }
  // 5 Verkäufe unter Prognose
  {
    let act = 0, exp = 0
    for (const d of range(addDays(today, -14), addDays(today, -1))) {
      const sd = saleDayOf(db, storeId, d)
      if (!sd) continue
      act += dayCups(sd)
      exp += expectedCups(db, storeId, d, d)
    }
    const ratio = (exp > 0 ? act / exp : 1) * (fx.forecast ?? 1)
    const l: Light = cap(ratio < 0.72 ? 'red' : ratio < 0.82 ? 'yellow' : 'green')
    out.push({ kind: 'prognose', title: CHECK_TITLES.prognose, light: l, value: `${Math.round(ratio * 100)} % der erwarteten Becher (14 Tage)`, text: l === 'green' ? sayOk('Die Verkäufe entsprechen vergleichbaren Tagen (Wetter, Wochentag)') : `Es wurden ${Math.round((1 - ratio) * 100)} % weniger Becher gebucht als an vergleichbaren Tagen – bei normalem Wareneinkauf. Mögliche Ursache: Verkäufe ohne Kasse.` })
  }
  // 6 Inventur-Disziplin (Monatsinventur: fehlende Monate und größere Korrekturen, letzte 6 Monate)
  {
    const invs = monthlyOf(db, storeId)
    let missed = 0
    let ym = prevMonth(today.slice(0, 7))
    for (let k = 0; k < 6 && ym >= db.startDate.slice(0, 7); k++, ym = prevMonth(ym)) {
      const first = invs.length ? periodOf(invs[invs.length - 1]) : null
      if ((first === null || ym >= first) && !inventoryOfPeriod(db, storeId, ym) && today > countDeadline(ym)) missed++
    }
    const corr = invs.filter((i) => i.date >= addDays(today, -184) && worstPct(db, i) > INV_GREEN).length
    const l = cap(missed >= 2 || corr >= 2 ? 'red' : missed === 1 || corr === 1 ? 'yellow' : 'green')
    out.push({ kind: 'invdisz', title: CHECK_TITLES.invdisz, light: l, value: `${missed} ${missed === 1 ? 'Monat' : 'Monate'} ohne Inventur · ${corr} größere Korrektur${corr === 1 ? '' : 'en'} (6 Monate)`, text: l === 'green' ? sayOk('Die Monatsinventuren kommen pünktlich und mit kleinen Korrekturen') : 'Monatsinventuren fehlen oder mussten deutlich korrigiert werden. Das Zählen ist die Basis für alle anderen Prüfungen.' })
  }
  // 7 Kassen-Muster (Demo simuliert)
  {
    const k = kasseMuster(storeId)
    const l = cap(worst(k.storno > 7 ? 'red' : k.storno > 4 ? 'yellow' : 'green', k.discount > 10 ? 'red' : k.discount > 6 ? 'yellow' : 'green', k.noBon > 6 ? 'red' : k.noBon > 3 ? 'yellow' : 'green'))
    out.push({
      kind: 'kasse', title: CHECK_TITLES.kasse, light: l, value: `Storno ${nf1(k.storno)} % · Rabatt/Gratis ${nf1(k.discount)} % · ${nf1(k.noBon)} Std. ohne Bon`,
      text: l === 'green' ? sayOk('Storno-Quote, Rabatte und Bon-Lücken sind unauffällig') : 'Auffällig viele Stornos, Rabatte bzw. Gratisbecher oder Stunden ohne Bon trotz Öffnungszeit.', note: 'Kommt im echten System aus helloTESS! – in der Demo simuliert.',
    })
  }
  m.set(`${storeId}|${today}`, out)
  return out
}
void DEMO_STORE_2; void DEMO_STORE_3
