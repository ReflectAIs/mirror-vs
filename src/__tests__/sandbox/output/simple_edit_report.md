# 📊 Sandbox Test Report: simple_edit

**Model**: deepseek-v4-flash
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
| Total Input Tokens        | 4,432    |
| Total Output Tokens       | 227      |
| Avg Input/Turn            | 1,477    |
| Avg Output/Turn           | 76       |
| Token Efficiency (out/in) | 0.051    |
| Estimated Cost            | $0.00051 |

## Tool Usage

| Metric            | Value                                     |
| ----------------- | ----------------------------------------- |
| Total Tool Calls  | 3                                         |
| Unique Tools Used | read_file, apply_diff, attempt_completion |
| Redundant Reads   | 0                                         |
| Failed Tool Calls | 0                                         |

### Tool Call Breakdown

| Tool               | Count |
| ------------------ | ----- |
| read_file          | 1     |
| apply_diff         | 1     |
| attempt_completion | 1     |

## Latency

| Metric        | Value |
| ------------- | ----- |
| Total Latency | 3.6s  |
| Avg per Turn  | 1.2s  |
| Fastest Turn  | 1.0s  |
| Slowest Turn  | 1.3s  |

## Reasoning

| Metric                   | Value |
| ------------------------ | ----- |
| Turns with Reasoning     | 1 / 3 |
| Avg Reasoning Chars/Turn | 9     |

## Behavioral Signals

- ✅ Excellent turn efficiency — completed in 3 turn(s)
- 📖 Read before edit pattern on: src/index.ts
