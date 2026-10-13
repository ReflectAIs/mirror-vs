# 📊 Sandbox Test Report: event_emitter_refactor

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
| Total Input Tokens        | 7,035    |
| Total Output Tokens       | 1,175    |
| Avg Input/Turn            | 2,345    |
| Avg Output/Turn           | 392      |
| Token Efficiency (out/in) | 0.167    |
| Estimated Cost            | $0.00106 |

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
| Total Latency | 5.8s  |
| Avg per Turn  | 1.9s  |
| Fastest Turn  | 0.9s  |
| Slowest Turn  | 2.8s  |

## Reasoning

| Metric                   | Value |
| ------------------------ | ----- |
| Turns with Reasoning     | 0 / 3 |
| Avg Reasoning Chars/Turn | 0     |

## Behavioral Signals

- ✅ Excellent turn efficiency — completed in 3 turn(s)
- 🧠 No reasoning detected — model may not be using thinking mode
