# 📊 Sandbox Test Report: bug_fix

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
| Total Input Tokens        | 7,691    |
| Total Output Tokens       | 829      |
| Avg Input/Turn            | 1,923    |
| Avg Output/Turn           | 207      |
| Token Efficiency (out/in) | 0.108    |
| Estimated Cost            | $0.00102 |

## Tool Usage

| Metric            | Value                                                      |
| ----------------- | ---------------------------------------------------------- |
| Total Tool Calls  | 6                                                          |
| Unique Tools Used | read_file, apply_diff, execute_command, attempt_completion |
| Redundant Reads   | 0                                                          |
| Failed Tool Calls | 0                                                          |

### Tool Call Breakdown

| Tool               | Count |
| ------------------ | ----- |
| read_file          | 3     |
| apply_diff         | 1     |
| execute_command    | 1     |
| attempt_completion | 1     |

## Latency

| Metric        | Value |
| ------------- | ----- |
| Total Latency | 8.2s  |
| Avg per Turn  | 2.1s  |
| Fastest Turn  | 1.4s  |
| Slowest Turn  | 3.2s  |

## Reasoning

| Metric                   | Value |
| ------------------------ | ----- |
| Turns with Reasoning     | 3 / 4 |
| Avg Reasoning Chars/Turn | 286   |

## Behavioral Signals

- 📖 Read before edit pattern on: src/calculator.ts
- ⚡ 1 turn(s) batched multiple read-only tools
