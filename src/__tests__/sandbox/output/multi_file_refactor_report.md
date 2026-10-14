# 📊 Sandbox Test Report: multi_file_refactor

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
| Total Input Tokens        | 7,827    |
| Total Output Tokens       | 1,223    |
| Avg Input/Turn            | 2,609    |
| Avg Output/Turn           | 408      |
| Token Efficiency (out/in) | 0.156    |
| Estimated Cost            | $0.00115 |

## Tool Usage

| Metric            | Value                                       |
| ----------------- | ------------------------------------------- |
| Total Tool Calls  | 8                                           |
| Unique Tools Used | edit_file, search_files, attempt_completion |
| Redundant Reads   | 0                                           |
| Failed Tool Calls | 0                                           |

### Tool Call Breakdown

| Tool               | Count |
| ------------------ | ----- |
| edit_file          | 6     |
| search_files       | 1     |
| attempt_completion | 1     |

## Latency

| Metric        | Value |
| ------------- | ----- |
| Total Latency | 11.9s |
| Avg per Turn  | 4.0s  |
| Fastest Turn  | 1.1s  |
| Slowest Turn  | 8.9s  |

## Reasoning

| Metric                   | Value |
| ------------------------ | ----- |
| Turns with Reasoning     | 0 / 3 |
| Avg Reasoning Chars/Turn | 0     |

## Behavioral Signals

- ✅ Excellent turn efficiency — completed in 3 turn(s)
- 🧠 No reasoning detected — model may not be using thinking mode
