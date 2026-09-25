# 📋 Sandbox Test Summary

| Scenario                    | Turns | Tools | Redundant Reads | Errors | Input Tokens | Output Tokens | Cost     | Status |
| --------------------------- | ----- | ----- | --------------- | ------ | ------------ | ------------- | -------- | ------ |
| simple_edit                 | 2     | 2     | 0               | 0      | 2,581        | 157           | $0.00031 | ✅     |
| bug_fix                     | 2     | 2     | 0               | 0      | 3,009        | 660           | $0.0005  | ✅     |
| feature_add                 | 3     | 3     | 0               | 0      | 7,456        | 1,916         | $0.00132 | ✅     |
| duplicate_code_blocks       | 2     | 2     | 0               | 0      | 2,698        | 201           | $0.00033 | ✅     |
| whitespace_indent           | 2     | 2     | 0               | 0      | 2,836        | 217           | $0.00035 | ✅     |
| exploration                 | 1     | 1     | 0               | 0      | 1,368        | 1,051         | $0.00045 | ✅     |
| large_file_edit             | 2     | 2     | 0               | 0      | 2,922        | 130           | $0.00033 | ✅     |
| mirror_add_param_validation | 2     | 2     | 0               | 0      | 3,273        | 409           | $0.00045 | ✅     |

---

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

# 📊 Sandbox Test Report: duplicate_code_blocks

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
| Total Input Tokens        | 2,698    |
| Total Output Tokens       | 201      |
| Avg Input/Turn            | 1,349    |
| Avg Output/Turn           | 101      |
| Token Efficiency (out/in) | 0.074    |
| Estimated Cost            | $0.00033 |

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
| Total Latency | 4.3s  |
| Avg per Turn  | 2.2s  |
| Fastest Turn  | 1.4s  |
| Slowest Turn  | 2.9s  |

## Reasoning

| Metric                   | Value |
| ------------------------ | ----- |
| Turns with Reasoning     | 1 / 2 |
| Avg Reasoning Chars/Turn | 161   |

## Behavioral Signals

- ✅ Excellent turn efficiency — completed in 2 turn(s)

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

# 📊 Sandbox Test Report: exploration

**Model**: accounts/fireworks/models/glm-5p3-flash
**Status**: ✅ Completed

## Turn Efficiency

| Metric              | Value |
| ------------------- | ----- |
| Total Turns         | 1     |
| Wasted Turns        | 0     |
| Turns to Completion | 1     |

## Token Usage

| Metric                    | Value    |
| ------------------------- | -------- |
| Total Input Tokens        | 1,368    |
| Total Output Tokens       | 1,051    |
| Avg Input/Turn            | 1,368    |
| Avg Output/Turn           | 1,051    |
| Token Efficiency (out/in) | 0.768    |
| Estimated Cost            | $0.00045 |

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
| Total Latency | 9.3s  |
| Avg per Turn  | 9.3s  |
| Fastest Turn  | 9.3s  |
| Slowest Turn  | 9.3s  |

## Reasoning

| Metric                   | Value |
| ------------------------ | ----- |
| Turns with Reasoning     | 1 / 1 |
| Avg Reasoning Chars/Turn | 2595  |

## Behavioral Signals

- ✅ Excellent turn efficiency — completed in 1 turn(s)

# 📊 Sandbox Test Report: large_file_edit

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
| Total Input Tokens        | 2,922    |
| Total Output Tokens       | 130      |
| Avg Input/Turn            | 1,461    |
| Avg Output/Turn           | 65       |
| Token Efficiency (out/in) | 0.044    |
| Estimated Cost            | $0.00033 |

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
| Fastest Turn  | 0.8s  |
| Slowest Turn  | 1.3s  |

## Reasoning

| Metric                   | Value |
| ------------------------ | ----- |
| Turns with Reasoning     | 1 / 2 |
| Avg Reasoning Chars/Turn | 92    |

## Behavioral Signals

- ✅ Excellent turn efficiency — completed in 2 turn(s)

# 📊 Sandbox Test Report: mirror_add_param_validation

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
| Total Input Tokens        | 3,273    |
| Total Output Tokens       | 409      |
| Avg Input/Turn            | 1,637    |
| Avg Output/Turn           | 205      |
| Token Efficiency (out/in) | 0.125    |
| Estimated Cost            | $0.00045 |

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
| Total Latency | 5.0s  |
| Avg per Turn  | 2.5s  |
| Fastest Turn  | 2.2s  |
| Slowest Turn  | 2.8s  |

## Reasoning

| Metric                   | Value |
| ------------------------ | ----- |
| Turns with Reasoning     | 1 / 2 |
| Avg Reasoning Chars/Turn | 360   |

## Behavioral Signals

- ✅ Excellent turn efficiency — completed in 2 turn(s)
