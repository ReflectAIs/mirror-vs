# 📋 Sandbox Test Summary

| Scenario              | Turns | Tools | Redundant Reads | Errors | Input Tokens | Output Tokens | Cost     | Status |
| --------------------- | ----- | ----- | --------------- | ------ | ------------ | ------------- | -------- | ------ |
| simple_edit           | 3     | 3     | 0               | 0      | 4,432        | 227           | $0.00051 | ✅     |
| bug_fix               | 4     | 6     | 0               | 0      | 7,691        | 829           | $0.00102 | ✅     |
| feature_add           | 4     | 6     | 0               | 0      | 7,224        | 839           | $0.00097 | ✅     |
| multi_file_refactor   | 4     | 12    | 0               | 0      | 9,560        | 1,056         | $0.00127 | ✅     |
| exploration           | 3     | 4     | 0               | 0      | 6,083        | 984           | $0.0009  | ✅     |
| error_recovery        | 3     | 3     | 0               | 0      | 4,415        | 205           | $0.0005  | ✅     |
| duplicate_code_blocks | 3     | 3     | 0               | 0      | 4,631        | 269           | $0.00054 | ✅     |
| whitespace_indent     | 3     | 3     | 0               | 0      | 4,853        | 330           | $0.00058 | ✅     |

---

# 📊 Sandbox Test Report: simple_edit

**Model**: deepseek-v4-flash
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
| Total Input Tokens        | 4,432    |
| Total Output Tokens       | 227      |
| Avg Input/Turn            | 1,477    |
| Avg Output/Turn           | 76       |
| Token Efficiency (out/in) | 0.051    |
| Estimated Cost            | $0.00051 |

## Tool Usage

| Metric            | Value                                     |
| ----------------- | ----------------------------------------- |
| Total Tool Calls  | 3                                         |
| Unique Tools Used | read_file, apply_diff, attempt_completion |
| Redundant Reads   | 0                                         |
| Failed Tool Calls | 0                                         |

### Tool Call Breakdown

| Tool               | Count |
| ------------------ | ----- |
| read_file          | 1     |
| apply_diff         | 1     |
| attempt_completion | 1     |

## Latency

| Metric        | Value |
| ------------- | ----- |
| Total Latency | 3.6s  |
| Avg per Turn  | 1.2s  |
| Fastest Turn  | 1.0s  |
| Slowest Turn  | 1.3s  |

## Reasoning

| Metric                   | Value |
| ------------------------ | ----- |
| Turns with Reasoning     | 1 / 3 |
| Avg Reasoning Chars/Turn | 9     |

## Behavioral Signals

- ✅ Excellent turn efficiency — completed in 3 turn(s)
- 📖 Read before edit pattern on: src/index.ts

# 📊 Sandbox Test Report: bug_fix

**Model**: deepseek-v4-flash
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
| Total Input Tokens        | 7,691    |
| Total Output Tokens       | 829      |
| Avg Input/Turn            | 1,923    |
| Avg Output/Turn           | 207      |
| Token Efficiency (out/in) | 0.108    |
| Estimated Cost            | $0.00102 |

## Tool Usage

| Metric            | Value                                                      |
| ----------------- | ---------------------------------------------------------- |
| Total Tool Calls  | 6                                                          |
| Unique Tools Used | read_file, apply_diff, execute_command, attempt_completion |
| Redundant Reads   | 0                                                          |
| Failed Tool Calls | 0                                                          |

### Tool Call Breakdown

| Tool               | Count |
| ------------------ | ----- |
| read_file          | 3     |
| apply_diff         | 1     |
| execute_command    | 1     |
| attempt_completion | 1     |

## Latency

| Metric        | Value |
| ------------- | ----- |
| Total Latency | 8.2s  |
| Avg per Turn  | 2.1s  |
| Fastest Turn  | 1.4s  |
| Slowest Turn  | 3.2s  |

## Reasoning

