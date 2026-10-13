# 📊 Sandbox Test Report: multi_file_refactor

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
| Total Input Tokens        | 14,250   |
| Total Output Tokens       | 1,143    |
| Avg Input/Turn            | 2,375    |
| Avg Output/Turn           | 191      |
| Token Efficiency (out/in) | 0.08     |
| Estimated Cost            | $0.00177 |

## Tool Usage

| Metric            | Value                                       |
| ----------------- | ------------------------------------------- |
| Total Tool Calls  | 6                                           |
| Unique Tools Used | edit_file, search_files, attempt_completion |
| Redundant Reads   | 0                                           |
| Failed Tool Calls | 0                                           |

### Tool Call Breakdown

| Tool               | Count |
| ------------------ | ----- |
| edit_file          | 4     |
| search_files       | 1     |
| attempt_completion | 1     |

## Latency

| Metric        | Value |
| ------------- | ----- |
| Total Latency | 7.9s  |
| Avg per Turn  | 1.3s  |
| Fastest Turn  | 0.9s  |
| Slowest Turn  | 2.1s  |

## Reasoning

| Metric                   | Value |
| ------------------------ | ----- |
| Turns with Reasoning     | 0 / 6 |
| Avg Reasoning Chars/Turn | 0     |

## Behavioral Signals

- 🧠 No reasoning detected — model may not be using thinking mode
