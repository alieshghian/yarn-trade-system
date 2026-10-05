import { api } from './api'

export function incrementSerial(last: string | undefined, fallback: string) {
  if (!last?.trim()) return fallback
  const value = last.trim(), match = value.match(/(\d+)$/)
  if (!match || match.index === undefined) return `${value}-0001`
  return value.slice(0, match.index) + String(Number(match[1]) + 1).padStart(match[1].length, '0')
}

export async function suggestSerial(scope: string, demoMode: boolean, last: string | undefined, fallback: string) {
  if (demoMode) return incrementSerial(last, fallback)
  return (await api<{ suggestion: string }>(`/api/sequence-suggestions/${scope}`)).suggestion
}
