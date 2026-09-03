# 命令速查表

## Maven 常用命令

```bash
# 构建相关
mvn clean install                              # 清理并安装
mvn clean install -DskipTests                  # 跳过测试
mvn clean package                              # 打包
mvn dependency:tree                            # 查看依赖树
mvn versions:display-dependency-updates        # 检查依赖更新

# 运行相关
mvn spring-boot:run                            # 运行Spring Boot
mvn spring-boot:run -Dspring-boot.run.profiles=dev  # 指定profile

# 测试相关
mvn test                                       # 运行所有测试
mvn test -Dtest=ClassName                      # 运行特定测试类
mvn test -Dtest=ClassName#methodName           # 运行特定测试方法
```

## Git 常用命令

```bash
# 分支管理
git checkout -b feature/xxx                    # 创建并切换分支
git branch -d feature/xxx                      # 删除已合并分支
git branch -D feature/xxx                      # 强制删除分支
git branch -a                                  # 查看所有分支

# 提交管理
git add -p                                     # 交互式暂存
git commit -m "feat: xxx"                      # 提交
git commit --amend                             # 修改最后一次提交
git reset --soft HEAD^                         # 撤销提交（保留修改）

# 远程操作
git fetch origin                               # 获取远程更新
git pull --rebase origin main                  # 变基拉取
git push -u origin feature/xxx                 # 推送并设置上游
git push --force-with-lease                    # 安全的强制推送

# 历史查看
git log --oneline --graph --all                # 图形化日志
git diff HEAD^                                 # 查看最近一次提交的差异
```

## MySQL 常用命令

```bash
# 连接与管理
mysql -u root -p                               # 连接数据库
mysqldump -u root -p dbname > backup.sql       # 备份数据库
mysql -u root -p dbname < backup.sql           # 恢复数据库

# 性能分析
EXPLAIN SELECT ...                             # 查询执行计划
SHOW PROCESSLIST;                              # 查看当前进程
SHOW INDEX FROM table_name;                    # 查看索引
SHOW ENGINE INNODB STATUS;                     # InnoDB状态

# 慢查询
SET GLOBAL slow_query_log = 'ON';              # 启用慢查询日志
SHOW VARIABLES LIKE 'slow_query%';             # 查看慢查询配置
```

## JVM 参数优化

```bash
# 生产环境推荐
java -jar app.jar \
  -Xms4g -Xmx4g \                              # 堆内存4G
  -XX:MetaspaceSize=256m \                     # 元空间
  -XX:MaxMetaspaceSize=512m \
  -XX:+UseG1GC \                               # G1垃圾回收器
  -XX:MaxGCPauseMillis=200 \                   # GC最大暂停时间
  -XX:+HeapDumpOnOutOfMemoryError \            # OOM时dump堆
  -XX:HeapDumpPath=/logs/heapdump.hprof \
  -Xlog:gc*:file=/logs/gc.log:time,tags:filecount=10,filesize=100M
```

## 数据库索引设计原则

```sql
-- 单列索引
CREATE INDEX idx_user_email ON user(email);

-- 复合索引（注意顺序）
CREATE INDEX idx_order_status_time ON orders(status, create_time);

-- 唯一索引
CREATE UNIQUE INDEX idx_user_username ON user(username);

-- 查看索引使用
EXPLAIN SELECT * FROM user WHERE email = 'xxx';
```

**索引设计原则**：
1. WHERE条件字段优先建索引
2. ORDER BY字段建索引提升排序
3. JOIN字段建索引加速连接
4. 高选择性字段优先（重复值少）
5. 避免在频繁更新字段建索引
6. 小表（<1000行）不需要索引
