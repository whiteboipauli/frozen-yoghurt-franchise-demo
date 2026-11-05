import { CARRIERS } from '../data/types'

/** Plausible (fiktive) Sendungsnummer je Versanddienstleister */
export function makeTracking(carrier: string, seed: string): string {
  let h = 17
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const digits = (n: number) => { let s = ''; let x = h; for (let i = 0; i < n; i++) { x = (Math.imul(x, 1103515245) + 12345) >>> 0; s += String(x % 10) } return s }
  switch (carrier) {
    case 'DHL': return `0034${digits(8)}`
    case 'DPD': return `0${digits(13)}`
    case 'UPS': return `1Z${digits(3)}A${digits(2)}${digits(8)}`.replace(/(\d)\1{5,}/g, '$1')
    case 'GLS': return digits(11)
    case 'Spedition': return `SP-${digits(7)}`
    default: return `EL-${digits(6)}`
  }
}
export const carrierFor = (seed: string): (typeof CARRIERS)[number] => {
  let h = 5
  for (const ch of seed) h = (h * 33 + ch.charCodeAt(0)) >>> 0
  return CARRIERS[h % 5]
}
