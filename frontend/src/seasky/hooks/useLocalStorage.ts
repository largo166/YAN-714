import { useCallback, useState } from 'react'

import { lsGet, lsSet } from '../lib/storage'

/** localStorage 同步 state:初值惰性读,set 时写穿 */
export function useLocalStorage(key: string, initial: string): [string, (v: string) => void] {
  const [value, setValue] = useState<string>(() => lsGet(key) ?? initial)
  const set = useCallback(
    (v: string) => {
      setValue(v)
      lsSet(key, v)
    },
    [key],
  )
  return [value, set]
}
