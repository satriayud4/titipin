export const todayWIB = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }) // YYYY-MM-DD

export function addDays(date: string, delta: number) {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

export const monthStart = (date: string) => `${date.slice(0, 7)}-01`

export function prevMonth(date: string) {
  const last = addDays(monthStart(date), -1)
  return { from: monthStart(last), to: last }
}

export const shortDay = (d: string) => `${d.slice(8)}/${d.slice(5, 7)}`