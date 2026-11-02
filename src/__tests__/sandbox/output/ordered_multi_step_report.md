# 📊 Sandbox Test Report: ordered_multi_step

**Model**: deepseek/deepseek-v4-flash-0731
**Benchmark Grade**: **SOTA (A+)** (Score: 96/100)
**Status**: ✅ Completed

## 🏆 Competitive SOTA Benchmark

| Metric             | Value         | Target (SOTA) |
| ------------------ | ------------- | ------------- |
| Benchmark Grade    | **SOTA (A+)** | SOTA (A+)     |
| Efficiency Score   | 96 / 100      | > 85          |
| Cache Hit Rate     | 53.7%         | > 80%         |
| Cache Cost Savings | 48.3%         | > 60%         |
| Redundant Reads    | 0             | 0             |

## Turn Efficiency

| Metric              | Value |
| ------------------- | ----- |
| Total Turns         | 2     |
| Wasted Turns        | 0     |
| Turns to Completion | 2     |

## Token & Cache Economics

| Metric                         | Value                  |
| ------------------------------ | ---------------------- |
| Total Input Tokens             | 3,814                  |
| Cached Input Tokens            | 2,048 (53.7%)          |
| Total Output Tokens            | 480                    |
| Avg Input/Turn                 | 1,907                  |
| Avg Output/Turn                | 240                    |
| Token Efficiency (out/in)      | 0.126                  |
| Net Cost (with Cache Discount) | $0.00022 (48.3% saved) |

## Tool Usage

| Metric            | Value                          |
| ----------------- | ------------------------------ |
| Total Tool Calls  | 2                              |
| Unique Tools Used | apply_diff, attempt_completion |
| Redundant Reads   | 0                              |
| Failed Tool Calls | 0                              |

### Tool Call Breakdown

| Tool               | Count |
| ------------------ | ----- |
| apply_diff         | 1     |
| attempt_completion | 1     |

## Latency

| Metric        | Value |
| ------------- | ----- |
| Total Latency | 2.7s  |
| Avg per Turn  | 1.4s  |
| Fastest Turn  | 0.9s  |
| Slowest Turn  | 1.8s  |

## Reasoning

| Metric                   | Value |
| ------------------------ | ----- |
| Turns with Reasoning     | 0 / 2 |
| Avg Reasoning Chars/Turn | 0     |

## Behavioral Signals

- 🏆 SOTA Benchmark Grade: SOTA (A+) (96/100)
- ⚡ High Cache Efficiency: 53.7% KV cache hit rate (~48.3% cost savings)
- ✅ Excellent turn efficiency — completed in 2 turn(s)
- 🧠 No reasoning detected — model may not be using thinking mode
- ✅ Outcome Verification PASSED
