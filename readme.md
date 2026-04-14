# YiShe Extensions

YiShe 浏览器插件现已切换到 `WXT + Vue 3 + Element Plus` 工程体系。

这次重构已经完成到“全量迁入 WXT 工程”的状态：

- 页面入口改为 `WXT entrypoints`
- UI 栈改为 `Vue 3 + Element Plus`
- 构建产物改为 WXT 输出的 `.output/chrome-mv3`
- `background / content / api / config` 已迁入 `src/`
- `public/` 仅保留真正需要的静态资源

## 当前结构

```text
yishe-extensions/
├─ public/
│  └─ assets/                    # 图标等静态资源
├─ src/
│  ├─ background/                # WXT 后台模块
│  ├─ components/                # Vue 复用组件
│  ├─ composables/               # 登录态、消息、连接状态等复用逻辑
│  ├─ content/                   # WXT content script 模块与样式
│  ├─ entrypoints/
│  │  ├─ background.ts           # 后台入口
│  │  ├─ content.ts              # content script 入口
│  │  ├─ popup/                  # 插件 popup 页面
│  │  ├─ login/                  # 登录页（unlisted page）
│  │  └─ control/                # 控制台页（unlisted page）
│  ├─ shared/                    # API、配置、扩展通信、格式化等共享模块
│  └─ styles/                    # 全局样式和主题变量
├─ scripts/
│  ├─ sync-version.js            # 校验 package.json 版本
│  └─ build-release.js           # 基于 WXT 产物生成发布目录
├─ package.json
├─ tsconfig.json
└─ wxt.config.ts
```

## 技术栈

- `WXT`
- `Vue 3`
- `Element Plus`
- `TypeScript`

## 开发命令

```bash
npm install
npm run dev
```

WXT 本地开发会接管页面入口与 manifest 生成。

## 构建命令

```bash
npm run build
```

构建结果位于：

```text
.output/chrome-mv3/
```

把这个目录作为“已解压扩展程序”加载即可。

## 发布目录

```bash
npm run build:release
```

执行后会生成：

```text
dist/yishe-extensions-v{version}/
```

## 当前状态

- `popup / login / control` 已全部迁入 Vue 页面
- `background` 已迁为 WXT `background` entrypoint
- `content` 已迁为 WXT `content-script` entrypoint
- 原有 `public/background`、`public/content`、`public/utils`、`public/config` 已移除
- 仓库已不再保留旧版运行时目录，只维护 WXT 新结构
- 最终扩展包只包含 WXT 构建产物与静态资源

## 注意事项

- 扩展版本号以 `package.json` 为准，WXT 会据此生成 manifest。
- `src/entrypoints/background.ts` 与 `src/entrypoints/content.ts` 是扩展运行时入口。
- 如果继续迭代后台或 content 能力，应直接修改 `src/background` 与 `src/content`。
