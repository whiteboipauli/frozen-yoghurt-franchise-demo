import { addDays, weekdayIdx } from '../lib/date'

/** Montag der Woche, in der `date` liegt */
export const weekStart = (date: string) => addDays(date, -weekdayIdx(date))
