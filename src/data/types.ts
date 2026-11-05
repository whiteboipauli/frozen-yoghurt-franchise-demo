export type Source = 'zentrale' | 'extern'
export type Unit = 'kg' | 'Stück'
export type Category = 'Yoghurt' | 'Becher' | 'Zubehör' | 'Topping'
export type StateCode = 'BW' | 'BY' | 'BE' | 'BB' | 'HB' | 'HH' | 'HE' | 'MV' | 'NI' | 'NW' | 'RP' | 'SL' | 'SN' | 'ST' | 'SH' | 'TH'

export interface Article {
  id: string
  name: string
  category: Category | string
  source: Source
  supplier: string // 'Zentrale' oder Lieferantenname
  unit: Unit
  /** Packungsgröße in der Einheit (kg bzw. Stück) */
  packSize: number
  /** Gramm pro Portion (kg-Artikel). Topping: 1 Portion = 1 Löffel */
  portionGrams?: number
  leadTimeDays: number
  /** Nettopreis pro Packung in € */
  packPrice: number
  /** Katalog des HQ (nur Artikel der Zentrale) */
  sku?: string
  /** Umsatzsteuersatz in % (nur Artikel der Zentrale) */
  vatRate?: number
  /** im Katalog bestellbar (nur Artikel der Zentrale) */
  available?: boolean
  /** Platz für ein echtes Produktfoto (URL oder Data-URL); ohne Bild wird die Illustration gezeigt */
  imageUrl?: string
}

export interface Recipe {
  id: string
  name: string
  kind: 'size'
  cupId: string
  spoonId: string
  powderId: string
  powderGrams: number
  fixedToppings: string[]
  /** weitere Verbrauchsartikel je Verkauf (Deckel, Servietten …), auch Bruchteile */
  extras: Record<string, number>
  /** Verkaufspreis brutto in € */
  price: number
}

export interface Party {
  name: string
  street: string
  zipCity: string
  vatId: string
}
export interface Hours {
  open: number
  close: number
  /** Schließzeit in den Sommermonaten (Mai–September) */
  summerClose: number
}
export interface Store {
  id: string
  name: string
  city: string
  state: StateCode
  hours: Hours
  /** Personalbedarf: Becher pro Mitarbeiter-Stunde und Mindestbesetzung */
  cupsPerStaffHour: number
  minStaff: number
  franchise: Party
  demo?: boolean
  /** HQ-eigener Laden (sonst Franchisenehmer) */
  own?: boolean
  /** Zusatz in der Kopfleiste, z. B. „Flagship“ */
  tag?: string
}

/** Kassendaten eines Tages (Stückzahlen je Rezeptur + frei gewählte Topping-Portionen) */
export interface SaleDay {
  storeId: string
  date: string
  counts: Record<string, number>
  toppings: Record<string, number>
}

export interface OrderLine {
  articleId: string
  packs: number
}
export type OrderStatus = 'bestellt' | 'geliefert'
/** Bestellung bei externen Topping-Lieferanten (Abhaken in der Bestellliste) */
export interface Order {
  id: string
  storeId: string
  supplier: string
  status: OrderStatus
  orderedOn: string
  expectedOn: string
  deliveredOn?: string
  lines: OrderLine[]
}

/* ---------- Bestellungen beim HQ ---------- */
export type CoStatus = 'eingegangen' | 'bestätigt' | 'versendet' | 'geliefert' | 'berechnet'
export const CO_FLOW: CoStatus[] = ['eingegangen', 'bestätigt', 'versendet', 'geliefert', 'berechnet']
export interface CoLine {
  articleId: string
  /** bestellte Packungen */
  packs: number
  /** vom HQ bestätigte Packungen (falls geändert) */
  confirmed?: number
  reason?: string
}
export interface CentralOrder {
  id: string
  no: string
  storeId: string
  createdOn: string
  wishDate: string
  note: string
  lines: CoLine[]
  status: CoStatus
  confirmedOn?: string
  shippedOn?: string
  deliveredOn?: string
  invoiceId?: string
  /** Versand: Dienstleister, Sendungsnummer, voraussichtliches Lieferdatum */
  carrier?: string
  trackingNo?: string
  etaDate?: string
}
export const CARRIERS = ['DHL', 'DPD', 'UPS', 'GLS', 'Spedition', 'eigene Lieferung'] as const

export interface Delivery {
  id: string
  storeId: string
  articleId: string
  date: string
  /** Basiseinheit (g bzw. Stück) */
  qty: number
  orderId?: string
  coId?: string
  bookedBy: 'zentrale' | 'filiale'
  /** Filiale hat den Empfang bestätigt (bei Topping-Lieferungen immer true) */
  confirmed: boolean
  deviation?: string
}

