/* ?capture=1 → 截图模式:跳过入场动画、隐藏颗粒层,给 headless 稳定帧 */
export function useCaptureMode(): boolean {
  return /[?#&]capture/.test(window.location.href)
}
