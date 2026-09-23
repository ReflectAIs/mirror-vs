# 📊 Sandbox Test Report: bug_fix

**Model**: accounts/fireworks/models/glm-5p3-flash
**Status**: ✅ Completed

## Turn Efficiency

| Metric              | Value |
| ------------------- | ----- |
| Total Turns         | 5     |
| Wasted Turns        | 0     |
| Turns to Completion | 5     |

## Token Usage

| Metric                    | Value    |
| ------------------------- | -------- |
| Total Input Tokens        | 10,403   |
| Total Output Tokens       | 1,403    |
| Avg Input/Turn            | 2,081    |
| Avg Output/Turn           | 281      |
| Token Efficiency (out/in) | 0.135    |
| Estimated Cost            | $0.00146 |

## Tool Usage

| Metric            | Value                                                          |
| ----------------- | -------------------------------------------------------------- |
| Total Tool Calls  | 5                                                              |
| Unique Tools Used | apply_diff, execute_command, write_to_file, attempt_completion |
| Redundant Reads   | 0                                                              |
| Failed Tool Calls | 1                                                              |

### Tool Call Breakdown

| Tool               | Count |
| ------------------ | ----- |
| execute_command    | 2     |
| apply_diff         | 1     |
| write_to_file      | 1     |
| attempt_completion | 1     |

## Latency

| Metric        | Value |
| ------------- | ----- |
| Total Latency | 10.6s |
| Avg per Turn  | 2.1s  |
| Fastest Turn  | 0.5s  |
| Slowest Turn  | 4.1s  |

## Reasoning

| Metric                   | Value |
| ------------------------ | ----- |
| Turns with Reasoning     | 3 / 5 |
| Avg Reasoning Chars/Turn | 502   |

## Behavioral Signals

- ❌ 1 tool call(s) returned errors
