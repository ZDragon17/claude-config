# 问题诊断与排查指南

## 问题排查流程

```
问题发生
  ↓
【1. 查看日志】
  - 应用日志：logs/app.log
  - 错误日志：logs/error.log
  - 访问日志：logs/access.log
  ↓
【2. 检查资源】
  - CPU：top/htop
  - 内存：free -h
  - 磁盘：df -h
  - 网络：netstat -tunlp
  ↓
【3. 数据库检查】
  - 慢查询：SHOW PROCESSLIST
  - 锁等待：SHOW ENGINE INNODB STATUS
  - 连接数：SHOW STATUS LIKE 'Threads_connected'
  ↓
【4. 代码分析】
  - 性能分析：JProfiler/VisualVM
  - 线程分析：jstack <pid>
  - 堆分析：jmap -dump:live,format=b,file=heap.bin <pid>
  ↓
【5. 解决方案】
  - 优化SQL
  - 增加索引
  - 调整JVM参数
  - 代码重构
```

## 常见错误速查表

| 错误类型 | 可能原因 | 解决方案 |
|---------|---------|---------|
| **OutOfMemoryError** | 内存泄漏/堆太小 | 增大堆内存，检查内存泄漏 |
| **StackOverflowError** | 递归过深 | 优化递归，增加栈大小 |
| **Connection timeout** | 网络问题/服务无响应 | 检查网络，增加超时时间 |
| **Deadlock** | 死锁 | 分析锁等待，调整锁顺序 |
| **Slow Query** | SQL未优化/缺索引 | 添加索引，优化查询 |
| **Connection pool exhausted** | 连接泄漏 | 检查连接是否正确关闭 |
| **Too many open files** | 文件句柄不足 | 增加ulimit限制 |

## JVM问题诊断

### OutOfMemoryError分析

```bash
# 1. 查看堆内存使用
jmap -heap <pid>

# 2. dump堆内存
jmap -dump:live,format=b,format=b,file=heap.bin <pid>

# 3. 分析堆内存（使用MAT/JProfiler）

# 4. 常见原因
- 大对象未释放
- 静态集合持续增长
- ThreadLocal泄漏
- ClassLoader泄漏
```

### 线程问题分析

```bash
# 1. 查看线程栈
jstack <pid> > threads.txt

# 2. 查看线程数
jstack <pid> | grep 'java.lang.Thread.State' | wc -l

# 3. 查找死锁
jstack <pid> | grep -A 10 "Found one Java-level deadlock"

# 4. CPU占用高的线程
top -Hp <pid>
printf "%x\n" <thread-id>  # 转16进制
jstack <pid> | grep <hex-thread-id>
```

## 数据库问题诊断

### 慢查询分析

```sql
-- 1. 开启慢查询日志
SET GLOBAL slow_query_log = 'ON';
SET GLOBAL long_query_time = 2;

-- 2. 查看当前慢查询
SHOW PROCESSLIST;

-- 3. 分析执行计划
EXPLAIN SELECT ...;

-- 4. 查看表索引
SHOW INDEX FROM table_name;

-- 5. 优化建议
- 添加合适的索引
- 避免SELECT *
- 减少JOIN表数量
- 使用分页查询
- 考虑使用缓存
```

### 锁等待分析

```sql
-- 1. 查看InnoDB锁等待
SELECT * FROM information_schema.innodb_locks;

-- 2. 查看锁等待事务
SELECT * FROM information_schema.innodb_lock_waits;

-- 3. 查看当前事务
SELECT * FROM information_schema.innodb_trx;

-- 4. 解决方案
- 优化事务大小
- 减少锁持有时间
- 调整隔离级别
```

## 性能优化检查清单

### 应用层

- [ ] 是否有N+1查询问题
- [ ] 是否启用了缓存
- [ ] 是否有大量对象创建
- [ ] 是否有不必要的循环
- [ ] 异步操作是否合理

### 数据库层

- [ ] SQL是否使用了索引
- [ ] 是否有全表扫描
- [ ] 连接池配置是否合理
- [ ] 是否需要读写分离
- [ ] 是否需要分库分表

### JVM层

- [ ] 堆内存配置是否合理
- [ ] GC策略是否合适
- [ ] 是否有内存泄漏
- [ ] 线程池配置是否合理

### 系统层

- [ ] CPU使用率
- [ ] 内存使用率
- [ ] 磁盘IO
- [ ] 网络带宽

## 应急处理流程

### 生产环境故障

```
1. 【确认影响范围】
   - 影响用户数量
   - 核心功能是否可用
   - 数据是否丢失

2. 【紧急止损】
   - 回滚到上一稳定版本
   - 降级非核心功能
   - 限流保护核心服务

3. 【问题定位】
   - 查看监控告警
   - 分析错误日志
   - 对比近期变更

4. 【修复验证】
   - 本地复现问题
   - 修复并测试
   - 灰度发布验证

5. 【复盘总结】
   - 记录故障原因
   - 优化监控告警
   - 制定预防措施
```

## 监控指标参考

### 应用监控

- **QPS**: < 1000（单实例）
- **响应时间**: < 200ms（P99）
- **错误率**: < 0.1%
- **CPU使用率**: < 70%
- **内存使用率**: < 80%

### 数据库监控

- **慢查询**: < 1秒
- **连接数**: < 最大连接数的70%
- **缓存命中率**: > 95%
- **锁等待**: < 100ms
- **复制延迟**: < 1秒

### JVM监控

- **堆内存使用**: < 80%
- **GC频率**: < 10次/分钟
- **GC停顿**: < 200ms
- **线程数**: < 500
