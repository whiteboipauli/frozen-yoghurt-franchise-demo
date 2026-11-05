/** Adressen der App: alte Adressen führen auf die neuen Seiten (keine toten Links) */
const STORE_LEGACY: Record<string, string> = {
  '': '/heute', '/uebersicht': '/heute', '/bestand': '/ware/artikel', '/forecast': '/ware/artikel', '/bestellliste': '/ware/artikel', '/bestellen': '/ware/artikel',
  '/wareneingang': '/ware/bestellungen', '/meine-bestellungen': '/ware/bestellungen', '/rechnungen': '/ware/rechnungen', '/ware': '/ware/artikel',
  '/team': '/team/dienstplan', '/dienstplan': '/team/dienstplan', '/mitarbeitende': '/team/mitarbeitende', '/verfuegbarkeit': '/team/mitarbeitende', '/schnittstellen': '/einstellungen', '/import': '/einstellungen',
  '/pinnwand': '/hq/pinnwand', '/aktionen': '/hq/aktionen', '/wissen': '/hq/wissen', '/hq': '/hq/pinnwand', '/verkauf': '/demo',
}
export const storeRest = (rest: string) => STORE_LEGACY[rest] ?? rest
export function hqLegacy(route: string): string | null {
  const m = route.match(/^\/zentrale\/(kennzahlen|warenabgleich|inventuren|laden|lieferungen|rechnungen|gebuehren|pinnwand|aktionen|wissen|eigene|laeden|finanzen|kommunikation)(?:\/([^/]+))?$/)
  if (!m) return null
  const [, a, id] = m
  if (a === 'kennzahlen' || a === 'laden') return id ? `/zentrale/laeden/${id}` : '/zentrale/laeden'
  if (a === 'warenabgleich') return id ? `/zentrale/laeden/${id}/warenabgleich` : null
  if (a === 'inventuren' || a === 'eigene') return '/zentrale/laeden'
  if (a === 'lieferungen') return '/zentrale/bestellungen'
  if (a === 'rechnungen' && !id) return '/zentrale/finanzen/rechnungen'
  if (a === 'gebuehren') return '/zentrale/finanzen/rechnungen'
  if (a === 'pinnwand' || a === 'aktionen' || a === 'wissen') return `/zentrale/kommunikation/${a}`
  if (a === 'finanzen' && !id) return '/zentrale/finanzen/rechnungen'
  if (a === 'kommunikation' && !id) return '/zentrale/kommunikation/pinnwand'
  return null
}


const STORE_PAGES = [/^\/heute$/, /^\/ware\/(artikel|bestellungen|rechnungen)$/, /^\/inventur$/, /^\/monatszahlen$/, /^\/team\/(dienstplan|mitarbeitende)$/, /^\/hq\/(pinnwand|aktionen|wissen)$/, /^\/einstellungen$/, /^\/demo$/, /^\/rechnungen\/[^/]+$/]
const HQ_PAGES = [/^\/zentrale\/cockpit$/, /^\/zentrale\/laeden(\/[^/]+(\/(uebersicht|warenabgleich|inventuren|bestellungen|meldungen))?)?$/, /^\/zentrale\/bestellungen$/, /^\/zentrale\/warenabgleich$/, /^\/zentrale\/meldungen(\/[^/]+)?$/, /^\/zentrale\/finanzen\/(rechnungen|gebuehren)$/, /^\/zentrale\/rechnungen\/[^/]+$/, /^\/zentrale\/kommunikation\/(pinnwand|aktionen|wissen)$/, /^\/zentrale\/katalog$/, /^\/einstellungen$/, /^\/zentrale\/fall\/[^/]+\/[^/]+$/, /^\/zentrale\/lieferschein\/[^/]+$/]

/** Führt die Adresse (auch eine alte) auf eine vorhandene Seite? */
export function isKnownRoute(path: string): boolean {
  if (path === '/' || path === '/zentrale') return true
  let m = path.match(/^\/zentrale\/eigene\/[^/]+(\/.*)?$/)
  if (m) return STORE_PAGES.some((r) => r.test(storeRest(m![1] ?? '')))
  m = path.match(/^\/filiale(\/.*)?$/)
  if (m) return STORE_PAGES.some((r) => r.test(storeRest(m![1] ?? '')))
  const l = hqLegacy(path)
  return HQ_PAGES.some((r) => r.test(l ?? path))
}
