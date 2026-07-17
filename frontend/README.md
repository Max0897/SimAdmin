# SimAdmin 前端管理平台

基于 Vue 3、JavaScript、Vite 和 Naive UI 的设备管理单页应用。

## 开发

```bash
yarn install
yarn dev
```

开发服务器默认运行在 `http://127.0.0.1:5173`，并将 `/api` 请求代理到设备后端。

## 构建

```bash
yarn lint
yarn build
```

构建产物输出到 `frontend/dist/`，设备部署时复制到 `/opt/simadmin/www/`。

## 项目结构

```text
src/
├── api/          # Fetch API 客户端
├── components/   # 布局和公共组件
├── composables/  # 轮询等组合式逻辑
├── pages/        # 业务页面
├── router/       # Vue Router 路由和鉴权
├── stores/       # Pinia 应用状态
├── utils/        # 格式化工具
├── App.vue       # Naive UI 全局配置
└── main.js       # 应用入口
```

## 技术栈

- Vue 3（Composition API，JavaScript）
- Vite 8
- Vue Router 5
- Pinia 4
- Naive UI 2
- Lucide Vue
- ECharts 6 / Vue ECharts
- ESLint 10 / eslint-plugin-vue
