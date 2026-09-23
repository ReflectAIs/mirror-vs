# 📋 Sandbox Test Summary

| Scenario    | Turns | Tools | Redundant Reads | Errors | Input Tokens | Output Tokens | Cost     | Status |
| ----------- | ----- | ----- | --------------- | ------ | ------------ | ------------- | -------- | ------ |
| feature_add | 4     | 4     | 0               | 0      | 7,237        | 842           | $0.00098 | ✅     |

---

# 📊 Sandbox Test Report: feature_add

**Model**: accounts/fireworks/models/glm-5p3-flash
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
| Total Input Tokens        | 7,237    |
| Total Output Tokens       | 842      |
| Avg Input/Turn            | 1,809    |
| Avg Output/Turn           | 211      |
| Token Efficiency (out/in) | 0.116    |
| Estimated Cost            | $0.00098 |

## Tool Usage

| Metric            | Value                                           |
| ----------------- | ----------------------------------------------- |
| Total Tool Calls  | 4                                               |
| Unique Tools Used | apply_diff, execute_command, attempt_completion |
| Redundant Reads   | 0                                               |
| Failed Tool Calls | 0                                               |

### Tool Call Breakdown

| Tool               | Count |
| ------------------ | ----- |
| apply_diff         | 2     |
| execute_command    | 1     |
| attempt_completion | 1     |

## Latency

| Metric        | Value |
| ------------- | ----- |
| Total Latency | 9.7s  |
| Avg per Turn  | 2.4s  |
| Fastest Turn  | 0.8s  |
| Slowest Turn  | 6.2s  |

## Reasoning

| Metric                   | Value |
| ------------------------ | ----- |
| Turns with Reasoning     | 2 / 4 |
| Avg Reasoning Chars/Turn | 341   |

## Behavioral Signals
