---
globs: ["*.go", "**/cmd/**", "**/pkg/**", "**/internal/**"]
description: "Go best practices"
---

# Go Rules

## 命名
- 包名: 小写单词，不用下划线
- 导出: 首字母大写
- 接口: 以 -er 结尾 (Reader, Writer)
- 缩写全大写: HTTP, URL, ID

## 错误处理
- 检查所有错误，不要用 _
- 错误信息小写开头，不带标点
- 使用 errors.Is/As 进行错误比较
- 用 %w 包装错误保留链

## 并发
- 使用 context 控制生命周期
- goroutine 泄漏检查
- 用 channel 通信，不共享内存
- sync.WaitGroup 等待 goroutine

## 项目结构
```
/cmd        - 主程序入口
/internal   - 私有代码
/pkg        - 公共库
/api        - API 定义
/configs    - 配置文件
```

## 测试
- 测试文件: xxx_test.go
- 表驱动测试
- 用 t.Parallel() 并行测试
- 用 testify 做断言

## 性能
- 预分配 slice 容量
- 避免不必要的指针
- 用 sync.Pool 复用对象
- 用 pprof 分析性能
