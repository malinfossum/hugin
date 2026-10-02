/** Fixed dd.MM.yyyy in the machine's local time — the same date string in NO and EN
 * (spec v3.1 item 6: consistency over locale-linked formats). */
const pad = (n: number) => String(n).padStart(2, '0')

export function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return `${formatDate(iso)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