| Metric                   | Value |
| ------------------------ | ----- |
| Turns with Reasoning     | 3 / 4 |
| Avg Reasoning Chars/Turn | 286   |

## Behavioral Signals

- 📖 Read before edit pattern on: src/calculator.ts
- ⚡ 1 turn(s) batched multiple read-only tools

# 📊 Sandbox Test Report: feature_add

**Model**: deepseek-v4-flash
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
| Total Input Tokens        | 7,224    |
| Total Output Tokens       | 839      |
| Avg Input/Turn            | 1,806    |
| Avg Output/Turn           | 210      |
| Token Efficiency (out/in) | 0.116    |
| Estimated Cost            | $0.00097 |

## Tool Usage

| Metric            | Value                                     |
| ----------------- | ----------------------------------------- |
| Total Tool Calls  | 6                                         |
| Unique Tools Used | read_file, apply_diff, attempt_completion |
| Redundant Reads   | 0                                         |
| Failed Tool Calls | 0                                         |

### Tool Call Breakdown

| Tool               | Count |
| ------------------ | ----- |
| read_file          | 3     |
| apply_diff         | 2     |
| attempt_completion | 1     |

## Latency

| Metric        | Value |
| ------------- | ----- |
| Total Latency | 7.5s  |
| Avg per Turn  | 1.9s  |
| Fastest Turn  | 1.3s  |
| Slowest Turn  | 2.7s  |

## Reasoning

| Metric                   | Value |
| ------------------------ | ----- |
| Turns with Reasoning     | 3 / 4 |
| Avg Reasoning Chars/Turn | 210   |

## Behavioral Signals

- 📖 Read before edit pattern on: src/helpers.ts, src/index.ts
- ⚡ 1 turn(s) batched multiple read-only tools

# 📊 Sandbox Test Report: multi_file_refactor

**Model**: deepseek-v4-flash
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
| Total Input Tokens        | 9,560    |
| Total Output Tokens       | 1,056    |
| Avg Input/Turn            | 2,390    |
| Avg Output/Turn           | 264      |
| Token Efficiency (out/in) | 0.11     |
| Estimated Cost            | $0.00127 |

## Tool Usage

| Metric            | Value                                                   |
| ----------------- | ------------------------------------------------------- |
| Total Tool Calls  | 12                                                      |
| Unique Tools Used | search_files, read_file, apply_diff, attempt_completion |
| Redundant Reads   | 0                                                       |
| Failed Tool Calls | 0                                                       |

### Tool Call Breakdown

| Tool               | Count |
| ------------------ | ----- |
| read_file          | 5     |
| apply_diff         | 4     |
| search_files       | 2     |
| attempt_completion | 1     |

## Latency

| Metric        | Value |
| ------------- | ----- |
| Total Latency | 7.9s  |
| Avg per Turn  | 2.0s  |
| Fastest Turn  | 1.3s  |
| Slowest Turn  | 3.3s  |

## Reasoning

| Metric                   | Value |
| ------------------------ | ----- |
| Turns with Reasoning     | 4 / 4 |
| Avg Reasoning Chars/Turn | 78    |

## Behavioral Signals

- 📖 Read before edit pattern on: src/auth.ts, src/api.ts, src/middleware.ts, src/tests/auth.test.ts
- ⚡ 1 turn(s) batched multiple read-only tools

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

# 📊 Sandbox Test Report: error_recovery

**Model**: deepseek-v4-flash
**Status**: ✅ Completed

## Turn Efficiency

| Metric              | Value |
| ------------------- | ----- |
| Total Turns         | 3     |
| Wasted Turns        | 0     |
| Turns to Completion | 3     |

## Token Usage

| Metric                    | Value   |
| ------------------------- | ------- |
| Total Input Tokens        | 4,415   |
| Total Output Tokens       | 205     |
| Avg Input/Turn            | 1,472   |
| Avg Output/Turn           | 68      |
| Token Efficiency (out/in) | 0.046   |
| Estimated Cost            | $0.0005 |

