# 📊 Sandbox Test Report: exploration

**Model**: deepseek/deepseek-v4-flash-0731
**Status**: ✅ Completed

## Turn Efficiency

| Metric              | Value |
| ------------------- | ----- |
| Total Turns         | 2     |
| Wasted Turns        | 1     |
| Turns to Completion | 2     |

## Token Usage

| Metric                    | Value    |
| ------------------------- | -------- |
| Total Input Tokens        | 4,432    |
| Total Output Tokens       | 957      |
| Avg Input/Turn            | 2,216    |
| Avg Output/Turn           | 479      |
| Token Efficiency (out/in) | 0.216    |
| Estimated Cost            | $0.00073 |

## Tool Usage

| Metric            | Value              |
| ----------------- | ------------------ |
| Total Tool Calls  | 1                  |
| Unique Tools Used | attempt_completion |
| Redundant Reads   | 0                  |
| Failed Tool Calls | 0                  |

### Tool Call Breakdown

| Tool               | Count |
| ------------------ | ----- |
| attempt_completion | 1     |

## Latency

| Metric        | Value |
| ------------- | ----- |
| Total Latency | 5.8s  |
| Avg per Turn  | 2.9s  |
| Fastest Turn  | 2.0s  |
| Slowest Turn  | 3.7s  |

## Reasoning

| Metric                   | Value |
| ------------------------ | ----- |
| Turns with Reasoning     | 0 / 2 |
| Avg Reasoning Chars/Turn | 0     |

## Behavioral Signals

- 🔄 1 wasted turn(s) with no useful tool calls
- ✅ Excellent turn efficiency — completed in 2 turn(s)
- 🧠 No reasoning detected — model may not be using thinking mode
