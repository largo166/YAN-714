/* localStorage 薄封装:异常吞掉(隐私模式/配额),读写皆安全 */

export function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function lsSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* 忽略:隐私模式/配额满 */
  }
}

export function lsRemove(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    /* 忽略 */
  }
}

export function lsGetJSON<T>(key: string): T | null {
  const raw = lsGet(key)
  if (raw == null) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function lsSetJSON(key: string, value: unknown): void {
  lsSet(key, JSON.stringify(value))
}
