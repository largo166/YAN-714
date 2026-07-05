import { gsap } from 'gsap'
import { CustomEase } from 'gsap/CustomEase'

/* GSAP 全局注册(副作用模块,main.tsx 最先 import):
   premium/premiumOut 是海天语言的签名缓动,全部编排共用 */
gsap.registerPlugin(CustomEase)
CustomEase.create('premium', 'M0,0 C0.4,0 0.2,1 1,1')
CustomEase.create('premiumOut', 'M0,0 C0.6,0 0.8,0.4 1,1')

export { gsap }
