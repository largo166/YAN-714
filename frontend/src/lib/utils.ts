import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** shadcn 约定的类合并器:clsx 组装 + tailwind-merge 去冲突(后写的工具类赢)。 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
