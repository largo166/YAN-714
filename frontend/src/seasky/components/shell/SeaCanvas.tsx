import { useEffect, useRef } from 'react'

import { boost, energy, horizonY, order, sweep, waveSlots } from '../../lib/seaUniforms'

/* ═══ 抖动流体海面(母版 WebGL shader 1:1 迁移) ═══
   uniforms 每帧从 seaUniforms 单例读取——GSAP 在外部 tween 这些对象,画布只读。 */

const VS = `attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}`

const FS = `
precision highp float;
uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_pointer;
uniform float u_boost;
uniform float u_order;
uniform float u_energy;
uniform float u_hy;
uniform vec4 u_w1;
uniform vec4 u_w2;
uniform vec2 u_sweep;
uniform float u_cell;

float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){
  vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),
             mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);
}
float fbm(vec2 p){
  float v=0.,a=.5;
  for(int i=0;i<4;i++){v+=a*noise(p);p*=2.03;a*=.5;}
  return v;
}
float bayer2(vec2 a){a=floor(a);return fract(a.x/2.+a.y*a.y*.75);}
float bayer4(vec2 a){return bayer2(.5*a)*.25+bayer2(a);}
float bayer8(vec2 a){return bayer4(.5*a)*.25+bayer2(a);}

float ring(vec4 w, vec2 st){
  if(w.w<=0.001) return 0.;
  vec2 p=vec2(st.x*1.7778,st.y);
  vec2 c=vec2(w.x*1.7778,w.y);
  float d=distance(p,c);
  return exp(-pow((d-w.z)*20.0,2.0))*w.w;
}

void main(){
  float cell=u_cell;
  vec2 pc=floor(gl_FragCoord.xy/cell);
  vec2 st=(pc*cell)/u_resolution;
  vec2 uv=st;
  uv.x*=u_resolution.x/u_resolution.y;

  float speed=mix(0.060,0.018,u_order)*(0.50+1.15*u_energy);
  float t=u_time*speed;
  vec2 drift=u_pointer*0.16*(1.0-u_order*0.5);

  float warpAmp=mix(1.9,0.35,u_order)*(0.45+1.15*u_energy);
  vec2 q=vec2(fbm(uv*2.2+vec2(t,-t*.7)),fbm(uv*2.2+vec2(-t*.6,t*.9)));

  float fx=mix(2.8,1.1,u_order);
  float fy=mix(2.8,6.8,u_order);
  vec2 su=vec2(uv.x*fx+t*mix(0.0,2.4,u_order), uv.y*fy);
  vec2 r=vec2(fbm(su*0.9+q*warpAmp+vec2(-t*1.3,t*1.1)),
              fbm(su*0.9+q*warpAmp+vec2(t*1.2,-t*0.8)));
  float f=fbm(su+q*warpAmp+r*warpAmp*0.85*(1.0-u_order)+drift);
  f+=(noise(vec2(uv.x*0.9+t*1.6, uv.y*24.0))-0.5)*0.22*u_order;
  f=pow(max(f,0.0),1.5);

  float vig=smoothstep(1.25,0.18,distance(st,vec2(0.66,0.44)));
  float gravity=mix(1.0, 0.55+0.9*(1.0-st.y), u_order*0.85);
  float v=f*vig*gravity;
  float sw=sin(uv.y*2.6-t*2.4+q.x*2.0)*0.5+0.5;
  v+=pow(sw,2.2)*f*0.30*(1.0-u_order)*u_energy;
  v+=smoothstep(0.70,0.95,f)*0.40*(1.0-u_order)*u_energy;
  float hy=u_hy;
  float seaMask=smoothstep(hy+0.12,hy-0.05,st.y);
  v*=mix(0.05,1.0,seaMask);
  v+=exp(-pow(max(st.y-hy,0.0)/0.085,2.0))*0.10*(0.4+0.6*u_energy);
  v+=exp(-pow((st.y-hy)*70.0,2.0))*(0.10+0.10*u_energy+0.30*u_boost);
  v=v*(0.82+0.36*u_energy)*(1.0+u_boost*1.1)+u_boost*0.10;

  v+=exp(-pow((fract(u_time*0.045)*1.5-0.25-st.y)*16.0,2.0))*0.09*u_order;
  v+=ring(u_w1,st)+ring(u_w2,st);
  v+=exp(-pow((st.x-u_sweep.x)*9.0,2.0))*u_sweep.y*vig;

  v=clamp(v,0.,1.);
  float d=bayer8(pc);
  float qv=clamp(floor(v*8.0+d)/8.0,0.,1.);

  vec3 c0=vec3(0.039,0.047,0.055);
  vec3 c1=vec3(0.071,0.133,0.196);
  vec3 c2=vec3(0.141,0.278,0.400);
  vec3 c3=vec3(0.278,0.478,0.612);
  vec3 c4=vec3(0.478,0.655,0.769);
  vec3 c5=vec3(0.843,0.898,0.925);
  vec3 col;
  if(qv<0.22)      col=mix(c0,c1,qv/0.22);
  else if(qv<0.45) col=mix(c1,c2,(qv-0.22)/0.23);
  else if(qv<0.68) col=mix(c2,c3,(qv-0.45)/0.23);
  else if(qv<0.90) col=mix(c3,c4,(qv-0.68)/0.22);
  else             col=mix(c4,c5,(qv-0.90)/0.10);
  gl_FragColor=vec4(col,1.0);
}`

