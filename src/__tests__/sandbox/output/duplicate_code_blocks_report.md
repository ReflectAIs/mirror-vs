# 📊 Sandbox Test Report: duplicate_code_blocks

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
| Total Input Tokens        | 3,471    |
| Total Output Tokens       | 253      |
| Avg Input/Turn            | 1,736    |
| Avg Output/Turn           | 127      |
| Token Efficiency (out/in) | 0.073    |
| Estimated Cost            | $0.00042 |

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
| Total Latency | 2.9s  |
| Avg per Turn  | 1.5s  |
| Fastest Turn  | 1.3s  |
| Slowest Turn  | 1.6s  |

## Reasoning

| Metric                   | Value |
| ------------------------ | ----- |
| Turns with Reasoning     | 0 / 2 |
| Avg Reasoning Chars/Turn | 0     |

## Behavioral Signals

- ✅ Excellent turn efficiency — completed in 2 turn(s)
- 🧠 No reasoning detected — model may not be using thinking mode
