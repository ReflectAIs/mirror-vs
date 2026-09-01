# 📊 Sandbox Test Report: duplicate_code_blocks

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
| Total Input Tokens        | 4,631    |
| Total Output Tokens       | 269      |
| Avg Input/Turn            | 1,544    |
| Avg Output/Turn           | 90       |
| Token Efficiency (out/in) | 0.058    |
| Estimated Cost            | $0.00054 |

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
| Total Latency | 3.3s  |
| Avg per Turn  | 1.1s  |
| Fastest Turn  | 1.0s  |
| Slowest Turn  | 1.2s  |

## Reasoning

| Metric                   | Value |
| ------------------------ | ----- |
| Turns with Reasoning     | 2 / 3 |
| Avg Reasoning Chars/Turn | 17    |

## Behavioral Signals

- ✅ Excellent turn efficiency — completed in 3 turn(s)
- 📖 Read before edit pattern on: src/handlers.ts
