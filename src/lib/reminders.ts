import { useSyncExternalStore } from 'react'

/** Erinnerungen: je Erinnerung ein Schalter und ein Kanal. Im echten System kommen sie per Push bzw. E-Mail; in der Demo erscheinen fällige über die Glocke. */
export type ReminderKey = 'inventory' | 'order' | 'delivery' | 'gap' | 'hq'
export type Channel = 'push' | 'email'
export interface ReminderCfg { on: boolean; channel: Channel }

export const REMINDERS: { key: ReminderKey; label: string; preview: string }[] = [
  { key: 'inventory', label: 'Monatsinventur fällig', preview: 'Die Monatsinventur ist offen – bitte zum Monatsende zählen.' },
  { key: 'order', label: 'Bis morgen bestellen', preview: 'Becher L bitte bis morgen bestellen, sonst wird es knapp.' },
  { key: 'delivery', label: 'Lieferung angekommen', preview: 'Eine Lieferung vom Headquarter ist da – bitte den Empfang bestätigen.' },
  { key: 'gap', label: 'Dienstplan-Lücke', preview: 'Am Samstag von 15 bis 19 Uhr fehlt eine Person im Dienstplan.' },
  { key: 'hq', label: 'Nachricht vom HQ', preview: 'Neue Nachricht vom HQ auf der Pinnwand – bitte mit „Gelesen“ bestätigen.' },
]

const KEY = 'fj-ww-reminders'
const defaults = (): Record<ReminderKey, ReminderCfg> => ({
  inventory: { on: true, channel: 'push' }, order: { on: true, channel: 'push' }, delivery: { on: true, channel: 'push' }, gap: { on: true, channel: 'push' }, hq: { on: true, channel: 'email' },
})
let state = defaults()
try {
  const raw = localStorage.getItem(KEY)
  if (raw) state = { ...state, ...JSON.parse(raw) }
} catch { /* ignorieren */ }
const ls = new Set<() => void>()
const emit = () => {
  state = { ...state }
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* ignorieren */ }
  ls.forEach((l) => l())
}
export const reminders = {
  get: () => state,
  isOn: (k: ReminderKey) => state[k]?.on !== false,
  set(k: ReminderKey, patch: Partial<ReminderCfg>) { state = { ...state, [k]: { ...state[k], ...patch } }; emit() },
  reset() { state = defaults(); emit() },
}
export const useReminders = () => useSyncExternalStore((l) => (ls.add(l), () => ls.delete(l)), () => state)
