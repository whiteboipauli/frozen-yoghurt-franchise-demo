/**
 * Spring → CSS linear()-Easing. Parameter wie bei Apple: Dämpfungsverhältnis (1 = ohne Überschwingen)
 * und Response (Sekunden bis zur ersten Annäherung). Gibt Easing und passende Dauer zurück.
 */
export function spring(damping: number, response: number) {
  const w = (2 * Math.PI) / response
  const settle = damping >= 1 ? 6 / w : 4.6 / (damping * w)
  const n = 48
  const pts: string[] = []
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * settle
    let x: number
    if (damping >= 1) x = 1 - (1 + w * t) * Math.exp(-w * t)
    else {
      const wd = w * Math.sqrt(1 - damping * damping)
      x = 1 - Math.exp(-damping * w * t) * (Math.cos(wd * t) + ((damping * w) / wd) * Math.sin(wd * t))
    }
    pts.push(x.toFixed(4))
  }
  pts[n] = '1'
  return { easing: `linear(${pts.join(', ')})`, duration: `${settle.toFixed(2)}s` }
}

export function installSprings() {
  const root = document.documentElement.style
  const a = spring(1, 0.34) // Standard: kritisch gedämpft
  const b = spring(1, 0.5) // weicher, für Seiten/Diagramme
  root.setProperty('--spring', a.easing)
  root.setProperty('--spring-dur', a.duration)
  root.setProperty('--spring-soft', b.easing)
  root.setProperty('--spring-soft-dur', b.duration)
}
