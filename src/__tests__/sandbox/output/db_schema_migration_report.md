# 📊 Sandbox Test Report: db_schema_migration

**Model**: deepseek/deepseek-v4-flash-0731
**Status**: ✅ Completed

## Turn Efficiency

| Metric              | Value |
| ------------------- | ----- |
| Total Turns         | 4     |
| Wasted Turns        | 0     |
| Turns to Completion | 4     |

## Token Usage

| Metric                    | Value    |
| ------------------------- | -------- |
| Total Input Tokens        | 16,516   |
| Total Output Tokens       | 2,890    |
| Avg Input/Turn            | 4,129    |
| Avg Output/Turn           | 723      |
| Token Efficiency (out/in) | 0.175    |
| Estimated Cost            | $0.00252 |

## Tool Usage

| Metric            | Value                                         |
| ----------------- | --------------------------------------------- |
| Total Tool Calls  | 4                                             |
| Unique Tools Used | write_to_file, apply_diff, attempt_completion |
| Redundant Reads   | 0                                             |
| Failed Tool Calls | 0                                             |

### Tool Call Breakdown

| Tool               | Count |
| ------------------ | ----- |
| write_to_file      | 2     |
| apply_diff         | 1     |
| attempt_completion | 1     |

## Latency

| Metric        | Value |
| ------------- | ----- |
| Total Latency | 9.7s  |
| Avg per Turn  | 2.4s  |
| Fastest Turn  | 1.2s  |
| Slowest Turn  | 5.5s  |

## Reasoning

| Metric                   | Value |
| ------------------------ | ----- |
| Turns with Reasoning     | 0 / 4 |
| Avg Reasoning Chars/Turn | 0     |

## Behavioral Signals

- 🧠 No reasoning detected — model may not be using thinking mode
