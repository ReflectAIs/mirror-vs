# 📊 Sandbox Test Report: feature_add

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
| Total Input Tokens        | 7,224    |
| Total Output Tokens       | 839      |
| Avg Input/Turn            | 1,806    |
| Avg Output/Turn           | 210      |
| Token Efficiency (out/in) | 0.116    |
| Estimated Cost            | $0.00097 |

## Tool Usage

| Metric            | Value                                     |
| ----------------- | ----------------------------------------- |
| Total Tool Calls  | 6                                         |
| Unique Tools Used | read_file, apply_diff, attempt_completion |
| Redundant Reads   | 0                                         |
| Failed Tool Calls | 0                                         |

### Tool Call Breakdown

| Tool               | Count |
| ------------------ | ----- |
| read_file          | 3     |
| apply_diff         | 2     |
| attempt_completion | 1     |

## Latency

| Metric        | Value |
| ------------- | ----- |
| Total Latency | 7.5s  |
| Avg per Turn  | 1.9s  |
| Fastest Turn  | 1.3s  |
| Slowest Turn  | 2.7s  |

## Reasoning

| Metric                   | Value |
| ------------------------ | ----- |
| Turns with Reasoning     | 3 / 4 |
| Avg Reasoning Chars/Turn | 210   |

## Behavioral Signals

- 📖 Read before edit pattern on: src/helpers.ts, src/index.ts
- ⚡ 1 turn(s) batched multiple read-only tools
