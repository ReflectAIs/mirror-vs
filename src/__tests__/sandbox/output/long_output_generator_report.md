# 📊 Sandbox Test Report: long_output_generator

**Model**: deepseek/deepseek-v4-flash-0731
**Benchmark Grade**: **Frontier (A)** (Score: 82/100)
**Status**: ✅ Completed

## 🏆 Competitive SOTA Benchmark

| Metric             | Value            | Target (SOTA) |
| ------------------ | ---------------- | ------------- |
| Benchmark Grade    | **Frontier (A)** | SOTA (A+)     |
| Efficiency Score   | 82 / 100         | > 85          |
| Cache Hit Rate     | 43.5%            | > 80%         |
| Cache Cost Savings | 39.2%            | > 60%         |
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
| Total Input Tokens             | 24,112                 |
| Cached Input Tokens            | 10,496 (43.5%)         |
| Total Output Tokens            | 4,768                  |
| Avg Input/Turn                 | 4,822                  |
| Avg Output/Turn                | 954                    |
| Token Efficiency (out/in)      | 0.198                  |
| Net Cost (with Cache Discount) | $0.00330 (39.2% saved) |

## Tool Usage

| Metric            | Value                                              |
| ----------------- | -------------------------------------------------- |
| Total Tool Calls  | 5                                                  |
| Unique Tools Used | write_to_file, execute_command, attempt_completion |
| Redundant Reads   | 0                                                  |
| Failed Tool Calls | 0                                                  |

### Tool Call Breakdown

| Tool               | Count |
| ------------------ | ----- |
| execute_command    | 3     |
| write_to_file      | 1     |
| attempt_completion | 1     |

## Latency

| Metric        | Value |
| ------------- | ----- |
| Total Latency | 93.8s |
| Avg per Turn  | 18.8s |
| Fastest Turn  | 2.7s  |
| Slowest Turn  | 54.8s |

## Reasoning

| Metric                   | Value |
| ------------------------ | ----- |
| Turns with Reasoning     | 0 / 5 |
| Avg Reasoning Chars/Turn | 0     |

## Behavioral Signals

- 🏆 SOTA Benchmark Grade: Frontier (A) (82/100)
- 🧠 No reasoning detected — model may not be using thinking mode
