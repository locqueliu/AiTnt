# AiTnt

AiTnt 是一个本地桌面 AI 创意工作站，把图像生成、视频生成、资源库、节点画布和场景应用整合到同一个应用里，方便围绕同一套本地工作区持续创作。

## 当前功能

- 图像工作站：支持文生图、图生图与本地输出管理
- 视频工作站：支持文生视频、图生视频、任务轮询与导出
- 资源库：管理提示词、模板和可复用创作资产
- 节点画布：支持工作流导入、导出和自定义节点扫描
- 应用中心：提供商品图、风格化等高频场景应用
- 设置中心：统一管理供应商、模型、目录、语言和工作区配置

## 技术栈

- Electron
- React
- TypeScript
- Vite
- Zustand
- XYFlow
- dnd-kit

## 本地开发

### 安装依赖

```bash
npm install
```

### 启动开发环境

```bash
npm run dev
```

### 生产构建

```bash
npm run build
```

构建完成后：

- 前端产物位于 `dist/`
- Electron 打包产物位于 `dist-electron/`

## 发布说明

项目内置了 GitHub Actions 发布流程：

- 推送 `v*` 格式标签后，会自动触发 Windows 构建
- 构建产物会作为 GitHub Release 附件上传

工作流文件位置：

- `.github/workflows/release.yml`

## 项目信息

- 软件名称：AiTnt
- 作者：XiaoYu
- 默认语言：中文
- 仓库地址：未配置
