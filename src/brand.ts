/** Zentrale Marken- und Namenstexte der Demo. Hier ändern, dann gilt es überall. */
export const brand = {
  produktName: 'Frozen Yoghurt Franchise',
  untertitel: 'Warenwirtschaft',
  ladenMarke: 'Frozen Yoghurt',
  zentraleName: 'HQ',
  zentraleUntertitel: 'Kontrolle der Läden',
  rechnungsAbsender: 'Frozen Yoghurt Franchise GmbH (Demo)',
  rechnungsPrefix: 'FY',
  artikelPrefix: 'FY',
  /** Lieferant der Artikel, die beim Headquarter bestellt werden */
  lieferant: 'Headquarter',
  /** Namen der Speicherschlüssel im Browser */
  speicherPrefix: 'fj-ww',
} as const
export const ladenName = (ort: string) => `${brand.ladenMarke} ${ort}`
export const ohneMarke = (name: string) => name.replace(`${brand.ladenMarke} `, '')
