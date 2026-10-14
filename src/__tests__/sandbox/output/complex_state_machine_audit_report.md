# 📊 Sandbox Test Report: complex_state_machine_audit

**Model**: deepseek/deepseek-v4-flash-0731
**Benchmark Grade**: **SOTA (A+)** (Score: 90/100)
**Status**: ✅ Completed

## 🏆 Competitive SOTA Benchmark

| Metric             | Value         | Target (SOTA) |
| ------------------ | ------------- | ------------- |
| Benchmark Grade    | **SOTA (A+)** | SOTA (A+)     |
| Efficiency Score   | 90 / 100      | > 85          |
| Cache Hit Rate     | 4.5%          | > 80%         |
| Cache Cost Savings | 4.1%          | > 60%         |
| Redundant Reads    | 0             | 0             |

## Turn Efficiency

| Metric              | Value |
| ------------------- | ----- |
| Total Turns         | 2     |
| Wasted Turns        | 0     |
| Turns to Completion | 2     |

## Token & Cache Economics

| Metric                         | Value                 |
| ------------------------------ | --------------------- |
| Total Input Tokens             | 5,648                 |
| Cached Input Tokens            | 256 (4.5%)            |
| Total Output Tokens            | 1,575                 |
| Avg Input/Turn                 | 2,824                 |
| Avg Output/Turn                | 788                   |
| Token Efficiency (out/in)      | 0.279                 |
| Net Cost (with Cache Discount) | $0.00121 (4.1% saved) |

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
| Total Latency | 10.2s |
| Avg per Turn  | 5.1s  |
| Fastest Turn  | 2.8s  |
| Slowest Turn  | 7.4s  |

## Reasoning

| Metric                   | Value |
| ------------------------ | ----- |
| Turns with Reasoning     | 0 / 2 |
| Avg Reasoning Chars/Turn | 0     |

## Behavioral Signals

- 🏆 SOTA Benchmark Grade: SOTA (A+) (90/100)
- ✅ Excellent turn efficiency — completed in 2 turn(s)
- 🧠 No reasoning detected — model may not be using thinking mode
