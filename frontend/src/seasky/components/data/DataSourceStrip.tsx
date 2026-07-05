import { boardImages } from '../../data/boardImages'

/** 底部静谧图带(母版 .strip):低透明度+上缘渐隐,配角不抢主角 */
export function DataSourceStrip() {
  const img = boardImages.data
  if (!img) return null
  return (
    <figure className="pointer-events-none absolute bottom-0 left-0 right-0 m-0 h-[104px]">
      <img
        src={img.src}
        alt=""
        className="h-full w-full object-cover opacity-50"
        style={{ maskImage: 'linear-gradient(180deg, transparent, #000 55%)', WebkitMaskImage: 'linear-gradient(180deg, transparent, #000 55%)' }}
      />
    </figure>
  )
}
