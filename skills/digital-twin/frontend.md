# 前端工程化知识库

本文件用于让数字员工直接输出前端选型、实时交互、桌面端、大屏和移动端方案，而不是只罗列用过哪些技术。

## 目录

- [一、适用场景](#一适用场景)
- [二、默认前端分流规则](#二默认前端分流规则)
- [三、输出前端方案时的固定结构](#三输出前端方案时的固定结构)
- [四、Vue 3 工程化标准](#四vue-3-工程化标准)
- [五、React 工程化标准](#五react-工程化标准)
- [六、实时与可视化模式](#六实时与可视化模式)
- [七、移动端经验](#七移动端经验)
- [八、风险触发器](#八风险触发器)

## 一、适用场景

当用户需要以下内容时，优先使用本文件：

- 管理后台前端选型
- 复杂前端应用或 Electron 桌面端方案
- MQTT / WebSocket 实时数据前端接入
- 大屏展示方案
- 设备控制类移动端经验参考

## 二、默认前端分流规则

### 1. 默认推荐

- **管理后台**：Vue 3 + Element Plus + Pinia + Vite + TypeScript 严格模式
- **复杂应用 / 桌面端**：React 18 + Ant Design Pro + UmiJS
- **极致轻量大屏**：纯 HTML5 + CSS3 + 原生 ES6
- **设备直连移动端**：iOS 原生 + Android 原生

### 2. 分流原则

- 中文生态、团队上手速度、后台组件完整性优先时，选 Vue
- 需要 Electron、高度定制化布局、复杂工程体系时，选 React
- 只是展示型大屏且首屏速度敏感时，不一定需要框架
- 涉及 BLE / WiFi 设备直连时，不建议硬塞到 Web 方案里

## 三、输出前端方案时的固定结构

1. **结论**：推荐什么前端栈
2. **理由**：为什么适合当前业务
3. **状态管理 / 构建 / 测试**：最小必要工程化配置
4. **实时链路**：MQTT / WebSocket 如何管理连接与订阅
5. **风险与边界**：什么时候不该用默认方案
6. **下一步**：如何落地与验证

## 四、Vue 3 工程化标准

### 1. 技术栈

Vue 3 + Element Plus + Pinia + Vite + TypeScript 严格模式

### 2. Pinia 状态管理（Composition API 风格）

```typescript
export const useDeviceStore = defineStore('device', () => {
  const list = ref<DeviceInfo[]>([])
  const loading = ref(false)

  async function fetchList() {
    loading.value = true
    try {
      list.value = (await getDeviceList(queryParams)).list
    } finally {
      loading.value = false
    }
  }

  return { list, loading, fetchList }
})
```

### 3. Vite 构建优化

```typescript
manualChunks: {
  'vue-vendor': ['vue', 'vue-router', 'pinia'],
  'element-plus': ['element-plus', '@element-plus/icons-vue'],
  'echarts': ['echarts'],
  'utils': ['axios', 'dayjs', 'vue-i18n']
}

AutoImport({ imports: ['vue', 'vue-router', 'pinia'] })
Components({ resolvers: [ElementPlusResolver({ importStyle: 'css' })] })
```

### 4. 测试与国际化

- 测试：Vitest + `@vue/test-utils` + happy-dom
- 脚本：`test` / `test:run` / `test:coverage`
- 国际化：`vue-i18n` Composition API（`legacy: false`）
- Element Plus 国际化与应用语言同步切换
- localStorage 持久化语言偏好

## 五、React 工程化标准

### 1. 技术栈

React 18 + Ant Design Pro + UmiJS + DVA

### 2. 适用场景

- 需要 Electron 桌面端
- 页面布局和导航体系高度定制
- 需要在成熟 React 体系里快速扩展复杂应用

### 3. 定制化能力

- 能对 ProLayout 做深度定制（菜单、头部栏可大幅重写）—— 自定义 `AppMenu` + `AppHeaderBar`
- Tailwind CSS 补充样式
- ECharts 数据可视化

### 4. Electron 桌面端

- 主进程 `electron/main.js` 加载 dev server 或 dist
- `npm run electron:server` 并发启动 Vite + Electron
- `wait-on tcp:8000` 等待 dev server 就绪

### 5. 多环境

- 环境变量：`UMI_ENV=dev`, `REACT_APP_ENV=test`
- 部署目标：cloud-test / cloud-pro / local-pro

## 六、实时与可视化模式

### 1. MQTT 前端集成（引用计数模式）

```typescript
const subscriptions = new Map<string, Set<Function>>()
let refCount = 0

function subscribe(topic: string, callback: Function) {
  if (!subscriptions.has(topic)) subscriptions.set(topic, new Set())
  subscriptions.get(topic)!.add(callback)
  client.subscribe(topic)
  refCount++
}

function unsubscribe(topic: string, callback: Function) {
  subscriptions.get(topic)?.delete(callback)
  if (--refCount === 0) client.end()
}

client.on('connect', () => {
  for (const topic of subscriptions.keys()) client.subscribe(topic)
})
```

### 2. 连接配置

```typescript
mqtt.connect('ws://broker:8083/mqtt', {
  clientId: `bms-admin-${randomId}`,
  reconnectPeriod: 3000,
  connectTimeout: 10000,
})
```

默认原则：

- 前端实时连接必须可自动恢复
- 订阅管理必须可回收，避免组件销毁后幽灵订阅
- 客户端 ID 必须随机，避免互踢

### 3. VPP 调度大屏

- 纯 HTML5 + CSS3 + 原生 ES6（无框架，轻量加载）
- 磨砂玻璃：`backdrop-filter: blur()`
- Chart.js 可视化：电价趋势 / 能耗分析 / 设备分布
- 响应式断点：1024px / 768px / 480px
- 业务内容：实时电价、套利策略切换（保守 / 平衡 / 激进）、电池在自用与 VPP 调度间的分配（比例可配）

## 七、移动端经验

### 1. iOS（Swift）

- 单例 BLE 管理器（`ALWBluetoothManager.sharedInstance`）
- 委托模式处理连接 / 发现事件
- CocoaPods：Alamofire + SnapKit + SwiftyJSON + CocoaAsyncSocket
- `isIdleTimerDisabled = true` 防止控制时熄屏

### 2. Android（Kotlin / Java）

- 多模块：base / host / device / bluetooth / wifi / common
- Gradle 构建

### 3. 共同设计

- UDP 广播发现局域网设备（`ALWUdpManager`）
- 蓝牙 + WiFi 双通道设备控制
- iOS 13+ BLE 扫描需要位置权限

## 八、风险触发器

遇到以下情况时，必须主动提醒风险：

1. 想在重实时页面里让每个组件各自创建 MQTT 连接
2. 需要桌面端却还坚持纯 Web 思路
3. 管理后台项目上来就选 React，但没有现成 React 基础
4. 大屏只是展示用途，却上复杂框架导致加载变慢
5. 移动端直连设备场景，用 H5 方案硬扛 BLE / WiFi 控制