export function SeaCanvas() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const cv = ref.current
    if (!cv) return
    const gl = cv.getContext('webgl')
    if (!gl) return

    function compile(type: number, src: string) {
      const s = gl!.createShader(type)!
      gl!.shaderSource(s, src)
      gl!.compileShader(s)
      return s
    }
    const prog = gl.createProgram()!
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS))
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS))
    gl.linkProgram(prog)
    gl.useProgram(prog)

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'a')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

    const U: Record<string, WebGLUniformLocation | null> = {}
    ;['u_resolution', 'u_time', 'u_pointer', 'u_boost', 'u_order', 'u_energy', 'u_hy', 'u_w1', 'u_w2', 'u_sweep', 'u_cell'].forEach(
      (n) => (U[n] = gl.getUniformLocation(prog, n)),
    )

    /* 尺寸三值一致——母版 <canvas width height> 属性先于 getContext 生效的工程化等价:
       buffer=舞台内显示尺寸×DPR,gl.viewport 与 u_resolution 必须同步跟随(WebGL 改尺寸不会自动更新 viewport);
       u_cell=4×DPR 保持母版抖动颗粒的视觉密度(DPR=1 时与母版逐像素一致)。DPR 上限 2,防超高分屏 fbm 过载。 */
    function resize() {
      const dpr = Math.min(devicePixelRatio || 1, 2)
      const w = Math.max(1, Math.round(cv!.clientWidth * dpr))
      const h = Math.max(1, Math.round(cv!.clientHeight * dpr))
      if (cv!.width !== w || cv!.height !== h) {
        cv!.width = w
        cv!.height = h
      }
      gl!.viewport(0, 0, w, h)
      gl!.uniform2f(U.u_resolution, w, h)
      gl!.uniform1f(U.u_cell, 4 * dpr)
    }
    resize()
    addEventListener('resize', resize)

    const ptr = { x: 0, y: 0 }
    const cur = { x: 0, y: 0 }
    const onMove = (e: PointerEvent) => {
      ptr.x = e.clientX / innerWidth - 0.5
      ptr.y = e.clientY / innerHeight - 0.5
    }
    addEventListener('pointermove', onMove)

    let raf = 0
    function frame(t: number) {
      /* 每帧兜底:挂载序上 useFluidStage 的 fit() 晚于本 effect,舞台改尺寸不触发 window resize */
      resize()
      cur.x += (ptr.x - cur.x) * 0.03
      cur.y += (ptr.y - cur.y) * 0.03
      const now = performance.now() * 0.001
      gl!.uniform1f(U.u_time, t * 0.001)
      gl!.uniform2f(U.u_pointer, cur.x, cur.y)
      gl!.uniform1f(U.u_boost, boost.v)
      gl!.uniform1f(U.u_order, order.v)
      gl!.uniform1f(U.u_energy, energy.v)
      gl!.uniform1f(U.u_hy, horizonY.v)
      waveSlots.forEach((w, i) => {
        const e = now - w.t0
        const r = e * 0.5
        const a = w.a0 * Math.max(0, 1 - e / 1.1)
        gl!.uniform4f(i === 0 ? U.u_w1 : U.u_w2, w.x, w.y, r, a)
      })
      gl!.uniform2f(U.u_sweep, sweep.x, sweep.amp)
      gl!.drawArrays(gl!.TRIANGLES, 0, 3)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      removeEventListener('pointermove', onMove)
      removeEventListener('resize', resize)
    }
  }, [])

  /* w-full h-full 必须显式给:canvas 是替换元素,absolute inset-0 不拉伸只定位,
     没有显式 CSS 尺寸时布局尺寸=buffer 固有尺寸,会随 buffer 缩成小块 */
  return <canvas ref={ref} className="pointer-events-none absolute inset-0 z-0 h-full w-full opacity-90" />
}
