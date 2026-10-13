# 📊 Sandbox Test Report: complex_debugging

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
| Total Input Tokens        | 8,485    |
| Total Output Tokens       | 1,727    |
| Avg Input/Turn            | 2,828    |
| Avg Output/Turn           | 576      |
| Token Efficiency (out/in) | 0.204    |
| Estimated Cost            | $0.00137 |

## Tool Usage

| Metric            | Value                                              |
| ----------------- | -------------------------------------------------- |
| Total Tool Calls  | 5                                                  |
| Unique Tools Used | write_to_file, execute_command, attempt_completion |
| Redundant Reads   | 0                                                  |
| Failed Tool Calls | 0                                                  |

### Tool Call Breakdown

| Tool               | Count |
| ------------------ | ----- |
| write_to_file      | 3     |
| execute_command    | 1     |
| attempt_completion | 1     |

## Latency

| Metric        | Value |
| ------------- | ----- |
| Total Latency | 5.7s  |
| Avg per Turn  | 1.9s  |
| Fastest Turn  | 1.3s  |
| Slowest Turn  | 2.6s  |

## Reasoning

| Metric                   | Value |
| ------------------------ | ----- |
| Turns with Reasoning     | 0 / 3 |
| Avg Reasoning Chars/Turn | 0     |

## Behavioral Signals

- ✅ Excellent turn efficiency — completed in 3 turn(s)
- 🧠 No reasoning detected — model may not be using thinking mode
