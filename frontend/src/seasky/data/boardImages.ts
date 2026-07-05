/* 板块背景图集中配置(任务书 §七):路径只在这里;null=该板块有意不用照片
   b2(营地)=截图3纯净基准无照片;b4(驾驶舱)=数据纯度无照片——沿袭母版 board-images JSON 的判断 */

export interface BoardImage {
  src: string
  caption: string | null
}

export const boardImages: Record<'project' | 'data' | 'agent' | 'hub' | 'cockpit', BoardImage | null> = {
  project: { src: '/seasky/bg-project.jpg', caption: '入口大堂 · CCD 住宅辑占位图,可替换为本项目效果图' },
  data: { src: '/seasky/bg-data.jpg', caption: null },
  agent: null,
  hub: { src: '/seasky/bg-hub.jpg', caption: null },
  cockpit: null,
}
