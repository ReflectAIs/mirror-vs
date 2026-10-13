# 📊 Sandbox Test Report: simple_edit

**Model**: deepseek/deepseek-v4-flash-0731
**Status**: ✅ Completed

## Turn Efficiency

| Metric              | Value |
| ------------------- | ----- |
| Total Turns         | 2     |
| Wasted Turns        | 0     |
| Turns to Completion | 2     |

## Token Usage

| Metric                    | Value   |
| ------------------------- | ------- |
| Total Input Tokens        | 3,361   |
| Total Output Tokens       | 211     |
| Avg Input/Turn            | 1,681   |
| Avg Output/Turn           | 106     |
| Token Efficiency (out/in) | 0.063   |
| Estimated Cost            | $0.0004 |

## Tool Usage

| Metric            | Value                         |
| ----------------- | ----------------------------- |
| Total Tool Calls  | 2                             |
| Unique Tools Used | edit_file, attempt_completion |
| Redundant Reads   | 0                             |
| Failed Tool Calls | 0                             |

### Tool Call Breakdown

| Tool               | Count |
| ------------------ | ----- |
| edit_file          | 1     |
| attempt_completion | 1     |

## Latency

| Metric        | Value |
| ------------- | ----- |
| Total Latency | 3.1s  |
| Avg per Turn  | 1.5s  |
| Fastest Turn  | 1.2s  |
| Slowest Turn  | 1.9s  |

## Reasoning

| Metric                   | Value |
| ------------------------ | ----- |
| Turns with Reasoning     | 0 / 2 |
| Avg Reasoning Chars/Turn | 0     |

## Behavioral Signals

- ✅ Excellent turn efficiency — completed in 2 turn(s)
- 🧠 No reasoning detected — model may not be using thinking mode
