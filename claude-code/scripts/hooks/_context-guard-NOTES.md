# context-degradation-guard 技术核实笔记

## 作用

PostToolUse hook。每次工具调用后，读取当前会话 transcript 的**最近一条** `message.usage`，
估算上下文窗口占用，接近大模型退化高发区时通过 stderr 提示用户 `/clear`。

## 占用算法

```
occupancy = input_tokens + cache_read_input_tokens + cache_creation_input_tokens
```

`output_tokens` 不计入——它是本次响应的产出，不占用后续请求的上下文窗口。

取「最近一条」而非「历史最大」：占用值随会话推进单调累积（cache_read 持续增大），
最近一条才代表当前真实窗口占用。

## 阈值（1M 上下文模型）

| 阈值 | 行为 |
| --- | --- |
| < 750k | 静默 |
| ≥ 750k | WARN：建议完成当前小节后 /clear |
| ≥ 900k | CRITICAL：强烈建议立即 /clear |

留约 25% 余量，因为检索质量在接近上限前就开始退化，不能等满了才提示。

## 安全铁律（已逐条验证）

- 纯只读：只 `readFileSync` transcript，不写任何文件、不调用任何外部命令。
- 任何异常路径都被外层 try/catch 兜住并 `process.exit(0)`：
  stdin 空 / JSON 坏 / 无 transcript_path / 文件不存在 / 文件读失败 / 行 JSON 坏 / usage 缺字段。
- 永不抛未捕获异常、永不非零退出，绝不阻断主流程。

## 冒烟测试结果（2026-06-15）

| 用例 | 输出 | 退出码 |
| --- | --- | --- |
| 真实 transcript（最近占用 ~140k） | 静默 | 0 |
| `{}`（无 transcript_path） | 静默 | 0 |
| 合成 820k | WARN 两行 | 0 |
| 合成 950k | CRITICAL 两行 | 0 |
| 空 stdin / 坏 JSON / 文件不存在 | 静默 | 0 |

注：交接说本会话「占用很高应触发警告」，实测最近占用约 140k（峰值 168k），
远低于 750k，因此真实 transcript 上**不会**触发——这是正确行为，不是 bug。

## settings.json 配置片段（与本机现有 hook 路径写法完全一致：绝对路径）

追加到 `hooks.PostToolUse[0].hooks` 数组（与 posttooluse-advisory 同组，matcher `*`）：

```json
{
  "command": "node \"C:\\Users\\yourname\\.claude\\scripts\\hooks\\context-degradation-guard.mjs\"",
  "type": "command"
}
```
