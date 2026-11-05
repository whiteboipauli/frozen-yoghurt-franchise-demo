/**
 * Produktillustrationen in neutralem Grau für den Katalog.
 * Jeder Artikel hat einen Bild-Platz: Ist `article.imageUrl` gesetzt (echtes Produktfoto), wird es gezeigt, sonst die Illustration.
 */
const M = '#4a4c54'
const MS = '#c9ccd3'
const K = '#222327'
const W = '#ffffff'

function Cup({ size }: { size: 'S' | 'M' | 'L' }) {
  const k = size === 'S' ? 0.8 : size === 'M' ? 0.9 : 1
  const hw = 34 * k, hb = 24 * k, top = 100 - 78 * k
  return (
    <svg viewBox="0 0 120 120" width="100%" height="100%" aria-hidden>
      <ellipse cx="60" cy="106" rx={hb + 8} ry="4.5" fill="rgba(0,0,0,.12)" />
      <path d={`M${60 - hw} ${top + 18} L${60 + hw} ${top + 18} L${60 + hb} 102 Q60 108 ${60 - hb} 102 Z`} fill={M} />
      <path d={`M${60 - hw + 3} ${top + 18} L${60 + hw - 3} ${top + 18} L${60 + hw - 4} ${top + 28} L${60 - hw + 4} ${top + 28} Z`} fill={W} opacity=".92" />
      <path d={`M${60 - hw + 4} ${top + 18} Q60 ${top - 10} ${60 + hw - 4} ${top + 18}`} fill={W} stroke="#e9e3e8" strokeWidth="1.4" />
      <path d={`M${60 - hw * 0.4} ${top + 8} Q60 ${top - 6} ${60 + hw * 0.4} ${top + 8}`} fill="none" stroke="#e9e3e8" strokeWidth="1.2" />
      <text x="60" y={top + 62 * k} textAnchor="middle" fontSize={22 * k} fontWeight="800" fill={W} fontFamily="system-ui, sans-serif">{size}</text>
    </svg>
  )
}
const Illus: Record<string, () => React.ReactElement> = {
  cupS: () => <Cup size="S" />, cupM: () => <Cup size="M" />, cupL: () => <Cup size="L" />,
  spoon: () => (
    <svg viewBox="0 0 120 120" width="100%" height="100%" aria-hidden>
      <ellipse cx="60" cy="109" rx="26" ry="4" fill="rgba(0,0,0,.12)" />
      <g transform="rotate(32 60 60)">
        <rect x="55" y="46" width="10" height="64" rx="5" fill="#3d4b63" />
        <rect x="57.500" y="52" width="2.500" height="50" rx="1.250" fill="#fff" opacity=".28" />
        <ellipse cx="60" cy="28" rx="19" ry="25" fill="#ffffff" stroke="#8fa3bf" strokeWidth="3" />
        <ellipse cx="60" cy="31" rx="12" ry="17" fill="#e8eef7" />
        <ellipse cx="53" cy="20" rx="4" ry="9" fill="#fff" opacity=".9" />
      </g>
    </svg>
  ),
  powder: () => (
    <svg viewBox="0 0 120 120" width="100%" height="100%" aria-hidden>
      <ellipse cx="60" cy="108" rx="34" ry="4.500" fill="rgba(0,0,0,.12)" />
      <path d="M32 26 L88 26 L94 100 Q94 106 88 106 L32 106 Q26 106 26 100 Z" fill={W} stroke="#e4dde3" strokeWidth="1.500" />
      <path d="M31 26 L89 26 L90 18 L30 18 Z" fill={K} />
      <rect x="27" y="52" width="66" height="34" fill={M} />
      <text x="60" y="76" textAnchor="middle" fontSize="19" fontWeight="800" fill={W} fontFamily="system-ui, sans-serif">FY</text>
      <circle cx="60" cy="40" r="6" fill={MS} />
    </svg>
  ),
  lid: () => (
    <svg viewBox="0 0 120 120" width="100%" height="100%" aria-hidden>
      <ellipse cx="60" cy="104" rx="42" ry="4.500" fill="rgba(0,0,0,.12)" />
      <ellipse cx="60" cy="82" rx="46" ry="14" fill={M} />
      <path d="M22 80 C22 52 40 34 60 34 C80 34 98 52 98 80 Z" fill={W} stroke="#e4dde3" strokeWidth="1.500" />
      <ellipse cx="60" cy="80" rx="38" ry="9" fill={W} stroke="#e4dde3" strokeWidth="1.200" />
      <circle cx="60" cy="40" r="5" fill={K} />
    </svg>
  ),
  napkin: () => (
    <svg viewBox="0 0 120 120" width="100%" height="100%" aria-hidden>
      <ellipse cx="60" cy="106" rx="40" ry="4.500" fill="rgba(0,0,0,.12)" />
      <rect x="24" y="30" width="72" height="68" rx="6" fill={W} stroke="#e4dde3" strokeWidth="1.500" />
      <rect x="30" y="24" width="72" height="68" rx="6" fill={W} stroke="#e4dde3" strokeWidth="1.500" opacity=".9" />
      <path d="M30 58 H102 M66 24 V92" stroke="#dde5ef" strokeWidth="1.500" />
      <rect x="30" y="44" width="72" height="9" fill={M} opacity=".9" />
    </svg>
  ),
  tote: () => (
    <svg viewBox="0 0 120 120" width="100%" height="100%" aria-hidden>
      <ellipse cx="60" cy="108" rx="38" ry="4.500" fill="rgba(0,0,0,.12)" />
      <path d="M42 42 V32 a18 18 0 0 1 36 0 V42" fill="none" stroke={K} strokeWidth="5" strokeLinecap="round" />
      <path d="M28 42 H92 L98 104 H22 Z" fill={M} />
      <text x="60" y="82" textAnchor="middle" fontSize="20" fontWeight="800" fill={W} fontFamily="system-ui, sans-serif">FY</text>
    </svg>
  ),
  box: () => (
    <svg viewBox="0 0 120 120" width="100%" height="100%" aria-hidden>
      <path d="M20 40 L60 20 L100 40 V84 L60 104 L20 84 Z" fill={W} stroke="#d9cfd6" strokeWidth="2" />
      <path d="M20 40 L60 60 L100 40 M60 60 V104" fill="none" stroke="#d9cfd6" strokeWidth="2" />
      <path d="M40 30 L80 50 V60 L40 40 Z" fill={M} opacity=".85" />
    </svg>
  ),
}
export const illustrationKey = (id: string) =>
  id === 'becher-s' ? 'cupS' : id === 'becher-m' ? 'cupM' : id === 'becher-l' ? 'cupL' : id === 'loeffel' ? 'spoon' : id === 'pulver' ? 'powder' : id === 'deckel' ? 'lid' : id === 'servietten' ? 'napkin' : id === 'tragetasche' ? 'tote' : 'box'

/** Produktbild-Platz: echtes Foto (imageUrl) oder CI-Illustration */
export function ProductArt({ article, size = 120 }: { article: { id: string; name: string; imageUrl?: string }; size?: number }) {
  const R = Illus[illustrationKey(article.id)]
  return (
    <span className="prod-art" style={{ width: size, height: size }}>
      {article.imageUrl ? <img src={article.imageUrl} alt={article.name} /> : <R />}
    </span>
  )
}

/** Illustration ohne eigenen Rahmen (für Glas-Kreise) */
export function Illustration({ id }: { id: string }) {
  const R = Illus[illustrationKey(id)]
  return <R />
}
