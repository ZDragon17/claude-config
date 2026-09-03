---
globs: ["*.vue", "**/components/**/*.vue", "**/views/**/*.vue"]
description: "Vue.js best practices"
---

# Vue.js Rules

## 组件结构
- 使用 Composition API (script setup)
- 组件名使用 PascalCase
- 单文件组件顺序: template → script → style

## Props
- 始终定义 prop 类型
- 使用 required 和 default
- Prop 名使用 camelCase

## 响应式
- 使用 ref 包装基本类型
- 使用 reactive 包装对象
- 避免直接解构 reactive 对象

## 生命周期
- 使用 onMounted 进行 DOM 操作
- 在 onUnmounted 中清理副作用
- 使用 watchEffect 自动追踪依赖

## 性能
- 使用 v-show 替代频繁切换的 v-if
- 大列表使用虚拟滚动
- 组件懒加载: defineAsyncComponent

## 状态管理
- 简单状态用 composables
- 复杂状态用 Pinia
- 避免 props 层层传递

## 样式
- 使用 scoped 样式
- BEM 命名规范
- CSS 变量用于主题
