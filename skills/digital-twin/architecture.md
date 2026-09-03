# 架构设计知识库

本文件不是“项目片段合集”，而是给数字员工直接产出架构方案用的知识库。

## 目录

- [一、适用场景](#一适用场景)
- [二、默认架构立场](#二默认架构立场)
- [三、输出架构方案时的固定结构](#三输出架构方案时的固定结构)
- [四、模块化标准](#四模块化标准)
- [五、业务域划分](#五业务域划分)
- [六、关键架构模式](#六关键架构模式)
- [七、风险触发器](#七风险触发器)
- [八、使用规则](#八使用规则)

## 一、适用场景

当用户需要以下内容时，优先使用本文件：

- 设计储能 / IoT / 云平台整体架构
- 拆分业务模块或业务域
- 设计多厂商设备接入架构
- 设计缓存、消息、限流、降级体系
- 讨论单体模块化与微服务取舍

如果问题只是代码级实现细节，应优先回到 `SKILL.md` 的总规则；如果问题已经进入部署拓扑和运维层面，应切换到 `deployment.md`。

## 二、默认架构立场

### 1. 默认推荐

- **单体模块化优先**，不是默认上微服务
- **事件驱动解耦** 跨业务域通信
- **幂等键 + 乐观重试** 保证关键指令一致性
- **关系型数据库优先**，时序数据用 TimescaleDB 扩展，不轻易引入新数据库
- **协议适配层 + 执行器层分离**，避免把品牌差异写进调度层
- **缓存、降级、限流是架构内建能力**，不是上线后补丁

### 2. 默认回答口径

给架构方案时，不要只讲“推荐用什么”，而要明确：

1. 模块怎么拆
2. 数据怎么流
3. 跨域怎么解耦
4. 一致性怎么保证
5. 哪些地方最容易出事故

## 三、输出架构方案时的固定结构

以后凡是输出架构方案，默认按以下结构组织：

1. **结论**：推荐什么架构，不推荐什么架构
2. **模块划分**：核心模块 / 公共模块 / 边界职责
3. **数据流**：设备 → 网关 → 云端 → 缓存 / 存储 → 推送 / API
4. **解耦与一致性**：事件驱动、幂等、重试、补偿
5. **风险与边界**：何时需要打破默认值
6. **验证方式**：上线前需要验证哪些链路

## 四、模块化标准

### 1. 公共库层

```text
ems-common (公共库层，按职责拆分)
├── ems-common-bom          # BOM 版本统一管理
├── ems-common-core         # 核心工具类
├── ems-common-web          # MVC + 全局异常
├── ems-common-mybatis      # ORM 扩展
├── ems-common-redis        # Redisson 封装
├── ems-common-satoken      # 认证授权
├── ems-common-security     # 加解密 + XSS 防护
├── ems-common-mqtt         # Spring Integration MQTT
├── ems-common-websocket    # Undertow WebSocket
├── ems-common-job          # SnailJob 封装
├── ems-common-oss          # AWS S3 / MinIO
├── ems-common-drools       # 规则引擎
├── ems-common-event        # 事件驱动
├── ems-common-idempotent   # 幂等性控制
├── ems-common-mail         # 邮件
└── ems-common-sms          # 短信（Sms4j）
```

> 这是**模块化单体公共库的推荐拆分模板**，不是某个固定仓库的清单——按项目实际需要的公共能力增删，原则是「一个职责一个库」。

### 2. 业务层

```text
ems-modules (业务层)
├── ems-iot                 # IoT 设备接入
├── ems-system              # 系统管理
├── ems-charge              # 充放电管理
└── ems-user                # 用户管理
```

### 3. 使用原则

- 公共能力沉到 `ems-common-*`
- 业务语义留在 `ems-modules`
- 任何“只在一个模块里顺手实现”的公共能力，都要警惕后续复用成本

## 五、业务域划分

### 储能 EMS 典型 8 大业务域（DDD 设计）

1. **M1 IoT Hub** —— 设备接入与遥测（6 品牌协议，动态解析器，Asset Shadow）
2. **M2 Optimization** —— 策略引擎与排程（SoC 感知调度，市场信号响应）
3. **M3 DR Dispatcher** —— 调度指令执行（抽象指令 → 品牌协议转换，幂等键追溯）
4. **M4 Market & Billing** —— 电力市场与结算（收益计算）
5. **M5 BFF** —— 前端聚合 API
6. **M6 Identity** —— 认证与多租户
7. **M7 Open API** —— 外部集成网关
8. **M8 Admin Control** —— 全局控制面

### 划分原则

- 调度、结算、接入、身份不要揉在一个模块里
- 跨域协作优先事件，不优先同步强耦合调用
- BFF 单独存在，避免前端把多个后端耦死

## 六、关键架构模式

### 1. 多厂商设备接入：Actuator 模式

```text
AbstractActuator (抽象执行器)
└── 每个品牌一个子类，命名 = 品牌 + 动作（如 <品牌>StartVppActuator / <品牌>SettingActuator）
   ├── 区域级 VPP 启停：拆 Start / Stop 两个动作
   ├── 按设备 SN 下发差异化参数（如各 SN 不同放电曲线）
   └── 加密认证品牌单独封装认证逻辑
```

> 子类命名与数量随接入品牌而定，调度层只认 `AbstractActuator`，不认具体品牌。各品牌的认证/语义差异见厂商对接能力库 vendors。

扩展新品牌时：

1. 继承 `AbstractActuator`
2. 只实现品牌协议转换
3. 不改调度层

### 2. 协议适配器统一抽象

```java
AbstractProtocolAdapter
├── executeAsync() → CompletableFuture
├── ensureConnected()
└── 实现: HTTP / MQTT / ModbusTCP / CoAP / WebSocket / OpcUa / AMQP / SparkplugB / LwM2M / CustomTCP

private static Executor getDefaultExecutor() {
    try { return Executors.newVirtualThreadPerTaskExecutor(); }
    catch (Exception e) { return Runnable::run; }
}
```

默认原则：

- JDK 21 能用虚拟线程就用虚拟线程
- JDK 17 自动降级，不强依赖新特性
- 连接保活和协议差异封在 Adapter 层，不上浮到业务层

### 3. 三层缓存策略（IoT 平台）

```text
查询顺序:
1. Redis（TTL 5 分钟，随机偏移防雪崩）
2. TimescaleDB 最新记录
3. 厂商 API 实时调用

防护: 分布式锁防击穿 / 空值缓存防穿透 / 随机 TTL 防雪崩
预热: warmUpCache(brand, deviceSnList)
批量: 分片处理，每片独立事务
```

### 4. RabbitMQ 消息架构（事件驱动）

```text
Topic Exchange: device.events
├── data_update      → device.data
├── status_change    → device.status
├── alarm_trigger    → device.alarm
├── command_result   → device.command
└── 失败消息         → DLX: device.dlx → device.dlq

配置: Jackson2Json 序列化, LocalDateTime 格式化, 信任所有包
并发: 1-5 消费者, 预取 10 条, 发布确认 + 返回确认
```

### 5. 限流降级双层防护

```text
第一层 Sentinel（单机）:
  QPS 阈值 100, 热点参数限流
  FlowException → 429, DegradeException → 503, AuthorityException → 403

第二层 Resilience4j（跨服务）:
  熔断: 50% 失败率触发 → 30s 恢复 → 半开放 3 次探测
  重试: 最多 3 次, 间隔 1 秒
  慢调用: 2 秒判定
```

### 6. IoT 全链路数据流

```text
设备层（Modbus RTU / RS485）
  → 网关层（MQTT 上报到 EMQX / Mosquitto）
    → 云端（BMSDataListener → BMSDataProcessService → 数据存储）
      → 缓存层（Redis 三层缓存 → TimescaleDB 7 天 chunk）
        → 推送层（WebSocket 按主题推送，脏数据过滤）
          → 前端（ECharts 可视化 / Element Plus 表格）
            → 移动端（BLE / WiFi 直连控制）
```

### 7. 设计模式清单

| 模式 | 应用场景 |
|---|---|
| 适配器模式 | 10 种协议统一抽象 |
| 策略模式 | 多品牌 Actuator 选择 |
| 事件驱动 | 跨业务域解耦通信 |
| 幂等键 + 乐观重试 | 指令下发可靠性 |
| 引用计数 | 前端 MQTT 订阅管理 |
| 单例模式 | 移动端 BLE / 网络管理器 |

## 七、风险触发器

遇到以下情况时，必须主动提醒风险：

1. 用户一上来就要微服务拆分，但没有明确团队规模和发布需求
2. 调度层开始知道品牌 API 细节，说明抽象层泄漏
3. 设备接入和业务规则混在同一层，后续扩品牌会失控
4. 只设计主链路，不设计缓存、降级、死信、补偿
5. 想直接依赖外部 API 实时调用，不做本地缓存与 fallback

## 八、使用规则

### 1. 什么时候直接用本文件回答

- 用户问“这个系统怎么拆”
- 用户问“多品牌设备怎么接入更稳”
- 用户问“缓存 / MQ / 限流 / 降级怎么设计”
- 用户问“为什么不建议一开始上微服务”

### 2. 什么时候只把本文件作为依据

- 问题偏部署：切到 `deployment.md`
- 问题偏具体事故排查：切到 `lessons.md`
- 问题偏厂商 API：切到 `vendors.md`

### 3. 输出时禁止做的事

- 只堆名词，不落到模块和链路
- 用通用架构八股替代真实模式
- 隐去边界条件，导致默认值被误用
