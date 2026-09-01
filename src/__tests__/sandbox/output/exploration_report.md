# 📊 Sandbox Test Report: exploration

**Model**: deepseek-v4-flash
**Status**: ✅ Completed

## Turn Efficiency

| Metric              | Value |
| ------------------- | ----- |
| Total Turns         | 3     |
| Wasted Turns        | 1     |
| Turns to Completion | 3     |

## Token Usage

| Metric                    | Value   |
| ------------------------- | ------- |
| Total Input Tokens        | 6,083   |
| Total Output Tokens       | 984     |
| Avg Input/Turn            | 2,028   |
| Avg Output/Turn           | 328     |
| Token Efficiency (out/in) | 0.162   |
| Estimated Cost            | $0.0009 |

## Tool Usage

| Metric            | Value                         |
| ----------------- | ----------------------------- |
| Total Tool Calls  | 4                             |
| Unique Tools Used | read_file, attempt_completion |
| Redundant Reads   | 0                             |
| Failed Tool Calls | 0                             |

### Tool Call Breakdown

| Tool               | Count |
| ------------------ | ----- |
| read_file          | 3     |
| attempt_completion | 1     |

## Latency

| Metric        | Value |
| ------------- | ----- |
| Total Latency | 8.6s  |
| Avg per Turn  | 2.9s  |
| Fastest Turn  | 1.2s  |
| Slowest Turn  | 4.0s  |

## Reasoning

| Metric                   | Value |
| ------------------------ | ----- |
| Turns with Reasoning     | 3 / 3 |
| Avg Reasoning Chars/Turn | 176   |

## Behavioral Signals

- 🔄 1 wasted turn(s) with no useful tool calls
- ✅ Excellent turn efficiency — completed in 3 turn(s)
- ⚡ 1 turn(s) batched multiple read-only tools
