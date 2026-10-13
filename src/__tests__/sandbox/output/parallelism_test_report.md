# 📊 Sandbox Test Report: parallelism_test

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
| Total Input Tokens        | 6,337    |
| Total Output Tokens       | 584      |
| Avg Input/Turn            | 2,112    |
| Avg Output/Turn           | 195      |
| Token Efficiency (out/in) | 0.092    |
| Estimated Cost            | $0.00081 |

## Tool Usage

| Metric            | Value                             |
| ----------------- | --------------------------------- |
| Total Tool Calls  | 3                                 |
| Unique Tools Used | write_to_file, attempt_completion |
| Redundant Reads   | 0                                 |
| Failed Tool Calls | 0                                 |

### Tool Call Breakdown

| Tool               | Count |
| ------------------ | ----- |
| write_to_file      | 2     |
| attempt_completion | 1     |

## Latency

| Metric        | Value |
| ------------- | ----- |
| Total Latency | 9.8s  |
| Avg per Turn  | 3.3s  |
| Fastest Turn  | 1.9s  |
| Slowest Turn  | 5.1s  |

## Reasoning

| Metric                   | Value |
| ------------------------ | ----- |
| Turns with Reasoning     | 0 / 3 |
| Avg Reasoning Chars/Turn | 0     |

## Behavioral Signals

- ✅ Excellent turn efficiency — completed in 3 turn(s)
- 🧠 No reasoning detected — model may not be using thinking mode
