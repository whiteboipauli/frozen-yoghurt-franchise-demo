import { Icon, Illustration, type IconName } from '../icons'

/** Grafiken: Topping-Daten (Icon + Farbe) und Artikel-Symbole. Alle Icons liegen zentral in src/icons. */
export interface TopMeta { icon: IconName; color: string; group: 'Obst' | 'Crunch' | 'Saucen' | 'Süßes' }
export const TOPPING_META: Record<string, TopMeta> = {
  erdbeeren: { icon: 'strawberry', color: '#e63946', group: 'Obst' },
  mango: { icon: 'mango', color: '#f08c00', group: 'Obst' },
  blaubeeren: { icon: 'blueberry', color: '#4c5bd4', group: 'Obst' },
  kiwi: { icon: 'kiwi', color: '#5fa516', group: 'Obst' },
  himbeeren: { icon: 'raspberry', color: '#d9342b', group: 'Obst' },
  oreo: { icon: 'cookie', color: '#3d3a48', group: 'Crunch' },
  biscoff: { icon: 'cookie', color: '#b86a30', group: 'Crunch' },
  brownie: { icon: 'brownie', color: '#74452a', group: 'Crunch' },
  granola: { icon: 'wheat', color: '#c4912c', group: 'Crunch' },
  kokos: { icon: 'coconut', color: '#a89a82', group: 'Crunch' },
  mandeln: { icon: 'almond', color: '#a47848', group: 'Crunch' },
  schokosauce: { icon: 'sauce', color: '#5c3322', group: 'Saucen' },
  karamellsauce: { icon: 'sauce', color: '#c97d1c', group: 'Saucen' },
  matchasauce: { icon: 'sauce', color: '#5f9b47', group: 'Saucen' },
  gummibaerchen: { icon: 'gummy', color: '#ef6a3c', group: 'Süßes' },
  mochi: { icon: 'mochi', color: '#c98a4b', group: 'Süßes' },
  boba: { icon: 'boba', color: '#9a52d8', group: 'Süßes' },
}
export const metaOf = (id: string): TopMeta => TOPPING_META[id] ?? { icon: 'box', color: '#8a8791', group: 'Süßes' }
export const GROUPS = ['Alle', 'Obst', 'Crunch', 'Saucen', 'Süßes'] as const

/** Kreis mit Topping-Icon in Topping-Farbe (gleicher Glas-Stil wie alle Artikel) */
export function TopBadge({ id, size = 56 }: { id: string; size?: number }) {
  return <ArtBadge article={{ id, category: 'Topping' }} size={size} />
}

/** Becher-Symbol (S/M/L) mit Yoghurt und Toppings im CI */
export function CupArt({ size = 'M', tops = [], height = 150 }: { size?: 'S' | 'M' | 'L'; tops?: string[]; height?: number }) {
  const k = size === 'S' ? 0.78 : size === 'M' ? 0.9 : 1
  const w = 100 * k
  const cx = 60
  const top = 26 + (1 - k) * 40
  const bottom = 118
  const halfTop = w * 0.5
  const halfBot = w * 0.34
  const dots = tops.slice(0, 12)
  return (
    <svg viewBox="0 0 120 130" height={height} aria-hidden style={{ overflow: 'visible' }}>
      <ellipse cx={cx} cy={bottom + 5} rx={halfBot + 10} ry="5" fill="rgba(0,0,0,.14)" />
      <path d={`M${cx - halfTop} ${top + 20} L${cx + halfTop} ${top + 20} L${cx + halfBot} ${bottom} Q${cx} ${bottom + 7} ${cx - halfBot} ${bottom} Z`} fill="#4a4c54" />
      <path d={`M${cx - halfTop + 4} ${top + 28} L${cx - halfBot + 3} ${bottom - 8}`} stroke="rgba(255,255,255,.55)" strokeWidth="3" strokeLinecap="round" />
      <path d={`M${cx - halfTop + 3} ${top + 20} Q${cx - halfTop + 4} ${top - 6} ${cx} ${top - 10} Q${cx + halfTop - 4} ${top - 6} ${cx + halfTop - 3} ${top + 20} Z`} fill="#fff" stroke="#e2e4e8" strokeWidth="1.2" />
      {dots.map((t, i) => {
        const m = metaOf(t)
        const a = (i / Math.max(dots.length, 1)) * Math.PI * 2 + 0.6
        const r = i % 2 ? halfTop * 0.45 : halfTop * 0.2
        return <circle key={i} cx={cx + Math.cos(a) * r} cy={top + 8 + Math.sin(a) * 7} r="6" fill={m.color} stroke="#fff" strokeWidth="1.2" />
      })}
    </svg>
  )
}

/** Symbol eines Artikels (Topping-Icon bzw. Artikel der Zentrale) */
export const artIconName = (a: { id: string; category: string }): IconName =>
  TOPPING_META[a.id]?.icon ?? (a.id === 'pulver' ? 'powder' : a.id.startsWith('becher') ? 'cup' : a.id === 'loeffel' ? 'spoon' : a.id === 'deckel' ? 'lid' : a.id === 'servietten' ? 'napkin' : a.id === 'tragetasche' ? 'tote' : 'box')
export function ArtIcon({ article, size = 22 }: { article: { id: string; category: string }; size?: number }) {
  return <span className="art-ico" style={{ color: TOPPING_META[article.id]?.color }}><Icon name={artIconName(article)} size={size} /></span>
}
/** Kompatibilität: liefert das Symbol als Element */
export const artEmoji = (a: { id: string; category: string }) => <ArtIcon article={a} />

/** Farben der von der Zentrale bezogenen Artikel (für den Glas-Kreis) */
const YO_COLOR: Record<string, string> = { 'becher-s': '#3f8cf0', 'becher-m': '#3f8cf0', 'becher-l': '#3f8cf0', loeffel: '#12a594', pulver: '#8a6ee0', deckel: '#5f7a9c', servietten: '#e0912c', tragetasche: '#4f6bd8' }

/** EIN Bild-Stil für alle Artikel: Glas-Kreis, leicht in der Artikelfarbe eingefärbt – Topping-Symbol bzw. Illustration (oder Foto) darin */
export function ArtBadge({ article, size = 52 }: { article: { id: string; category: string; name?: string; imageUrl?: string }; size?: number }) {
  const top = TOPPING_META[article.id]
  const color = top?.color ?? YO_COLOR[article.id] ?? '#6b7a90'
  return (
    <span className="art-badge" style={{ width: size, height: size, ['--tc' as string]: color, color }}>
      {top ? <Icon name={top.icon} size={Math.round(size * 0.5)} stroke={1.7} /> : article.imageUrl ? <img src={article.imageUrl} alt={article.name ?? ''} /> : <span className="art-badge-img" style={{ width: size * 0.74, height: size * 0.74 }}><Illustration id={article.id} /></span>}
    </span>
  )
}
