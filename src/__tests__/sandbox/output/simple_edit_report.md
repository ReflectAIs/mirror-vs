# 📊 Sandbox Test Report: simple_edit

**Model**: accounts/fireworks/models/glm-5p3-flash
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
| Total Input Tokens        | 2,581    |
| Total Output Tokens       | 157      |
| Avg Input/Turn            | 1,291    |
| Avg Output/Turn           | 79       |
| Token Efficiency (out/in) | 0.061    |
| Estimated Cost            | $0.00031 |

## Tool Usage

| Metric            | Value                          |
| ----------------- | ------------------------------ |
| Total Tool Calls  | 2                              |
| Unique Tools Used | apply_diff, attempt_completion |
| Redundant Reads   | 0                              |
| Failed Tool Calls | 0                              |

### Tool Call Breakdown

| Tool               | Count |
| ------------------ | ----- |
| apply_diff         | 1     |
| attempt_completion | 1     |

## Latency

| Metric        | Value |
| ------------- | ----- |
| Total Latency | 2.2s  |
| Avg per Turn  | 1.1s  |
| Fastest Turn  | 0.7s  |
| Slowest Turn  | 1.5s  |

## Reasoning

| Metric                   | Value |
| ------------------------ | ----- |
| Turns with Reasoning     | 1 / 2 |
| Avg Reasoning Chars/Turn | 123   |

## Behavioral Signals

- ✅ Excellent turn efficiency — completed in 2 turn(s)
