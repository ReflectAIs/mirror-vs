# 📊 Sandbox Test Report: bug_fix

**Model**: accounts/fireworks/models/glm-5p3-flash
**Status**: ✅ Completed

## Turn Efficiency

| Metric              | Value |
| ------------------- | ----- |
| Total Turns         | 2     |
| Wasted Turns        | 0     |
| Turns to Completion | 2     |

## Token Usage

| Metric                    | Value   |
| ------------------------- | ------- |
| Total Input Tokens        | 3,009   |
| Total Output Tokens       | 660     |
| Avg Input/Turn            | 1,505   |
| Avg Output/Turn           | 330     |
| Token Efficiency (out/in) | 0.219   |
| Estimated Cost            | $0.0005 |

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
| Total Latency | 6.7s  |
| Avg per Turn  | 3.3s  |
| Fastest Turn  | 2.9s  |
| Slowest Turn  | 3.8s  |

## Reasoning

| Metric                   | Value |
| ------------------------ | ----- |
| Turns with Reasoning     | 1 / 2 |
| Avg Reasoning Chars/Turn | 642   |

## Behavioral Signals

- ✅ Excellent turn efficiency — completed in 2 turn(s)
