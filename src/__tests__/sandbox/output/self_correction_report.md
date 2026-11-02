# 📊 Sandbox Test Report: self_correction

**Model**: deepseek/deepseek-v4-flash-0731
**Benchmark Grade**: **Frontier (A)** (Score: 86/100)
**Status**: ✅ Completed

## 🏆 Competitive SOTA Benchmark

| Metric             | Value            | Target (SOTA) |
| ------------------ | ---------------- | ------------- |
| Benchmark Grade    | **Frontier (A)** | SOTA (A+)     |
| Efficiency Score   | 86 / 100         | > 85          |
| Cache Hit Rate     | 63.7%            | > 80%         |
| Cache Cost Savings | 57.3%            | > 60%         |
| Redundant Reads    | 0                | 0             |

## Turn Efficiency

| Metric              | Value |
| ------------------- | ----- |
| Total Turns         | 5     |
| Wasted Turns        | 0     |
| Turns to Completion | 5     |

## Token & Cache Economics

| Metric                         | Value                  |
| ------------------------------ | ---------------------- |
| Total Input Tokens             | 11,256                 |
| Cached Input Tokens            | 7,168 (63.7%)          |
| Total Output Tokens            | 1,036                  |
| Avg Input/Turn                 | 2,251                  |
| Avg Output/Turn                | 207                    |
| Token Efficiency (out/in)      | 0.092                  |
| Net Cost (with Cache Discount) | $0.00100 (57.3% saved) |

## Tool Usage

| Metric            | Value                                                   |
| ----------------- | ------------------------------------------------------- |
| Total Tool Calls  | 5                                                       |
| Unique Tools Used | edit_file, attempt_completion, read_file, write_to_file |
| Redundant Reads   | 0                                                       |
| Failed Tool Calls | 0                                                       |

### Tool Call Breakdown

| Tool               | Count |
| ------------------ | ----- |
| attempt_completion | 2     |
| edit_file          | 1     |
| read_file          | 1     |
| write_to_file      | 1     |

## Latency

| Metric        | Value |
| ------------- | ----- |
| Total Latency | 14.9s |
| Avg per Turn  | 3.0s  |
| Fastest Turn  | 1.2s  |
| Slowest Turn  | 9.0s  |

## Reasoning

| Metric                   | Value |
| ------------------------ | ----- |
| Turns with Reasoning     | 3 / 5 |
| Avg Reasoning Chars/Turn | 336   |

## Behavioral Signals

- 🏆 SOTA Benchmark Grade: Frontier (A) (86/100)
- ⚡ High Cache Efficiency: 63.7% KV cache hit rate (~57.3% cost savings)
- 🧠 Thinking mode active — 3 turn(s) with reasoning (336 avg chars)
- 🔄 Self-correction verified — model recovered after 1 verification nudge(s)
- 📖 Read before edit pattern on: src/palindrome.ts
- ✅ Outcome Verification PASSED
