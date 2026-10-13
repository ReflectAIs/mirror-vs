# 📊 Sandbox Test Report: mirror_add_retry_logic

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
| Total Input Tokens        | 8,963    |
| Total Output Tokens       | 2,227    |
| Avg Input/Turn            | 2,988    |
| Avg Output/Turn           | 742      |
| Token Efficiency (out/in) | 0.248    |
| Estimated Cost            | $0.00156 |

## Tool Usage

| Metric            | Value                                         |
| ----------------- | --------------------------------------------- |
| Total Tool Calls  | 3                                             |
| Unique Tools Used | write_to_file, apply_diff, attempt_completion |
| Redundant Reads   | 0                                             |
| Failed Tool Calls | 0                                             |

### Tool Call Breakdown

| Tool               | Count |
| ------------------ | ----- |
| write_to_file      | 1     |
| apply_diff         | 1     |
| attempt_completion | 1     |

## Latency

| Metric        | Value |
| ------------- | ----- |
| Total Latency | 9.6s  |
| Avg per Turn  | 3.2s  |
| Fastest Turn  | 2.2s  |
| Slowest Turn  | 4.9s  |

## Reasoning

| Metric                   | Value |
| ------------------------ | ----- |
| Turns with Reasoning     | 0 / 3 |
| Avg Reasoning Chars/Turn | 0     |

## Behavioral Signals

- ✅ Excellent turn efficiency — completed in 3 turn(s)
- 🧠 No reasoning detected — model may not be using thinking mode