/* ---------- Rechnungen ---------- */
export interface InvoiceParty extends Party {
  taxNumber?: string
  country: string
}
export interface InvoiceLine {
  pos: number
  sku: string
  name: string
  qty: number
  unit: string
  unitNet: number
  vatRate: number
  net: number
  /** Lieferdatum der Position */
  serviceDate: string
}
export interface InvoiceTax {
  rate: number
  net: number
  vat: number
}
export interface Invoice {
  id: string
  number: string
  type: 'rechnung' | 'storno'
  date: string
  /** Liefer- bzw. Leistungsdatum (Zeitraum bei Sammelrechnung) */
  serviceFrom: string
  serviceTo: string
  dueDate: string
  paymentDays: number
  storeId: string
  coIds: string[]
  seller: InvoiceParty & { iban: string; bic: string; bankName: string }
  buyer: InvoiceParty
  lines: InvoiceLine[]
  taxes: InvoiceTax[]
  net: number
  vat: number
  gross: number
  currency: 'EUR'
  /** Gutschrift/Storno: Nummer der Originalrechnung */
  refId?: string
  refNumber?: string
  reason?: string
  paidOn?: string
  cancelledBy?: string
  /** Franchise-Gebühren-Rechnung (statt Warenrechnung) und der abgerechnete Monat „JJJJ-MM“ */
  kind?: 'ware' | 'gebuehr'
  feeMonth?: string
}
export type InvoiceState = 'offen' | 'bezahlt' | 'überfällig' | 'storniert' | 'Gutschrift'

export type OutflowReason = 'an Dritte verkauft' | 'an andere Filiale abgegeben' | 'größerer Schaden' | 'Sonstiges'
export const OUTFLOW_REASONS: OutflowReason[] = ['an Dritte verkauft', 'an andere Filiale abgegeben', 'größerer Schaden', 'Sonstiges']
/** Sonstiger Abgang: Ware, die nicht über die Kasse lief */
export interface Outflow {
  id: string
  storeId: string
  articleId: string
  date: string
  qty: number
  label: string
  reason: OutflowReason
  note: string
}

export interface InventoryLine {
  articleId: string
  counted: number
  expected: number
}
export interface Inventory {
  id: string
  storeId: string
  date: string
  lines: InventoryLine[]
  /** Monatsinventur oder vom HQ angeforderte Sonder-Inventur */
  kind?: 'monat' | 'sonder'
  /** Monat, für den gezählt wurde („2026-10“); fehlt es, ergibt er sich aus dem Datum */
  period?: string
}

/** Anfrage des HQ an einen Laden: Sonder-Inventur oder Erinnerung (erscheint dort als Alarm) */
export interface HqRequest {
  id: string
  storeId: string
  kind: 'sonder-inventur' | 'erinnerung'
  createdOn: string
  note?: string
  doneOn?: string
}

/** Bearbeitungsstand eines Falls (Auffälligkeit eines Ladens); der Fall selbst wird aus den Daten abgeleitet */
export type CaseStatus = 'offen' | 'in Klärung' | 'geklärt'
export interface CaseNote { date: string; text: string }
export interface CaseRec {
  /** `${storeId}|${kind}` */
  id: string
  storeId: string
  kind: string
  status: CaseStatus
  notes: CaseNote[]
  resolution?: string
  resolvedOn?: string
}

/* ---------- Kalender ---------- */
export interface Holiday {
  id: string
  date: string
  name: string
  special?: boolean
}
export interface SchoolHoliday {
  id: string
  state: StateCode
  name: string
  from: string
  to: string
}

/* ---------- Personal ---------- */
export type ContractKind = 'minijob' | 'werkstudent' | 'teilzeit' | 'vollzeit' | 'sonstig'
export interface ContractType {
  id: string
  name: string
  kind: ContractKind
  /** Minijob: Verdienstgrenze wird aus den Einstellungen genommen */
  weekHoursTerm?: number
  weekHoursBreak?: number
  defaultTarget: number
  defaultMaxWeek: number
}
export interface Employee {
  id: string
  storeId: string
  name: string
  contractId: string
  targetHours: number
  maxWeekHours: number
  wage: number
  quals: string[]
  /** Platz für ein eigenes Foto (Data-URL); ohne Foto werden Initialen gezeigt */
  photoUrl?: string
  phone: string
  email: string
  active: boolean
  under18: boolean
}
export type AvailKind = 'ganztags' | 'vormittags' | 'nachmittags' | 'nicht' | 'frei'
export interface Availability {
  empId: string
  date: string
  kind: AvailKind
  from?: number
  to?: number
}
export interface Absence {
  id: string
  empId: string
  from: string
  to: string
  type: 'Urlaub' | 'Abwesenheit' | 'Krank'
  note: string
}
export interface Shift {
  id: string
  storeId: string
  empId: string
  date: string
  start: number
  end: number
  locked: boolean
  why: string
  /** 'ausfall' = Person fällt aus (Schicht bleibt sichtbar, zählt aber nicht zur Besetzung) */
  status?: 'ausfall'
  calloutId?: string
}