## Tool Usage

| Metric            | Value                                     |
| ----------------- | ----------------------------------------- |
| Total Tool Calls  | 3                                         |
| Unique Tools Used | read_file, apply_diff, attempt_completion |
| Redundant Reads   | 0                                         |
| Failed Tool Calls | 0                                         |

### Tool Call Breakdown

| Tool               | Count |
| ------------------ | ----- |
| read_file          | 1     |
| apply_diff         | 1     |
| attempt_completion | 1     |

## Latency

| Metric        | Value |
| ------------- | ----- |
| Total Latency | 3.3s  |
| Avg per Turn  | 1.1s  |
| Fastest Turn  | 0.8s  |
| Slowest Turn  | 1.4s  |

## Reasoning

| Metric                   | Value |
| ------------------------ | ----- |
| Turns with Reasoning     | 1 / 3 |
| Avg Reasoning Chars/Turn | 10    |

## Behavioral Signals

- ✅ Excellent turn efficiency — completed in 3 turn(s)
- 📖 Read before edit pattern on: lib/config.ts

# 📊 Sandbox Test Report: duplicate_code_blocks

**Model**: deepseek-v4-flash
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
| Total Input Tokens        | 4,631    |
| Total Output Tokens       | 269      |
| Avg Input/Turn            | 1,544    |
| Avg Output/Turn           | 90       |
| Token Efficiency (out/in) | 0.058    |
| Estimated Cost            | $0.00054 |

## Tool Usage

| Metric            | Value                                     |
| ----------------- | ----------------------------------------- |
| Total Tool Calls  | 3                                         |
| Unique Tools Used | read_file, apply_diff, attempt_completion |
| Redundant Reads   | 0                                         |
| Failed Tool Calls | 0                                         |

### Tool Call Breakdown

| Tool               | Count |
| ------------------ | ----- |
| read_file          | 1     |
| apply_diff         | 1     |
| attempt_completion | 1     |

## Latency

| Metric        | Value |
| ------------- | ----- |
| Total Latency | 3.3s  |
| Avg per Turn  | 1.1s  |
| Fastest Turn  | 1.0s  |
| Slowest Turn  | 1.2s  |

## Reasoning

| Metric                   | Value |
| ------------------------ | ----- |
| Turns with Reasoning     | 2 / 3 |
| Avg Reasoning Chars/Turn | 17    |

## Behavioral Signals

- ✅ Excellent turn efficiency — completed in 3 turn(s)
- 📖 Read before edit pattern on: src/handlers.ts

# 📊 Sandbox Test Report: whitespace_indent

**Model**: deepseek-v4-flash
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
| Total Input Tokens        | 4,853    |
| Total Output Tokens       | 330      |
| Avg Input/Turn            | 1,618    |
| Avg Output/Turn           | 110      |
| Token Efficiency (out/in) | 0.068    |
| Estimated Cost            | $0.00058 |

## Tool Usage

| Metric            | Value                                     |
| ----------------- | ----------------------------------------- |
| Total Tool Calls  | 3                                         |
| Unique Tools Used | read_file, apply_diff, attempt_completion |
| Redundant Reads   | 0                                         |
| Failed Tool Calls | 0                                         |

### Tool Call Breakdown

| Tool               | Count |
| ------------------ | ----- |
| read_file          | 1     |
| apply_diff         | 1     |
| attempt_completion | 1     |

## Latency

| Metric        | Value |
| ------------- | ----- |
| Total Latency | 4.1s  |
| Avg per Turn  | 1.4s  |
| Fastest Turn  | 1.0s  |
| Slowest Turn  | 1.8s  |

## Reasoning

| Metric                   | Value |
| ------------------------ | ----- |
| Turns with Reasoning     | 2 / 3 |
| Avg Reasoning Chars/Turn | 56    |

## Behavioral Signals

- ✅ Excellent turn efficiency — completed in 3 turn(s)
- 📖 Read before edit pattern on: src/matrix.ts
