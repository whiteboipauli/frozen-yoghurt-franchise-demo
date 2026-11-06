import type { Db } from '../data/types'
import { addDays, diffDays, todayISO, WEEKDAYS, weekdayIdx } from '../lib/date'
import { fmtDate } from '../lib/format'
import type { IconName } from '../icons'
import { byReach, explainDay, expectedUse, forecastAll } from './forecast'
import { rainClass } from './weather'
import { dayStaffing } from './staffing'

export interface Tip {
  key: string
  icon: IconName
  text: string
  btn: string
  /** Artikel im Bestell-Fenster öffnen … */
  articleId?: string
  /** … oder diese Seite (bzw. diesen Tag im Dienstplan) öffnen */
  to?: string
  planDay?: string
}

const portion = (db: Db, id: string) => { const a = db.articles.find((x) => x.id === id); return a?.unit === 'kg' ? a.portionGrams ?? 20 : 1 }

/** 2–3 konkrete Hinweise aus den eigenen Daten und dem Forecast (keine Vergleiche mit anderen Läden) */
export function storeTips(db: Db, storeId: string, today = todayISO()): Tip[] {
  const tips: Tip[] = []
  const fc = forecastAll(db, storeId)

  // 1) Wetter: ein deutlich stärkerer Tag in den nächsten Tagen
  let best: { date: string; delta: number; tmax: number; sun: boolean } | null = null
  for (let i = 1; i <= 7; i++) {
    const date = addDays(today, i)
    const e = explainDay(db, storeId, date, today)
    const w = e.plan.wx
    if (e.deltaPct !== null && e.deltaPct >= 15 && (!best || e.deltaPct > best.delta)) best = { date, delta: e.deltaPct, tmax: w ? Math.round(w.tmax) : 0, sun: !!w && rainClass(w.rain) === 'trocken' && w.sun >= 6 }
  }
  if (best) {
    const cup = fc.find((f) => f.article.id === 'becher-l')
    const tops = fc.filter((f) => f.article.source === 'extern').sort((a, b) => expectedUse(db, storeId, b.article.id, best!.date, today) / Math.max(1, portion(db, b.article.id)) - expectedUse(db, storeId, a.article.id, best!.date, today) / Math.max(1, portion(db, a.article.id)))
    const top = tops.find((t) => t.reach !== null && t.reach < 12) ?? tops[0]
    const wd = WEEKDAYS[weekdayIdx(best.date)]
    const cond = best.tmax ? `${best.tmax} °C${best.sun ? ' und Sonne' : ''}` : 'gutes Wetter'
    tips.push({
      key: 'wx', icon: 'trend-auf', text: `${wd} (${cond}) verkaufst du erfahrungsgemäß ca. ${Math.round(best.delta / 5) * 5} % mehr Becher – bestelle ${top ? top.article.name : 'Becher'} rechtzeitig.`,
      btn: 'Jetzt bestellen', articleId: (cup && (cup.light !== 'green' || (cup.reach ?? 99) < 14) ? cup : top ?? cup)?.article.id ?? 'becher-l',
    })
  }

  // 2) Dienstplan: zusammenhängende Überbesetzung (≥ 2 Stunden) in den nächsten 14 Tagen
  let over: { date: string; from: number; to: number; extra: number } | null = null
  for (let i = 1; i < 14; i++) {
    const date = addDays(today, i)
    const d = dayStaffing(db, storeId, date, today)
    if (d.gaps.length) continue // Tage mit Lücke nie als überbesetzt bezeichnen
    let run: { from: number; to: number } | null = null
    const flush = () => {
      if (run && run.to - run.from >= 2 && (!over || run.to - run.from > over.to - over.from)) over = { date, from: run.from, to: run.to, extra: 1 }
      run = null
    }
    d.cov.forEach((c, k) => {
      const h = d.open + k
      if (c > (d.need[h] ?? 0)) run = run ? { from: run.from, to: h + 1 } : { from: h, to: h + 1 }
      else flush()
    })
    flush()
  }
  const o = over as { date: string; from: number; to: number } | null
  if (o) tips.push({ key: 'over', icon: 'people', text: `${WEEKDAYS[weekdayIdx(o.date)]} ${o.from}–${o.to} Uhr bisher überbesetzt – plane hier eine Person weniger ein.`, btn: 'Im Dienstplan ansehen', planDay: o.date })

  // 3) Aktion des HQ steht an
  const camp = [...db.campaigns].filter((c) => c.to >= today).sort((a, b) => a.from.localeCompare(b.from))[0]
  if (camp && diffDays(camp.from, today) <= 45) {
    const names = camp.articleIds.map((id) => db.articles.find((a) => a.id === id)?.name).filter(Boolean).slice(0, 3).join(', ')
    tips.push({ key: 'camp', icon: 'flag', text: `${camp.title} ab ${fmtDate(camp.from)}: ca. ${camp.extraPct} % Mehrverbrauch bei ${names}. Die Bestellvorschläge berücksichtigen das rechtzeitig.`, btn: 'Aktion ansehen', to: '/filiale/hq/aktionen' })
  }

  // Auffüllen: knappster Artikel
  if (tips.length < 2) {
    const f = [...fc].sort(byReach).find((x) => x.reach !== null && x.reach < 10)
    if (f) tips.push({ key: 'reach', icon: 'stock', text: `${f.article.name} reicht noch ca. ${Math.max(1, Math.round(f.reach!))} Tag${Math.round(f.reach!) === 1 ? '' : 'e'} – bald nachbestellen.`, btn: 'Bestellen', articleId: f.article.id })
  }
  return tips.slice(0, 3)
}
