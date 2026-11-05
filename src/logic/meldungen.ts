import type { IconName } from '../icons'

/** Arten von Meldungen im HQ  */
export type ReportArt = 'inventur' | 'anfrage' | 'stoerung' | 'umsatz' | 'kasse' | 'ueberfaellig' | 'reklamation' | 'unterbesetzung' | 'rechnung' | 'wareneinsatz'
export const ART_LABEL: Record<ReportArt, string> = {
  inventur: 'Inventur-Abweichung', anfrage: 'Anfrage vom Laden', stoerung: 'Störung / Defekt', umsatz: 'Umsatzeinbruch', kasse: 'Kassenabweichung',
  ueberfaellig: 'Überfällig', reklamation: 'Reklamation / Lieferproblem', unterbesetzung: 'Unterbesetzung', rechnung: 'Rechnung überfällig', wareneinsatz: 'Wareneinsatz zu hoch',
}
export const ART_ICON: Record<ReportArt, IconName> = {
  inventur: 'klemmbrett', anfrage: 'note', stoerung: 'warn', umsatz: 'trend-ab', kasse: 'euro', ueberfaellig: 'uhr', reklamation: 'paket', unterbesetzung: 'person-plus', rechnung: 'rechnung', wareneinsatz: 'becher',
}
export const ART_ORDER = Object.keys(ART_LABEL) as ReportArt[]
/** Vom Laden gesendete Arten (Formular „Meldung an HQ“) */
export type SentArt = 'anfrage' | 'stoerung' | 'reklamation'
export const SENT_FORM: { value: string; label: string; art: SentArt }[] = [
  { value: 'anfrage', label: 'Anfrage', art: 'anfrage' },
  { value: 'maschine', label: 'Maschine defekt', art: 'stoerung' },
  { value: 'lieferung', label: 'Lieferproblem', art: 'reklamation' },
  { value: 'sonstiges', label: 'Sonstiges', art: 'anfrage' },
]
const MAP: Record<string, ReportArt> = {
  inventur: 'inventur', pulver: 'inventur', groessen: 'inventur', invdisz: 'inventur',
  bezug: 'wareneinsatz', abgang: 'wareneinsatz', zubehoer: 'wareneinsatz',
  mehrverkauf: 'kasse', kasse: 'kasse', kassenabw: 'kasse',
  prognose: 'umsatz', ueberfaellig: 'ueberfaellig', monatsabschluss: 'ueberfaellig',
  rechnung: 'rechnung', unterbesetzung: 'unterbesetzung',
}
export const artOfKind = (kind: string, stored?: ReportArt): ReportArt => (kind.startsWith('r-') ? stored ?? 'anfrage' : MAP[kind] ?? 'inventur')
