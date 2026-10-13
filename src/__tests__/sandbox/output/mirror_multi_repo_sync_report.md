# 📊 Sandbox Test Report: mirror_multi_repo_sync

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
| Total Input Tokens        | 6,364    |
| Total Output Tokens       | 3,033    |
| Avg Input/Turn            | 3,182    |
| Avg Output/Turn           | 1,517    |
| Token Efficiency (out/in) | 0.477    |
| Estimated Cost            | $0.00155 |

## Tool Usage

| Metric            | Value                             |
| ----------------- | --------------------------------- |
| Total Tool Calls  | 2                                 |
| Unique Tools Used | write_to_file, attempt_completion |
| Redundant Reads   | 0                                 |
| Failed Tool Calls | 0                                 |

### Tool Call Breakdown

| Tool               | Count |
| ------------------ | ----- |
| write_to_file      | 1     |
| attempt_completion | 1     |

## Latency

| Metric        | Value |
| ------------- | ----- |
| Total Latency | 14.3s |
| Avg per Turn  | 7.2s  |
| Fastest Turn  | 4.2s  |
| Slowest Turn  | 10.2s |

## Reasoning

| Metric                   | Value |
| ------------------------ | ----- |
| Turns with Reasoning     | 0 / 2 |
| Avg Reasoning Chars/Turn | 0     |

## Behavioral Signals

- ✅ Excellent turn efficiency — completed in 2 turn(s)
- 🧠 No reasoning detected — model may not be using thinking mode
