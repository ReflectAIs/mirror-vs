# 📊 Sandbox Test Report: multi_file_refactor

**Model**: deepseek-v4-flash
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
| Total Input Tokens        | 9,560    |
| Total Output Tokens       | 1,056    |
| Avg Input/Turn            | 2,390    |
| Avg Output/Turn           | 264      |
| Token Efficiency (out/in) | 0.11     |
| Estimated Cost            | $0.00127 |

## Tool Usage

| Metric            | Value                                                   |
| ----------------- | ------------------------------------------------------- |
| Total Tool Calls  | 12                                                      |
| Unique Tools Used | search_files, read_file, apply_diff, attempt_completion |
| Redundant Reads   | 0                                                       |
| Failed Tool Calls | 0                                                       |

### Tool Call Breakdown

| Tool               | Count |
| ------------------ | ----- |
| read_file          | 5     |
| apply_diff         | 4     |
| search_files       | 2     |
| attempt_completion | 1     |

## Latency

| Metric        | Value |
| ------------- | ----- |
| Total Latency | 7.9s  |
| Avg per Turn  | 2.0s  |
| Fastest Turn  | 1.3s  |
| Slowest Turn  | 3.3s  |

## Reasoning

| Metric                   | Value |
| ------------------------ | ----- |
| Turns with Reasoning     | 4 / 4 |
| Avg Reasoning Chars/Turn | 78    |

## Behavioral Signals

- 📖 Read before edit pattern on: src/auth.ts, src/api.ts, src/middleware.ts, src/tests/auth.test.ts
- ⚡ 1 turn(s) batched multiple read-only tools