export interface CalloutRequest { id: string; shiftId: string; empId: string; status: 'angefragt' | 'zugesagt' | 'abgesagt'; at: string; start?: number; end?: number }
/** Krankmeldung / Ausfall */
export interface Callout {
  id: string
  storeId: string
  empId: string
  /** Zeitpunkt der Meldung (ISO-Datum und Uhrzeit) */
  reportedAt: string
  via: 'mitarbeiter' | 'leitung'
  from: string
  to: string
  /** Krankschreibung (eAU): folgt / eingegangen / nicht nötig */
  eau: 'folgt' | 'eingegangen' | 'nicht-noetig'
  note: string
  shiftIds: string[]
  requests: CalloutRequest[]
  /** Ausfall-Schicht → Ersatz-Schicht */
  covered: Record<string, string>
  /** bewusst unbesetzt gelassen */
  left: string[]
}
export interface DatedValue {
  from: string
  value: number
}
export interface AgeRules {
  maxDayHours: number
  maxWeekHours: number
  restHours: number
  latestEnd: number
  /** Pause 30 min ab … Stunden, 60 min ab … Stunden */
  break30After: number
  break60After: number
}
export interface HrSettings {
  minWage: DatedValue[]
  minijobLimit: DatedValue[]
  contracts: ContractType[]
  maxDayHours: number
  restHours: number
  break30After: number
  break45After: number
  minShift: number
  maxShift: number
  under18: AgeRules
  semesterBreaks: { from: string; to: string }[]
}

export interface Company extends Party {
  taxNumber: string
  iban: string
  bic: string
  bankName: string
}
export interface Settings {
  greenUntil: number
  yellowUntil: number
  bufferDays: number
  targetDays: number
  shrink: Record<string, number>
  /** frei eingetragene Sondertage (Event …) */
  specialDays: Holiday[]
  schoolHolidays: SchoolHoliday[]
  locations: Record<string, { lat: number; lon: number }>
  company: Company
  invoiceNo: { prefix: string; next: number; pad: number }
  paymentDays: number
  toppingPrice: number
  hr: HrSettings
  /** Franchise-Gebühren in % vom Netto-Kassenumsatz (laut Franchisevertrag anpassen) */
  fees: { license: number; marketing: number }
  /** Richtwerte der Kostenquoten in % vom Umsatz (Platzhalter, im HQ änderbar) */
  costTargets: CostTargets
}
export interface CostTargets { staff: number; rent: number; goods: number; other: number }
/** Meldung eines Ladens an das HQ (Anfrage, Störung, Reklamation); Status und Notizen stehen in `cases` unter der Kennung `r-<id>` */
export interface HqReport { id: string; storeId: string; art: 'anfrage' | 'stoerung' | 'reklamation'; text: string; createdOn: string }
/** Monatszahlen, die ein Laden selbst meldet (Personalkosten gesamt, Miete, Monatsumsatz laut Kasse) – das HQ sieht nur Summen und Quoten */
export interface MonthlyReport { id: string; storeId: string; ym: string; staffCost: number; rent: number; revenue: number; reportedOn: string; /** Warenkosten (Einkauf inkl. Verpackung) */ goodsCost: number; /** Sonstige Nebenkosten (Strom, Wasser, Versicherung, Marketing …) */ otherCost: number; /** Werte aus der DATEV-Demo übernommen */ datev?: boolean }

/* ---------- HQ-Kommunikation ---------- */
/** Pinnwand-Nachricht des HQ; `to` leer = an alle Läden; `readBy`: Laden → Datum der Lesebestätigung */
export interface Post { id: string; title: string; text: string; important: boolean; createdOn: string; to: string[]; readBy: Record<string, string> }
export interface Campaign { id: string; title: string; text: string; from: string; to: string; articleIds: string[]; extraPct: number; social: string; /** eigene Aktion eines Ladens */ storeId?: string; price?: number }
export const KNOW_CATS = ['Portionsgrößen & Standards', 'Schulung für neue Mitarbeitende', 'Dokumente & Preislisten'] as const
export interface KnowEntry { id: string; category: (typeof KNOW_CATS)[number]; title: string; text: string; media: 'text' | 'video' | 'pdf' }

export interface Db {
  version: number
  seededOn: string
  startDate: string
  settings: Settings
  stores: Store[]
  articles: Article[]
  recipes: Recipe[]
  openingStock: Record<string, Record<string, number>>
  saleDays: SaleDay[]
  orders: Order[]
  centralOrders: CentralOrder[]
  deliveries: Delivery[]
  invoices: Invoice[]
  outflows: Outflow[]
  inventories: Inventory[]
  requests: HqRequest[]
  cases: CaseRec[]
  employees: Employee[]
  availability: Availability[]
  absences: Absence[]
  shifts: Shift[]
  callouts: Callout[]
  monthlyReports: MonthlyReport[]
  /** Meldungen, die ein Laden an das HQ sendet */
  reports: HqReport[]
  posts: Post[]
  campaigns: Campaign[]
  knowledge: KnowEntry[]
}
