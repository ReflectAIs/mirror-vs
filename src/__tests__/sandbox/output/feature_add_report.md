# 📊 Sandbox Test Report: feature_add

**Model**: deepseek/deepseek-v4-flash-0731
**Status**: ✅ Completed

## Turn Efficiency

| Metric              | Value |
| ------------------- | ----- |
| Total Turns         | 3     |
| Wasted Turns        | 0     |
| Turns to Completion | 3     |

## Token Usage

| Metric                    | Value    |
| ------------------------- | -------- |
| Total Input Tokens        | 6,102    |
| Total Output Tokens       | 711      |
| Avg Input/Turn            | 2,034    |
| Avg Output/Turn           | 237      |
| Token Efficiency (out/in) | 0.117    |
| Estimated Cost            | $0.00082 |

## Tool Usage

| Metric            | Value                          |
| ----------------- | ------------------------------ |
| Total Tool Calls  | 3                              |
| Unique Tools Used | apply_diff, attempt_completion |
| Redundant Reads   | 0                              |
| Failed Tool Calls | 0                              |

### Tool Call Breakdown

| Tool               | Count |
| ------------------ | ----- |
| apply_diff         | 2     |
| attempt_completion | 1     |

## Latency

| Metric        | Value |
| ------------- | ----- |
| Total Latency | 6.3s  |
| Avg per Turn  | 2.1s  |
| Fastest Turn  | 1.5s  |
| Slowest Turn  | 3.0s  |

## Reasoning

| Metric                   | Value |
| ------------------------ | ----- |
| Turns with Reasoning     | 0 / 3 |
| Avg Reasoning Chars/Turn | 0     |

## Behavioral Signals

- ✅ Excellent turn efficiency — completed in 3 turn(s)
- 🧠 No reasoning detected — model may not be using thinking mode
