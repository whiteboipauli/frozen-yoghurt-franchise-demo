import { ladenName } from '../brand'
import type { Hours, Party, StateCode, Store } from './types'

export const STATE_NAMES: Record<StateCode, string> = {
  BW: 'Baden-Württemberg', BY: 'Bayern', BE: 'Berlin', BB: 'Brandenburg', HB: 'Bremen', HH: 'Hamburg', HE: 'Hessen', MV: 'Mecklenburg-Vorpommern',
  NI: 'Niedersachsen', NW: 'Nordrhein-Westfalen', RP: 'Rheinland-Pfalz', SL: 'Saarland', SN: 'Sachsen', ST: 'Sachsen-Anhalt', SH: 'Schleswig-Holstein', TH: 'Thüringen',
}

export const TOUR_STORE = 'duesseldorf-carlstadt'
export const OWN_STORES = ['duesseldorf-carlstadt']
/** Klar fiktive Demo-Läden mit Auffälligkeiten */
export const DEMO_STORE = 'musterstadt'
export const DEMO_STORE_2 = 'beispielhausen'
export const DEMO_STORE_3 = 'probenheim'
export const DEMO_STORES = [DEMO_STORE, DEMO_STORE_2, DEMO_STORE_3]
export const isOwnStore = (id: string) => OWN_STORES.includes(id)

/** Koordinaten je Stadt (Wetter) */
export const CITY_COORDS: Record<string, { lat: number; lon: number }> = {
  Bielefeld: { lat: 52.02, lon: 8.53 }, Bremen: { lat: 53.08, lon: 8.8 }, Duisburg: { lat: 51.43, lon: 6.76 },
  Düsseldorf: { lat: 51.23, lon: 6.78 }, Hamburg: { lat: 53.55, lon: 9.99 }, Kiel: { lat: 54.32, lon: 10.14 }, Köln: { lat: 50.94, lon: 6.96 },
  Krefeld: { lat: 51.34, lon: 6.59 }, Lübeck: { lat: 53.87, lon: 10.69 }, Lüneburg: { lat: 53.25, lon: 10.41 }, Meerbusch: { lat: 51.26, lon: 6.68 },
  Münster: { lat: 51.96, lon: 7.63 }, Paderborn: { lat: 51.72, lon: 8.75 }, Würzburg: { lat: 49.79, lon: 9.95 }, Musterstadt: { lat: 51.23, lon: 6.78 }, Beispielhausen: { lat: 50.94, lon: 6.96 }, Probenheim: { lat: 49.79, lon: 9.95 },
}

type Row = [id: string, name: string, city: string, state: StateCode, base: number, seed: number]
/** Name – Stadt – Bundesland, Basisumsatz (Becher an einem normalen Werktag) und Seed */
export const STORE_ROWS: Row[] = [
  ['bielefeld', 'Bielefeld', 'Bielefeld', 'NW', 104, 3], ['bremen', 'Bremen', 'Bremen', 'HB', 112, 7],
  ['duisburg', 'Duisburg', 'Duisburg', 'NW', 96, 11],
  ['duesseldorf-carlstadt', 'Carlstadt', 'Düsseldorf', 'NW', 122, 17], ['duesseldorf-derendorf', 'Düsseldorf Derendorf', 'Düsseldorf', 'NW', 100, 19],
  ['duesseldorf-oberkassel', 'Düsseldorf Oberkassel', 'Düsseldorf', 'NW', 108, 23], ['duesseldorf-unterbilk', 'Düsseldorf Unterbilk', 'Düsseldorf', 'NW', 114, 29],
  ['hamburg-rathaus', 'Hamburg Rathaus', 'Hamburg', 'HH', 134, 31], ['hamburg-sternschanze', 'Hamburg Sternschanze', 'Hamburg', 'HH', 128, 37],
  ['kiel', 'Kiel', 'Kiel', 'SH', 98, 41], ['koeln-campus', 'Köln Campus', 'Köln', 'NW', 126, 43], ['koeln-eigelstein', 'Köln Eigelstein', 'Köln', 'NW', 132, 47],
  ['krefeld', 'Krefeld', 'Krefeld', 'NW', 88, 53], ['luebeck', 'Lübeck', 'Lübeck', 'SH', 94, 59], ['lueneburg', 'Lüneburg', 'Lüneburg', 'NI', 86, 61],
  ['meerbusch', 'Meerbusch', 'Meerbusch', 'NW', 84, 67], ['muenster-koenigsstrasse', 'Münster Königsstraße', 'Münster', 'NW', 120, 71],
  ['paderborn', 'Paderborn', 'Paderborn', 'NW', 92, 73], ['wuerzburg-domstrasse', 'Würzburg Domstraße', 'Würzburg', 'BY', 102, 79],
  ['musterstadt', 'Musterstadt', 'Musterstadt', 'NW', 100, 83],
  ['beispielhausen', 'Beispielhausen', 'Beispielhausen', 'NW', 96, 89],
  ['probenheim', 'Probenheim', 'Probenheim', 'BY', 90, 97],
]
export const STORE_CFG: Record<string, { base: number; seed: number }> = Object.fromEntries(STORE_ROWS.map((r) => [r[0], { base: r[4], seed: r[5] }]))

export const DEFAULT_HOURS: Hours = { open: 10, close: 20, summerClose: 21 }
const ph = (name: string, city: string, i: number): Party => ({ name, street: `Beispielweg ${10 + ((i * 7) % 80)}`, zipCity: `${String(40000 + ((i * 1373) % 50000)).padStart(5, '0')} ${city}`, vatId: `DE${String(200000000 + i * 7919123).slice(0, 9)}` })

export function seedStores(): Store[] {
  return STORE_ROWS.map(([id, ort, city, state], i) => ({
    id, name: ladenName(ort), city, state, hours: { ...DEFAULT_HOURS }, cupsPerStaffHour: 35, minStaff: 2,
    franchise: ph(isOwnStore(id) ? `${ladenName(ort)} (HQ-eigen)` : `${ort} Franchise GmbH`, city, i + 1),
    demo: DEMO_STORES.includes(id) || undefined,
    own: isOwnStore(id) || undefined,
    tag: id === TOUR_STORE ? 'Flagship' : undefined,
  }))
}
