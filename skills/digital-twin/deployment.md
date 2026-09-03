# 部署运维知识库

本文件用于让数字员工直接产出生产部署、故障转移、运维检查与上线建议，而不是停留在“我做过哪些部署”的罗列。

## 目录

- [一、适用场景](#一适用场景)
- [二、默认运维立场](#二默认运维立场)
- [三、输出部署方案时的固定结构](#三输出部署方案时的固定结构)
- [四、生产部署拓扑](#四生产部署拓扑)
- [五、关键配置与演进](#五关键配置与演进)
- [六、验证与巡检清单](#六验证与巡检清单)
- [七、风险触发器](#七风险触发器)

## 一、适用场景

当用户需要以下内容时，优先使用本文件：

- 设计生产部署拓扑
- 讨论主备、高可用、故障转移
- 讨论 JVM、Docker、日志、数据库连接池配置
- 输出上线前检查项或运维巡检项
- 讨论迁移管理、CI/CD、安全合规

## 二、默认运维立场

### 1. 默认推荐

- **LTS 优先**：Java 17 / 21、稳定基础镜像、稳定中间件版本
- **单机性能优先**：单机场景优先 `host` 网络，避免无意义 NAT 开销
- **健康检查是必需项**：应用、Nginx、数据库、缓存都要能被探活
- **日志分层隔离**：全量、错误、SQL 分开
- **故障转移要可判定、可恢复、防脑裂**
- **数据库不可用时尽量不阻塞应用冷启动**

### 2. 默认回答方式

输出部署方案时，必须明确：

1. 拓扑是什么
2. 哪些服务必须同机、哪些可以拆开
3. 健康检查与故障切换如何触发
4. 关键 JVM / Compose / 日志 / 数据库参数
5. 上线后怎么验证和观测

## 三、输出部署方案时的固定结构

1. **结论**：推荐什么部署形态，适合什么规模
2. **拓扑**：节点、容器、主备关系、网络模式
3. **关键配置**：JVM、Compose、日志、连接池、迁移工具
4. **故障转移与恢复**：健康检查、阈值、防脑裂、告警
5. **风险**：哪些配置最容易引发事故
6. **验证**：上线前后必须执行的检查动作

## 四、生产部署拓扑

### 1. 澳洲 VPP 生产架构（ALB 主备双机）

```text
ALB (AWS Application Load Balancer)
├── Master 节点
│   ├── Nginx（反向代理 + SSL 终结 + ALB 健康检查 /nginx-health）
│   ├── MySQL 8.4（主库，本地 127.0.0.1 连接避免网络延迟）
│   ├── Redis Master + Sentinel（自动故障转移）
│   ├── MinIO（S3 兼容对象存储）
│   ├── SnailJob（分布式任务调度，host 网络）
│   ├── 应用服务（host 网络，Undertow，-Xms512m -Xmx1g）
│   └── 前端容器 ×3（auth-web / ops-web / manage-web）
│
└── Backup 节点（镜像部署，故障时接管）
```

### 2. 使用建议

- 有明确主备需求时，优先沿用这种“双机 + 探活 + 锁防脑裂”模型
- 如果只是单机部署，不要为了“看起来高级”引入复杂 HA 组件

## 五、关键配置与演进

### 1. 故障转移机制

**监控脚本（`failover-monitor.sh`）**

- 健康检查：`GET /actuator/health`（间隔 10s，超时 5s）
- 故障判定：连续 3 次失败
- 恢复判定：连续 5 次成功
- 防脑裂：Redis 分布式锁（TTL 180s）
- 告警：企业微信 Webhook
- 状态持久化：文件系统

**Redis Sentinel 配置要点**

- 双节点时 `checkSentinelsList: false`（允许单 Sentinel 运行）
- `slaveConnectionPoolSize: 32`
- Sentinel 密码认证独立于 Redis 主密码

### 2. JVM 调优三代演进

```bash
# V1 — 基础版（Java 17，小型设备接入）
-Xms512m -Xmx1g -XX:+UseG1GC -XX:+HeapDumpOnOutOfMemoryError

# V2 — 性能版（Java 17，中型 IoT 平台）
-Xms512m -Xmx1024m -XX:+UseG1GC -XX:MaxGCPauseMillis=200

# V3 — 虚拟线程版（Java 21，高并发 I/O 场景）
-Djdk.virtualThreadScheduler.parallelism=40
-Djdk.virtualThreadScheduler.maxPoolSize=256
-Djdk.tracePinnedThreads=short
-XX:StartFlightRecording=filename=app.jfr,maxsize=100m,maxage=24h
-XX:+HeapDumpOnOutOfMemoryError -XX:+UseG1GC -Xms512m -Xmx1g
```

默认原则：

- Java 21 不是为了“新”，而是为了虚拟线程收益
- 一旦启用虚拟线程，必须同步考虑 Pin 诊断与 JFR

### 3. Docker 镜像演进

```text
V1: 阿里云私有镜像（团队维护，国内加速）
V2: bellsoft/liberica-openjdk-debian:17-cds（CDS 类数据共享加速启动）
V3: eclipse-temurin:21（官方 LTS，虚拟线程支持）
```

### 4. Docker Compose 配置要点

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:8090/actuator/health"]
  interval: 30s
  timeout: 5s
  retries: 3
  start_period: 90s

logging:
  driver: json-file
  options:
    max-size: "100m"
    max-file: "5"

network_mode: host

depends_on:
  mysql:
    condition: service_healthy
  redis:
    condition: service_healthy
```

### 5. 日志体系（三层隔离 + 异步）

```text
FILE_ALL   → /logs/app.log
FILE_ERROR → /logs/error.log
FILE_SQL   → /logs/sql.log

异步: AsyncAppender, queueSize=512, discardingThreshold=0
追踪: MDC %X{traceId:--}
隔离: dev=DEBUG+控制台, prod=INFO+仅文件+异步
```

### 6. 数据库配置

```yaml
hikari:
  maxPoolSize: 20
  minIdle: 10
  connectionTimeout: 30000
  idleTimeout: 600000
  maxLifetime: 1800000
  leakDetectionThreshold: 120000
  initializationFailTimeout: -1

dynamic:
  primary: master
  strict: true
  health-check: true
  datasource:
    master: { maxPoolSize: 20 }
    slave: { lazy: true }
```

### 7. 迁移管理

| 项目 | 工具 | 策略 |
|---|---|---|
| 中型 IoT 平台 | **Flyway** | 版本化迁移，自动执行 |
| 多变更集云端系统 | **Liquibase** | 变更集管理 |
| 早期小型项目 | 手动 SQL | 初始化脚本 + DDL 文档（不推荐沿用） |
| 新项目标准 | **Flyway** | 推荐 |

### 8. CI/CD 与安全合规

- 代码托管 + 流水线部署（Git 托管平台 + CI/CD pipeline，脚本化构建与部署）
- 前端构建产物同步、监控告警脚本化（如云监控告警初始化）
- MFA：TOTP（如 Google Authenticator）
- 加密：RSA / AES（Bouncy Castle）
- XSS：全局启用过滤
- 脱敏：手机 / 邮箱展示脱敏
- 多租户：`org_id` 强制隔离
- PCI：定期更新基础组件（Nginx CVE / MySQL CVE）

## 六、验证与巡检清单

### 1. 上线前必须核查

1. `/actuator/health` 和 `/nginx-health` 是否可探活
2. 数据库、Redis、对象存储是否都能建立连接
3. 日志是否按级别正确分流
4. 主备切换脚本阈值是否符合当前环境
5. JVM 参数是否与 Java 版本匹配
6. 故障告警链路是否真实可用

### 2. 上线后必须观察

1. GC 暂停时间
2. 线程池或虚拟线程异常信号
3. Redis Sentinel 选主状态
4. MySQL 连接池占用与泄漏报警
5. ALB / Nginx 探活波动

## 七、风险触发器

遇到以下情况必须主动提醒风险：

1. 双节点部署却没有防脑裂锁
2. 应用容器启动慢，却没有给 `start_period`
3. 全量日志、错误日志、SQL 日志混写在一个文件里
4. 使用 Java 21 虚拟线程却没有 Pin 诊断手段
5. 主从 / 哨兵存在，但没有真实切换演练
6. 数据库不可用时启动强阻塞，导致整机恢复能力差
