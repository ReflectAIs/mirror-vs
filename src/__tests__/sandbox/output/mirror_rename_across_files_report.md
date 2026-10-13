# 📊 Sandbox Test Report: mirror_rename_across_files

**Model**: deepseek/deepseek-v4-flash-0731
**Status**: ✅ Completed

## Turn Efficiency

| Metric              | Value |
| ------------------- | ----- |
| Total Turns         | 6     |
| Wasted Turns        | 0     |
| Turns to Completion | 6     |

## Token Usage

| Metric                    | Value    |
| ------------------------- | -------- |
| Total Input Tokens        | 21,398   |
| Total Output Tokens       | 1,379    |
| Avg Input/Turn            | 3,566    |
| Avg Output/Turn           | 230      |
| Token Efficiency (out/in) | 0.064    |
| Estimated Cost            | $0.00255 |

## Tool Usage

| Metric            | Value                                        |
| ----------------- | -------------------------------------------- |
| Total Tool Calls  | 6                                            |
| Unique Tools Used | apply_diff, search_files, attempt_completion |
| Redundant Reads   | 0                                            |
| Failed Tool Calls | 0                                            |

### Tool Call Breakdown

| Tool               | Count |
| ------------------ | ----- |
| apply_diff         | 4     |
| search_files       | 1     |
| attempt_completion | 1     |

## Latency

| Metric        | Value |
| ------------- | ----- |
| Total Latency | 11.1s |
| Avg per Turn  | 1.9s  |
| Fastest Turn  | 1.2s  |
| Slowest Turn  | 3.1s  |

## Reasoning

| Metric                   | Value |
| ------------------------ | ----- |
| Turns with Reasoning     | 0 / 6 |
| Avg Reasoning Chars/Turn | 0     |

## Behavioral Signals

- 🧠 No reasoning detected — model may not be using thinking mode
