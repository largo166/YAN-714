# Prompt Daily · 建筑生图复盘系统

独立子站，用于记录每日建筑生图、识别核心问题、生成结构化优化 Prompt，并归档有效的 Prompt / Negative Prompt。

## 访问路径

GitHub Pages 部署后：`/YAN-714/prompt-lab/`

## 当前功能

- 新建每日复盘：项目、模型、风格、原始提示词、问题标签、复盘判断
- 自动生成优化 Prompt、Negative Prompt 和本轮调整策略
- 原图/调整后图记录，构图、材质、氛围、文化四维评分
- 按项目、问题、风格和归档状态检索
- 收藏与一键复制 Prompt
- 浏览器本地保存，支持 JSON 导入与导出

## 源码包

CI 使用四段 Base64 源码包。解包命令：

```bash
mkdir -p prompt-lab-src
cat prompt-lab/source.part*.b64 | base64 --decode | tar -xz -C prompt-lab-src
cd prompt-lab-src
npm install
npm run dev
```

源码技术栈：React + Vite + Tailwind CSS + TypeScript。
