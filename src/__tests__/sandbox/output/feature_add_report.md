# 📊 Sandbox Test Report: feature_add

**Model**: accounts/fireworks/models/glm-5p3-flash
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
| Total Input Tokens        | 7,456    |
| Total Output Tokens       | 1,916    |
| Avg Input/Turn            | 2,485    |
| Avg Output/Turn           | 639      |
| Token Efficiency (out/in) | 0.257    |
| Estimated Cost            | $0.00132 |

## Tool Usage

| Metric            | Value                          |
| ----------------- | ------------------------------ |
| Total Tool Calls  | 3                              |
| Unique Tools Used | apply_diff, attempt_completion |
| Redundant Reads   | 0                              |
| Failed Tool Calls | 0                              |

### Tool Call Breakdown

| Tool               | Count |
| ------------------ | ----- |
| apply_diff         | 2     |
| attempt_completion | 1     |

## Latency

| Metric        | Value |
| ------------- | ----- |
| Total Latency | 13.8s |
| Avg per Turn  | 4.6s  |
| Fastest Turn  | 1.2s  |
| Slowest Turn  | 11.3s |

## Reasoning

| Metric                   | Value |
| ------------------------ | ----- |
| Turns with Reasoning     | 1 / 3 |
| Avg Reasoning Chars/Turn | 1946  |

## Behavioral Signals

- ✅ Excellent turn efficiency — completed in 3 turn(s)
