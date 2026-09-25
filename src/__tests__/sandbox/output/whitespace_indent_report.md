# 📊 Sandbox Test Report: whitespace_indent

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
| Total Input Tokens        | 2,836    |
| Total Output Tokens       | 217      |
| Avg Input/Turn            | 1,418    |
| Avg Output/Turn           | 109      |
| Token Efficiency (out/in) | 0.077    |
| Estimated Cost            | $0.00035 |

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
| Total Latency | 2.1s  |
| Avg per Turn  | 1.1s  |
| Fastest Turn  | 0.9s  |
| Slowest Turn  | 1.2s  |

## Reasoning

| Metric                   | Value |
| ------------------------ | ----- |
| Turns with Reasoning     | 1 / 2 |
| Avg Reasoning Chars/Turn | 84    |

## Behavioral Signals

- ✅ Excellent turn efficiency — completed in 2 turn(s)
