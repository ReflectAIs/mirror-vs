# 📊 Sandbox Test Report: feature_add

**Model**: deepseek/deepseek-v4-flash-0731
**Status**: ✅ Completed

## Turn Efficiency

| Metric              | Value |
| ------------------- | ----- |
| Total Turns         | 2     |
| Wasted Turns        | 0     |
| Turns to Completion | 2     |

## Token Usage

| Metric                    | Value    |
| ------------------------- | -------- |
| Total Input Tokens        | 3,814    |
| Total Output Tokens       | 517      |
| Avg Input/Turn            | 1,907    |
| Avg Output/Turn           | 259      |
| Token Efficiency (out/in) | 0.136    |
| Estimated Cost            | $0.00054 |

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
| Total Latency | 6.6s  |
| Avg per Turn  | 3.3s  |
| Fastest Turn  | 2.3s  |
| Slowest Turn  | 4.2s  |

## Reasoning

| Metric                   | Value |
| ------------------------ | ----- |
| Turns with Reasoning     | 0 / 2 |
| Avg Reasoning Chars/Turn | 0     |

## Behavioral Signals

- ✅ Excellent turn efficiency — completed in 2 turn(s)
- 🧠 No reasoning detected — model may not be using thinking mode
