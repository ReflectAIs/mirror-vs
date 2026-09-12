# 📋 Sandbox Test Summary

| Scenario | Turns | Tools | Redundant Reads | Errors | Input Tokens | Output Tokens | Cost | Status |
|----------|-------|-------|-----------------|--------|--------------|---------------|------|--------|
| simple_edit | 2 | 2 | 0 | 0 | 2,580 | 155 | $0.0003 | ✅ |
| bug_fix | 3 | 3 | 0 | 0 | 5,438 | 1,151 | $0.00089 | ✅ |
| feature_add | 3 | 3 | 0 | 0 | 5,100 | 736 | $0.00073 | ✅ |
| error_recovery | 2 | 2 | 0 | 0 | 2,575 | 140 | $0.0003 | ✅ |
| duplicate_code_blocks | 2 | 2 | 0 | 0 | 2,811 | 312 | $0.00037 | ✅ |
| whitespace_indent | 2 | 2 | 0 | 0 | 2,880 | 262 | $0.00037 | ✅ |
| exploration | 1 | 1 | 0 | 0 | 1,370 | 967 | $0.00043 | ✅ |
| multi_file_refactor | 7 | 7 | 0 | 0 | 12,898 | 684 | $0.0015 | ✅ |
| typescript_generics | 3 | 3 | 0 | 0 | 8,518 | 2,522 | $0.00161 | ✅ |
| async_await_refactor | 3 | 3 | 0 | 0 | 7,771 | 2,274 | $0.00146 | ✅ |
| large_file_edit | 2 | 2 | 0 | 0 | 2,911 | 119 | $0.00033 | ✅ |
| parallelism_test | 3 | 3 | 0 | 0 | 6,631 | 1,323 | $0.00106 | ✅ |
| write_unit_tests | 4 | 4 | 0 | 0 | 26,432 | 7,590 | $0.00492 | ✅ |
| security_vulnerability | 4 | 4 | 0 | 0 | 10,358 | 2,075 | $0.00166 | ✅ |
| performance_optimization | 2 | 2 | 0 | 0 | 3,392 | 539 | $0.0005 | ✅ |
| complex_debugging | 5 | 5 | 0 | 0 | 10,883 | 1,394 | $0.00151 | ✅ |
| api_integration | 3 | 3 | 0 | 0 | 6,627 | 711 | $0.00088 | ✅ |
| dependency_injection | 5 | 5 | 0 | 0 | 20,744 | 3,836 | $0.00323 | ✅ |
| db_schema_migration | 5 | 5 | 0 | 0 | 21,337 | 3,508 | $0.00319 | ✅ |
| mirror_add_param_validation | 2 | 2 | 0 | 0 | 3,273 | 409 | $0.00045 | ✅ |
| mirror_fix_repetition_detector | 4 | 4 | 0 | 0 | 16,164 | 3,124 | $0.00255 | ✅ |
| mirror_extract_shared_util | 5 | 5 | 0 | 0 | 17,925 | 2,143 | $0.00244 | ✅ |
| mirror_add_new_tool | 2 | 2 | 0 | 0 | 6,091 | 2,115 | $0.00124 | ✅ |
| mirror_add_keyboard_shortcut | 2 | 2 | 0 | 0 | 4,874 | 959 | $0.00078 | ✅ |
| mirror_add_jsdoc | 4 | 4 | 0 | 0 | 20,894 | 4,697 | $0.0035 | ✅ |
| mirror_fix_controlled_component | 5 | 5 | 0 | 0 | 17,828 | 1,736 | $0.0023 | ✅ |
| mirror_rename_across_files | 9 | 9 | 0 | 0 | 27,333 | 1,280 | $0.00312 | ✅ |
| mirror_add_retry_logic | 4 | 4 | 0 | 0 | 12,612 | 2,313 | $0.00196 | ✅ |



---



# 📊 Sandbox Test Report: simple_edit
**Model**: accounts/fireworks/models/glm-5p3-flash
**Status**: ✅ Completed

## Turn Efficiency
| Metric | Value |
|--------|-------|
| Total Turns | 2 |
| Wasted Turns | 0 |
| Turns to Completion | 2 |

## Token Usage
| Metric | Value |
|--------|-------|
| Total Input Tokens | 2,580 |
| Total Output Tokens | 155 |
| Avg Input/Turn | 1,290 |
| Avg Output/Turn | 78 |
| Token Efficiency (out/in) | 0.06 |
| Estimated Cost | $0.0003 |

## Tool Usage
| Metric | Value |
|--------|-------|
| Total Tool Calls | 2 |
| Unique Tools Used | apply_diff, attempt_completion |
| Redundant Reads | 0 |
| Failed Tool Calls | 0 |

### Tool Call Breakdown
| Tool | Count |
|------|-------|
| apply_diff | 1 |
| attempt_completion | 1 |

## Latency
| Metric | Value |
|--------|-------|
| Total Latency | 3.1s |
| Avg per Turn | 1.6s |
| Fastest Turn | 1.4s |
| Slowest Turn | 1.7s |

## Reasoning
| Metric | Value |
|--------|-------|
| Turns with Reasoning | 1 / 2 |
| Avg Reasoning Chars/Turn | 121 |

## Behavioral Signals
- ✅ Excellent turn efficiency — completed in 2 turn(s)

# 📊 Sandbox Test Report: bug_fix
**Model**: accounts/fireworks/models/glm-5p3-flash
**Status**: ✅ Completed

## Turn Efficiency
| Metric | Value |
|--------|-------|
| Total Turns | 3 |
| Wasted Turns | 0 |
| Turns to Completion | 3 |

## Token Usage
| Metric | Value |
|--------|-------|
| Total Input Tokens | 5,438 |
| Total Output Tokens | 1,151 |
| Avg Input/Turn | 1,813 |
| Avg Output/Turn | 384 |
| Token Efficiency (out/in) | 0.212 |
| Estimated Cost | $0.00089 |

## Tool Usage
| Metric | Value |
|--------|-------|
| Total Tool Calls | 3 |
| Unique Tools Used | apply_diff, execute_command, attempt_completion |
| Redundant Reads | 0 |
| Failed Tool Calls | 0 |

### Tool Call Breakdown
| Tool | Count |
|------|-------|
| apply_diff | 1 |
| execute_command | 1 |
| attempt_completion | 1 |

## Latency
| Metric | Value |
|--------|-------|
| Total Latency | 10.0s |
| Avg per Turn | 3.3s |
| Fastest Turn | 2.3s |
| Slowest Turn | 5.2s |

## Reasoning
| Metric | Value |
|--------|-------|
| Turns with Reasoning | 3 / 3 |
| Avg Reasoning Chars/Turn | 872 |

## Behavioral Signals
- ✅ Excellent turn efficiency — completed in 3 turn(s)

# 📊 Sandbox Test Report: feature_add
**Model**: accounts/fireworks/models/glm-5p3-flash
**Status**: ✅ Completed

## Turn Efficiency
| Metric | Value |
|--------|-------|
| Total Turns | 3 |
| Wasted Turns | 0 |
| Turns to Completion | 3 |

## Token Usage
| Metric | Value |
|--------|-------|
| Total Input Tokens | 5,100 |
| Total Output Tokens | 736 |
| Avg Input/Turn | 1,700 |
| Avg Output/Turn | 245 |
| Token Efficiency (out/in) | 0.144 |
| Estimated Cost | $0.00073 |

## Tool Usage
| Metric | Value |
|--------|-------|
| Total Tool Calls | 3 |
| Unique Tools Used | apply_diff, attempt_completion |
| Redundant Reads | 0 |
| Failed Tool Calls | 0 |

### Tool Call Breakdown
| Tool | Count |
|------|-------|
| apply_diff | 2 |
| attempt_completion | 1 |

## Latency
| Metric | Value |
|--------|-------|
| Total Latency | 5.6s |
| Avg per Turn | 1.9s |
| Fastest Turn | 0.9s |
| Slowest Turn | 3.7s |

## Reasoning
| Metric | Value |
|--------|-------|
| Turns with Reasoning | 1 / 3 |
| Avg Reasoning Chars/Turn | 422 |

## Behavioral Signals
- ✅ Excellent turn efficiency — completed in 3 turn(s)

# 📊 Sandbox Test Report: error_recovery
**Model**: accounts/fireworks/models/glm-5p3-flash
**Status**: ✅ Completed

## Turn Efficiency
| Metric | Value |
|--------|-------|
| Total Turns | 2 |
| Wasted Turns | 0 |
| Turns to Completion | 2 |

## Token Usage
| Metric | Value |
|--------|-------|
| Total Input Tokens | 2,575 |
| Total Output Tokens | 140 |
| Avg Input/Turn | 1,288 |
| Avg Output/Turn | 70 |
| Token Efficiency (out/in) | 0.054 |
| Estimated Cost | $0.0003 |

## Tool Usage
| Metric | Value |
|--------|-------|
| Total Tool Calls | 2 |
| Unique Tools Used | apply_diff, attempt_completion |
| Redundant Reads | 0 |
| Failed Tool Calls | 0 |

### Tool Call Breakdown
| Tool | Count |
|------|-------|
| apply_diff | 1 |
| attempt_completion | 1 |

## Latency
| Metric | Value |
|--------|-------|
| Total Latency | 3.5s |
| Avg per Turn | 1.8s |
| Fastest Turn | 1.1s |
| Slowest Turn | 2.5s |

## Reasoning
| Metric | Value |
|--------|-------|
| Turns with Reasoning | 1 / 2 |
| Avg Reasoning Chars/Turn | 88 |

## Behavioral Signals
- ✅ Excellent turn efficiency — completed in 2 turn(s)

# 📊 Sandbox Test Report: duplicate_code_blocks
**Model**: accounts/fireworks/models/glm-5p3-flash
**Status**: ✅ Completed

## Turn Efficiency
| Metric | Value |
|--------|-------|
| Total Turns | 2 |
| Wasted Turns | 0 |
| Turns to Completion | 2 |

## Token Usage
| Metric | Value |
|--------|-------|
| Total Input Tokens | 2,811 |
| Total Output Tokens | 312 |
| Avg Input/Turn | 1,406 |
| Avg Output/Turn | 156 |
| Token Efficiency (out/in) | 0.111 |
| Estimated Cost | $0.00037 |

## Tool Usage
| Metric | Value |
|--------|-------|
| Total Tool Calls | 2 |
| Unique Tools Used | apply_diff, attempt_completion |
| Redundant Reads | 0 |
| Failed Tool Calls | 0 |

### Tool Call Breakdown
| Tool | Count |
|------|-------|
| apply_diff | 1 |
| attempt_completion | 1 |

## Latency
| Metric | Value |
|--------|-------|
| Total Latency | 3.2s |
| Avg per Turn | 1.6s |
| Fastest Turn | 0.9s |
| Slowest Turn | 2.3s |

## Reasoning
| Metric | Value |
|--------|-------|
| Turns with Reasoning | 1 / 2 |
| Avg Reasoning Chars/Turn | 364 |

## Behavioral Signals
- ✅ Excellent turn efficiency — completed in 2 turn(s)

# 📊 Sandbox Test Report: whitespace_indent
**Model**: accounts/fireworks/models/glm-5p3-flash
**Status**: ✅ Completed

## Turn Efficiency
| Metric | Value |
|--------|-------|
| Total Turns | 2 |
| Wasted Turns | 0 |
| Turns to Completion | 2 |

## Token Usage
| Metric | Value |
|--------|-------|
| Total Input Tokens | 2,880 |
| Total Output Tokens | 262 |
| Avg Input/Turn | 1,440 |
| Avg Output/Turn | 131 |
| Token Efficiency (out/in) | 0.091 |
| Estimated Cost | $0.00037 |

## Tool Usage
| Metric | Value |
|--------|-------|
| Total Tool Calls | 2 |
| Unique Tools Used | apply_diff, attempt_completion |
| Redundant Reads | 0 |
| Failed Tool Calls | 0 |

### Tool Call Breakdown
| Tool | Count |
|------|-------|
| apply_diff | 1 |
| attempt_completion | 1 |

## Latency
| Metric | Value |
|--------|-------|
| Total Latency | 3.8s |
| Avg per Turn | 1.9s |
| Fastest Turn | 1.5s |
| Slowest Turn | 2.2s |

## Reasoning
| Metric | Value |
|--------|-------|
| Turns with Reasoning | 1 / 2 |
| Avg Reasoning Chars/Turn | 148 |

## Behavioral Signals
- ✅ Excellent turn efficiency — completed in 2 turn(s)

# 📊 Sandbox Test Report: exploration
**Model**: accounts/fireworks/models/glm-5p3-flash
**Status**: ✅ Completed

## Turn Efficiency
| Metric | Value |
|--------|-------|
| Total Turns | 1 |
| Wasted Turns | 0 |
| Turns to Completion | 1 |

## Token Usage
| Metric | Value |
|--------|-------|
| Total Input Tokens | 1,370 |
| Total Output Tokens | 967 |
| Avg Input/Turn | 1,370 |
| Avg Output/Turn | 967 |
| Token Efficiency (out/in) | 0.706 |
| Estimated Cost | $0.00043 |

## Tool Usage
| Metric | Value |
|--------|-------|
| Total Tool Calls | 1 |
| Unique Tools Used | attempt_completion |
| Redundant Reads | 0 |
| Failed Tool Calls | 0 |

### Tool Call Breakdown
| Tool | Count |
|------|-------|
| attempt_completion | 1 |

## Latency
| Metric | Value |
|--------|-------|
| Total Latency | 10.1s |
| Avg per Turn | 10.1s |
| Fastest Turn | 10.1s |
| Slowest Turn | 10.1s |

## Reasoning
| Metric | Value |
|--------|-------|
| Turns with Reasoning | 1 / 1 |
| Avg Reasoning Chars/Turn | 2386 |

## Behavioral Signals
- ✅ Excellent turn efficiency — completed in 1 turn(s)

# 📊 Sandbox Test Report: multi_file_refactor
**Model**: accounts/fireworks/models/glm-5p3-flash
**Status**: ✅ Completed

## Turn Efficiency
| Metric | Value |
|--------|-------|
| Total Turns | 7 |
| Wasted Turns | 0 |
| Turns to Completion | 7 |

## Token Usage
| Metric | Value |
|--------|-------|
| Total Input Tokens | 12,898 |
| Total Output Tokens | 684 |
| Avg Input/Turn | 1,843 |
| Avg Output/Turn | 98 |
| Token Efficiency (out/in) | 0.053 |
| Estimated Cost | $0.0015 |

## Tool Usage
| Metric | Value |
|--------|-------|
| Total Tool Calls | 7 |
| Unique Tools Used | apply_diff, search_files, attempt_completion |
| Redundant Reads | 0 |
| Failed Tool Calls | 0 |

### Tool Call Breakdown
| Tool | Count |
|------|-------|
| apply_diff | 4 |
| search_files | 2 |
| attempt_completion | 1 |

## Latency
| Metric | Value |
|--------|-------|
| Total Latency | 10.3s |
| Avg per Turn | 1.5s |
| Fastest Turn | 0.8s |
| Slowest Turn | 2.2s |

## Reasoning
| Metric | Value |
|--------|-------|
| Turns with Reasoning | 2 / 7 |
| Avg Reasoning Chars/Turn | 88 |

## Behavioral Signals

# 📊 Sandbox Test Report: typescript_generics
**Model**: accounts/fireworks/models/glm-5p3-flash
**Status**: ✅ Completed

## Turn Efficiency
| Metric | Value |
|--------|-------|
| Total Turns | 3 |
| Wasted Turns | 0 |
| Turns to Completion | 3 |

## Token Usage
| Metric | Value |
|--------|-------|
| Total Input Tokens | 8,518 |
| Total Output Tokens | 2,522 |
| Avg Input/Turn | 2,839 |
| Avg Output/Turn | 841 |
| Token Efficiency (out/in) | 0.296 |
| Estimated Cost | $0.00161 |

## Tool Usage
| Metric | Value |
|--------|-------|
| Total Tool Calls | 3 |
| Unique Tools Used | write_to_file, execute_command, attempt_completion |
| Redundant Reads | 0 |
| Failed Tool Calls | 0 |

### Tool Call Breakdown
| Tool | Count |
|------|-------|
| write_to_file | 1 |
| execute_command | 1 |
| attempt_completion | 1 |

## Latency
| Metric | Value |
|--------|-------|
| Total Latency | 28.1s |
| Avg per Turn | 9.4s |
| Fastest Turn | 1.3s |
| Slowest Turn | 23.3s |

## Reasoning
| Metric | Value |
|--------|-------|
| Turns with Reasoning | 3 / 3 |
| Avg Reasoning Chars/Turn | 2154 |

## Behavioral Signals
- ✅ Excellent turn efficiency — completed in 3 turn(s)

# 📊 Sandbox Test Report: async_await_refactor
**Model**: accounts/fireworks/models/glm-5p3-flash
**Status**: ✅ Completed

## Turn Efficiency
| Metric | Value |
|--------|-------|
| Total Turns | 3 |
| Wasted Turns | 0 |
| Turns to Completion | 3 |

## Token Usage
| Metric | Value |
|--------|-------|
| Total Input Tokens | 7,771 |
| Total Output Tokens | 2,274 |
| Avg Input/Turn | 2,590 |
| Avg Output/Turn | 758 |
| Token Efficiency (out/in) | 0.293 |
| Estimated Cost | $0.00146 |

## Tool Usage
| Metric | Value |
|--------|-------|
| Total Tool Calls | 3 |
| Unique Tools Used | write_to_file, execute_command, attempt_completion |
| Redundant Reads | 0 |
| Failed Tool Calls | 0 |

### Tool Call Breakdown
| Tool | Count |
|------|-------|
| write_to_file | 1 |
| execute_command | 1 |
| attempt_completion | 1 |

## Latency
| Metric | Value |
|--------|-------|
| Total Latency | 22.5s |
| Avg per Turn | 7.5s |
| Fastest Turn | 1.8s |
| Slowest Turn | 15.7s |

## Reasoning
| Metric | Value |
|--------|-------|
| Turns with Reasoning | 3 / 3 |
| Avg Reasoning Chars/Turn | 2449 |

## Behavioral Signals
- ✅ Excellent turn efficiency — completed in 3 turn(s)

# 📊 Sandbox Test Report: large_file_edit
**Model**: accounts/fireworks/models/glm-5p3-flash
**Status**: ✅ Completed

## Turn Efficiency
| Metric | Value |
|--------|-------|
| Total Turns | 2 |
| Wasted Turns | 0 |
| Turns to Completion | 2 |

## Token Usage
| Metric | Value |
|--------|-------|
| Total Input Tokens | 2,911 |
| Total Output Tokens | 119 |
| Avg Input/Turn | 1,456 |
| Avg Output/Turn | 60 |
| Token Efficiency (out/in) | 0.041 |
| Estimated Cost | $0.00033 |

## Tool Usage
| Metric | Value |
|--------|-------|
| Total Tool Calls | 2 |
| Unique Tools Used | apply_diff, attempt_completion |
| Redundant Reads | 0 |
| Failed Tool Calls | 0 |

### Tool Call Breakdown
| Tool | Count |
|------|-------|
| apply_diff | 1 |
| attempt_completion | 1 |

## Latency
| Metric | Value |
|--------|-------|
| Total Latency | 2.6s |
| Avg per Turn | 1.3s |
| Fastest Turn | 0.9s |
| Slowest Turn | 1.6s |

## Reasoning
| Metric | Value |
|--------|-------|
| Turns with Reasoning | 1 / 2 |
| Avg Reasoning Chars/Turn | 72 |

## Behavioral Signals
- ✅ Excellent turn efficiency — completed in 2 turn(s)

# 📊 Sandbox Test Report: parallelism_test
**Model**: accounts/fireworks/models/glm-5p3-flash
**Status**: ✅ Completed

## Turn Efficiency
| Metric | Value |
|--------|-------|
| Total Turns | 3 |
| Wasted Turns | 0 |
| Turns to Completion | 3 |

## Token Usage
| Metric | Value |
|--------|-------|
| Total Input Tokens | 6,631 |
| Total Output Tokens | 1,323 |
| Avg Input/Turn | 2,210 |
| Avg Output/Turn | 441 |
| Token Efficiency (out/in) | 0.2 |
| Estimated Cost | $0.00106 |

## Tool Usage
| Metric | Value |
|--------|-------|
| Total Tool Calls | 3 |
| Unique Tools Used | write_to_file, attempt_completion |
| Redundant Reads | 0 |
| Failed Tool Calls | 0 |

### Tool Call Breakdown
| Tool | Count |
|------|-------|
| write_to_file | 2 |
| attempt_completion | 1 |

## Latency
| Metric | Value |
|--------|-------|
| Total Latency | 9.1s |
| Avg per Turn | 3.0s |
| Fastest Turn | 1.2s |
| Slowest Turn | 6.5s |

## Reasoning
| Metric | Value |
|--------|-------|
| Turns with Reasoning | 1 / 3 |
| Avg Reasoning Chars/Turn | 1158 |

## Behavioral Signals
- ✅ Excellent turn efficiency — completed in 3 turn(s)

# 📊 Sandbox Test Report: write_unit_tests
**Model**: accounts/fireworks/models/glm-5p3-flash
**Status**: ✅ Completed

## Turn Efficiency
| Metric | Value |
|--------|-------|
| Total Turns | 4 |
| Wasted Turns | 0 |
| Turns to Completion | 4 |

## Token Usage
| Metric | Value |
|--------|-------|
| Total Input Tokens | 26,432 |
| Total Output Tokens | 7,590 |
| Avg Input/Turn | 6,608 |
| Avg Output/Turn | 1,898 |
| Token Efficiency (out/in) | 0.287 |
| Estimated Cost | $0.00492 |

## Tool Usage
| Metric | Value |
|--------|-------|
| Total Tool Calls | 4 |
| Unique Tools Used | write_to_file, execute_command</arg_key><arg_value>command</arg_key><arg_value>ls node_modules/.bin 2>/dev/null | head -5; echo "---"; ls</arg_value>, execute_command, attempt_completion |
| Redundant Reads | 0 |
| Failed Tool Calls | 0 |

### Tool Call Breakdown
| Tool | Count |
|------|-------|
| write_to_file | 1 |
| execute_command</arg_key><arg_value>command</arg_key><arg_value>ls node_modules/.bin 2>/dev/null | head -5; echo "---"; ls</arg_value> | 1 |
| execute_command | 1 |
| attempt_completion | 1 |

## Latency
| Metric | Value |
|--------|-------|
| Total Latency | 60.0s |
| Avg per Turn | 15.0s |
| Fastest Turn | 0.8s |
| Slowest Turn | 51.3s |

## Reasoning
| Metric | Value |
|--------|-------|
| Turns with Reasoning | 4 / 4 |
| Avg Reasoning Chars/Turn | 5203 |

## Behavioral Signals

# 📊 Sandbox Test Report: security_vulnerability
**Model**: accounts/fireworks/models/glm-5p3-flash
**Status**: ✅ Completed

## Turn Efficiency
| Metric | Value |
|--------|-------|
| Total Turns | 4 |
| Wasted Turns | 0 |
| Turns to Completion | 4 |

## Token Usage
| Metric | Value |
|--------|-------|
| Total Input Tokens | 10,358 |
| Total Output Tokens | 2,075 |
| Avg Input/Turn | 2,590 |
| Avg Output/Turn | 519 |
| Token Efficiency (out/in) | 0.2 |
| Estimated Cost | $0.00166 |

## Tool Usage
| Metric | Value |
|--------|-------|
| Total Tool Calls | 4 |
| Unique Tools Used | write_to_file, attempt_completion |
| Redundant Reads | 0 |
| Failed Tool Calls | 0 |

### Tool Call Breakdown
| Tool | Count |
|------|-------|
| write_to_file | 3 |
| attempt_completion | 1 |

## Latency
| Metric | Value |
|--------|-------|
| Total Latency | 21.8s |
| Avg per Turn | 5.5s |
| Fastest Turn | 2.1s |
| Slowest Turn | 12.2s |

## Reasoning
| Metric | Value |
|--------|-------|
| Turns with Reasoning | 2 / 4 |
| Avg Reasoning Chars/Turn | 1108 |

## Behavioral Signals

# 📊 Sandbox Test Report: performance_optimization
**Model**: accounts/fireworks/models/glm-5p3-flash
**Status**: ✅ Completed

## Turn Efficiency
| Metric | Value |
|--------|-------|
| Total Turns | 2 |
| Wasted Turns | 0 |
| Turns to Completion | 2 |

## Token Usage
| Metric | Value |
|--------|-------|
| Total Input Tokens | 3,392 |
| Total Output Tokens | 539 |
| Avg Input/Turn | 1,696 |
| Avg Output/Turn | 270 |
| Token Efficiency (out/in) | 0.159 |
| Estimated Cost | $0.0005 |

## Tool Usage
| Metric | Value |
|--------|-------|
| Total Tool Calls | 2 |
| Unique Tools Used | write_to_file, attempt_completion |
| Redundant Reads | 0 |
| Failed Tool Calls | 0 |

### Tool Call Breakdown
| Tool | Count |
|------|-------|
| write_to_file | 1 |
| attempt_completion | 1 |

## Latency
| Metric | Value |
|--------|-------|
| Total Latency | 6.2s |
| Avg per Turn | 3.1s |
| Fastest Turn | 2.2s |
| Slowest Turn | 4.0s |

## Reasoning
| Metric | Value |
|--------|-------|
| Turns with Reasoning | 1 / 2 |
| Avg Reasoning Chars/Turn | 310 |

## Behavioral Signals
- ✅ Excellent turn efficiency — completed in 2 turn(s)

# 📊 Sandbox Test Report: complex_debugging
**Model**: accounts/fireworks/models/glm-5p3-flash
**Status**: ✅ Completed

## Turn Efficiency
| Metric | Value |
|--------|-------|
| Total Turns | 5 |
| Wasted Turns | 0 |
| Turns to Completion | 5 |

## Token Usage
| Metric | Value |
|--------|-------|
| Total Input Tokens | 10,883 |
| Total Output Tokens | 1,394 |
| Avg Input/Turn | 2,177 |
| Avg Output/Turn | 279 |
| Token Efficiency (out/in) | 0.128 |
| Estimated Cost | $0.00151 |

## Tool Usage
| Metric | Value |
|--------|-------|
| Total Tool Calls | 5 |
| Unique Tools Used | apply_diff, write_to_file, execute_command, attempt_completion |
| Redundant Reads | 0 |
| Failed Tool Calls | 0 |

### Tool Call Breakdown
| Tool | Count |
|------|-------|
| apply_diff | 2 |
| write_to_file | 1 |
| execute_command | 1 |
| attempt_completion | 1 |

## Latency
| Metric | Value |
|--------|-------|
| Total Latency | 13.6s |
| Avg per Turn | 2.7s |
| Fastest Turn | 1.5s |
| Slowest Turn | 3.5s |

## Reasoning
| Metric | Value |
|--------|-------|
| Turns with Reasoning | 2 / 5 |
| Avg Reasoning Chars/Turn | 83 |

## Behavioral Signals

# 📊 Sandbox Test Report: api_integration
**Model**: accounts/fireworks/models/glm-5p3-flash
**Status**: ✅ Completed

## Turn Efficiency
| Metric | Value |
|--------|-------|
| Total Turns | 3 |
| Wasted Turns | 0 |
| Turns to Completion | 3 |

## Token Usage
| Metric | Value |
|--------|-------|
| Total Input Tokens | 6,627 |
| Total Output Tokens | 711 |
| Avg Input/Turn | 2,209 |
| Avg Output/Turn | 237 |
| Token Efficiency (out/in) | 0.107 |
| Estimated Cost | $0.00088 |

## Tool Usage
| Metric | Value |
|--------|-------|
| Total Tool Calls | 3 |
| Unique Tools Used | write_to_file, apply_diff, attempt_completion |
| Redundant Reads | 0 |
| Failed Tool Calls | 0 |

### Tool Call Breakdown
| Tool | Count |
|------|-------|
| write_to_file | 1 |
| apply_diff | 1 |
| attempt_completion | 1 |

## Latency
| Metric | Value |
|--------|-------|
| Total Latency | 7.6s |
| Avg per Turn | 2.5s |
| Fastest Turn | 1.3s |
| Slowest Turn | 3.8s |

## Reasoning
| Metric | Value |
|--------|-------|
| Turns with Reasoning | 1 / 3 |
| Avg Reasoning Chars/Turn | 273 |

## Behavioral Signals
- ✅ Excellent turn efficiency — completed in 3 turn(s)

# 📊 Sandbox Test Report: dependency_injection
**Model**: accounts/fireworks/models/glm-5p3-flash
**Status**: ✅ Completed

## Turn Efficiency
| Metric | Value |
|--------|-------|
| Total Turns | 5 |
| Wasted Turns | 0 |
| Turns to Completion | 5 |

## Token Usage
| Metric | Value |
|--------|-------|
| Total Input Tokens | 20,744 |
| Total Output Tokens | 3,836 |
| Avg Input/Turn | 4,149 |
| Avg Output/Turn | 767 |
| Token Efficiency (out/in) | 0.185 |
| Estimated Cost | $0.00323 |

## Tool Usage
| Metric | Value |
|--------|-------|
| Total Tool Calls | 5 |
| Unique Tools Used | list_files, write_to_file, apply_diff, attempt_completion |
| Redundant Reads | 0 |
| Failed Tool Calls | 0 |

### Tool Call Breakdown
| Tool | Count |
|------|-------|
| apply_diff | 2 |
| list_files | 1 |
| write_to_file | 1 |
| attempt_completion | 1 |

## Latency
| Metric | Value |
|--------|-------|
| Total Latency | 36.5s |
| Avg per Turn | 7.3s |
| Fastest Turn | 1.5s |
| Slowest Turn | 26.7s |

## Reasoning
| Metric | Value |
|--------|-------|
| Turns with Reasoning | 2 / 5 |
| Avg Reasoning Chars/Turn | 2677 |

## Behavioral Signals

# 📊 Sandbox Test Report: db_schema_migration
**Model**: accounts/fireworks/models/glm-5p3-flash
**Status**: ✅ Completed

## Turn Efficiency
| Metric | Value |
|--------|-------|
| Total Turns | 5 |
| Wasted Turns | 0 |
| Turns to Completion | 5 |

## Token Usage
| Metric | Value |
|--------|-------|
| Total Input Tokens | 21,337 |
| Total Output Tokens | 3,508 |
| Avg Input/Turn | 4,267 |
| Avg Output/Turn | 702 |
| Token Efficiency (out/in) | 0.164 |
| Estimated Cost | $0.00319 |

## Tool Usage
| Metric | Value |
|--------|-------|
| Total Tool Calls | 5 |
| Unique Tools Used | list_files, write_to_file, apply_diff, attempt_completion |
| Redundant Reads | 0 |
| Failed Tool Calls | 0 |

### Tool Call Breakdown
| Tool | Count |
|------|-------|
| write_to_file | 2 |
| list_files | 1 |
| apply_diff | 1 |
| attempt_completion | 1 |

## Latency
| Metric | Value |
|--------|-------|
| Total Latency | 33.1s |
| Avg per Turn | 6.6s |
| Fastest Turn | 1.5s |
| Slowest Turn | 23.8s |

## Reasoning
| Metric | Value |
|--------|-------|
| Turns with Reasoning | 2 / 5 |
| Avg Reasoning Chars/Turn | 2317 |

## Behavioral Signals

# 📊 Sandbox Test Report: mirror_add_param_validation
**Model**: accounts/fireworks/models/glm-5p3-flash
**Status**: ✅ Completed

## Turn Efficiency
| Metric | Value |
|--------|-------|
| Total Turns | 2 |
| Wasted Turns | 0 |
| Turns to Completion | 2 |

## Token Usage
| Metric | Value |
|--------|-------|
| Total Input Tokens | 3,273 |
| Total Output Tokens | 409 |
| Avg Input/Turn | 1,637 |
| Avg Output/Turn | 205 |
| Token Efficiency (out/in) | 0.125 |
| Estimated Cost | $0.00045 |

## Tool Usage
| Metric | Value |
|--------|-------|
| Total Tool Calls | 2 |
| Unique Tools Used | apply_diff, attempt_completion |
| Redundant Reads | 0 |
| Failed Tool Calls | 0 |

### Tool Call Breakdown
| Tool | Count |
|------|-------|
| apply_diff | 1 |
| attempt_completion | 1 |

## Latency
| Metric | Value |
|--------|-------|
| Total Latency | 4.5s |
| Avg per Turn | 2.3s |
| Fastest Turn | 1.4s |
| Slowest Turn | 3.1s |

## Reasoning
| Metric | Value |
|--------|-------|
| Turns with Reasoning | 1 / 2 |
| Avg Reasoning Chars/Turn | 360 |

## Behavioral Signals
- ✅ Excellent turn efficiency — completed in 2 turn(s)

# 📊 Sandbox Test Report: mirror_fix_repetition_detector
**Model**: accounts/fireworks/models/glm-5p3-flash
**Status**: ✅ Completed

## Turn Efficiency
| Metric | Value |
|--------|-------|
| Total Turns | 4 |
| Wasted Turns | 0 |
| Turns to Completion | 4 |

## Token Usage
| Metric | Value |
|--------|-------|
| Total Input Tokens | 16,164 |
| Total Output Tokens | 3,124 |
| Avg Input/Turn | 4,041 |
| Avg Output/Turn | 781 |
| Token Efficiency (out/in) | 0.193 |
| Estimated Cost | $0.00255 |

## Tool Usage
| Metric | Value |
|--------|-------|
| Total Tool Calls | 4 |
| Unique Tools Used | search_files, apply_diff, attempt_completion |
| Redundant Reads | 0 |
| Failed Tool Calls | 0 |

### Tool Call Breakdown
| Tool | Count |
|------|-------|
| apply_diff | 2 |
| search_files | 1 |
| attempt_completion | 1 |

## Latency
| Metric | Value |
|--------|-------|
| Total Latency | 27.4s |
| Avg per Turn | 6.9s |
| Fastest Turn | 2.7s |
| Slowest Turn | 15.7s |

## Reasoning
| Metric | Value |
|--------|-------|
| Turns with Reasoning | 4 / 4 |
| Avg Reasoning Chars/Turn | 2301 |

## Behavioral Signals

# 📊 Sandbox Test Report: mirror_extract_shared_util
**Model**: accounts/fireworks/models/glm-5p3-flash
**Status**: ✅ Completed

## Turn Efficiency
| Metric | Value |
|--------|-------|
| Total Turns | 5 |
| Wasted Turns | 0 |
| Turns to Completion | 5 |

## Token Usage
| Metric | Value |
|--------|-------|
| Total Input Tokens | 17,925 |
| Total Output Tokens | 2,143 |
| Avg Input/Turn | 3,585 |
| Avg Output/Turn | 429 |
| Token Efficiency (out/in) | 0.12 |
| Estimated Cost | $0.00244 |

## Tool Usage
| Metric | Value |
|--------|-------|
| Total Tool Calls | 5 |
| Unique Tools Used | search_files, write_to_file, apply_diff, attempt_completion |
| Redundant Reads | 0 |
| Failed Tool Calls | 0 |

### Tool Call Breakdown
| Tool | Count |
|------|-------|
| apply_diff | 2 |
| search_files | 1 |
| write_to_file | 1 |
| attempt_completion | 1 |

## Latency
| Metric | Value |
|--------|-------|
| Total Latency | 19.5s |
| Avg per Turn | 3.9s |
| Fastest Turn | 1.1s |
| Slowest Turn | 10.3s |

## Reasoning
| Metric | Value |
|--------|-------|
| Turns with Reasoning | 2 / 5 |
| Avg Reasoning Chars/Turn | 947 |

## Behavioral Signals

# 📊 Sandbox Test Report: mirror_add_new_tool
**Model**: accounts/fireworks/models/glm-5p3-flash
**Status**: ✅ Completed

## Turn Efficiency
| Metric | Value |
|--------|-------|
| Total Turns | 2 |
| Wasted Turns | 0 |
| Turns to Completion | 2 |

## Token Usage
| Metric | Value |
|--------|-------|
| Total Input Tokens | 6,091 |
| Total Output Tokens | 2,115 |
| Avg Input/Turn | 3,046 |
| Avg Output/Turn | 1,058 |
| Token Efficiency (out/in) | 0.347 |
| Estimated Cost | $0.00124 |

## Tool Usage
| Metric | Value |
|--------|-------|
| Total Tool Calls | 2 |
| Unique Tools Used | write_to_file, attempt_completion |
| Redundant Reads | 0 |
| Failed Tool Calls | 0 |

### Tool Call Breakdown
| Tool | Count |
|------|-------|
| write_to_file | 1 |
| attempt_completion | 1 |

## Latency
| Metric | Value |
|--------|-------|
| Total Latency | 16.8s |
| Avg per Turn | 8.4s |
| Fastest Turn | 3.2s |
| Slowest Turn | 13.6s |

## Reasoning
| Metric | Value |
|--------|-------|
| Turns with Reasoning | 1 / 2 |
| Avg Reasoning Chars/Turn | 2652 |

## Behavioral Signals
- ✅ Excellent turn efficiency — completed in 2 turn(s)

# 📊 Sandbox Test Report: mirror_add_keyboard_shortcut
**Model**: accounts/fireworks/models/glm-5p3-flash
**Status**: ✅ Completed

## Turn Efficiency
| Metric | Value |
|--------|-------|
| Total Turns | 2 |
| Wasted Turns | 0 |
| Turns to Completion | 2 |

## Token Usage
| Metric | Value |
|--------|-------|
| Total Input Tokens | 4,874 |
| Total Output Tokens | 959 |
| Avg Input/Turn | 2,437 |
| Avg Output/Turn | 480 |
| Token Efficiency (out/in) | 0.197 |
| Estimated Cost | $0.00078 |

## Tool Usage
| Metric | Value |
|--------|-------|
| Total Tool Calls | 2 |
| Unique Tools Used | apply_diff, attempt_completion |
| Redundant Reads | 0 |
| Failed Tool Calls | 0 |

### Tool Call Breakdown
| Tool | Count |
|------|-------|
| apply_diff | 1 |
| attempt_completion | 1 |

## Latency
| Metric | Value |
|--------|-------|
| Total Latency | 9.0s |
| Avg per Turn | 4.5s |
| Fastest Turn | 1.9s |
| Slowest Turn | 7.1s |

## Reasoning
| Metric | Value |
|--------|-------|
| Turns with Reasoning | 1 / 2 |
| Avg Reasoning Chars/Turn | 1021 |

## Behavioral Signals
- ✅ Excellent turn efficiency — completed in 2 turn(s)

# 📊 Sandbox Test Report: mirror_add_jsdoc
**Model**: accounts/fireworks/models/glm-5p3-flash
**Status**: ✅ Completed

## Turn Efficiency
| Metric | Value |
|--------|-------|
| Total Turns | 4 |
| Wasted Turns | 0 |
| Turns to Completion | 4 |

## Token Usage
| Metric | Value |
|--------|-------|
| Total Input Tokens | 20,894 |
| Total Output Tokens | 4,697 |
| Avg Input/Turn | 5,224 |
| Avg Output/Turn | 1,174 |
| Token Efficiency (out/in) | 0.225 |
| Estimated Cost | $0.0035 |

## Tool Usage
| Metric | Value |
|--------|-------|
| Total Tool Calls | 4 |
| Unique Tools Used | apply_diff, attempt_completion |
| Redundant Reads | 0 |
| Failed Tool Calls | 0 |

### Tool Call Breakdown
| Tool | Count |
|------|-------|
| apply_diff | 3 |
| attempt_completion | 1 |

## Latency
| Metric | Value |
|--------|-------|
| Total Latency | 50.7s |
| Avg per Turn | 12.7s |
| Fastest Turn | 6.1s |
| Slowest Turn | 24.1s |

## Reasoning
| Metric | Value |
|--------|-------|
| Turns with Reasoning | 2 / 4 |
| Avg Reasoning Chars/Turn | 3328 |

## Behavioral Signals

# 📊 Sandbox Test Report: mirror_fix_controlled_component
**Model**: accounts/fireworks/models/glm-5p3-flash
**Status**: ✅ Completed

## Turn Efficiency
| Metric | Value |
|--------|-------|
| Total Turns | 5 |
| Wasted Turns | 0 |
| Turns to Completion | 5 |

## Token Usage
| Metric | Value |
|--------|-------|
| Total Input Tokens | 17,828 |
| Total Output Tokens | 1,736 |
| Avg Input/Turn | 3,566 |
| Avg Output/Turn | 347 |
| Token Efficiency (out/in) | 0.097 |
| Estimated Cost | $0.0023 |

## Tool Usage
| Metric | Value |
|--------|-------|
| Total Tool Calls | 5 |
| Unique Tools Used | apply_diff, read_file, search_files, attempt_completion |
| Redundant Reads | 0 |
| Failed Tool Calls | 0 |

### Tool Call Breakdown
| Tool | Count |
|------|-------|
| apply_diff | 2 |
| read_file | 1 |
| search_files | 1 |
| attempt_completion | 1 |

## Latency
| Metric | Value |
|--------|-------|
| Total Latency | 18.2s |
| Avg per Turn | 3.6s |
| Fastest Turn | 1.7s |
| Slowest Turn | 8.0s |

## Reasoning
| Metric | Value |
|--------|-------|
| Turns with Reasoning | 4 / 5 |
| Avg Reasoning Chars/Turn | 969 |

## Behavioral Signals
- 📖 Read before edit pattern on: webview-ui/src/components/chat/ToolDisclosure.tsx

# 📊 Sandbox Test Report: mirror_rename_across_files
**Model**: accounts/fireworks/models/glm-5p3-flash
**Status**: ✅ Completed

## Turn Efficiency
| Metric | Value |
|--------|-------|
| Total Turns | 9 |
| Wasted Turns | 0 |
| Turns to Completion | 9 |

## Token Usage
| Metric | Value |
|--------|-------|
| Total Input Tokens | 27,333 |
| Total Output Tokens | 1,280 |
| Avg Input/Turn | 3,037 |
| Avg Output/Turn | 142 |
| Token Efficiency (out/in) | 0.047 |
| Estimated Cost | $0.00312 |

## Tool Usage
| Metric | Value |
|--------|-------|
| Total Tool Calls | 9 |
| Unique Tools Used | apply_diff, search_files, attempt_completion |
| Redundant Reads | 0 |
| Failed Tool Calls | 0 |

### Tool Call Breakdown
| Tool | Count |
|------|-------|
| apply_diff | 5 |
| search_files | 3 |
| attempt_completion | 1 |

## Latency
| Metric | Value |
|--------|-------|
| Total Latency | 16.5s |
| Avg per Turn | 1.8s |
| Fastest Turn | 0.8s |
| Slowest Turn | 3.8s |

## Reasoning
| Metric | Value |
|--------|-------|
| Turns with Reasoning | 4 / 9 |
| Avg Reasoning Chars/Turn | 233 |

## Behavioral Signals

# 📊 Sandbox Test Report: mirror_add_retry_logic
**Model**: accounts/fireworks/models/glm-5p3-flash
**Status**: ✅ Completed

## Turn Efficiency
| Metric | Value |
|--------|-------|
| Total Turns | 4 |
| Wasted Turns | 0 |
| Turns to Completion | 4 |

## Token Usage
| Metric | Value |
|--------|-------|
| Total Input Tokens | 12,612 |
| Total Output Tokens | 2,313 |
| Avg Input/Turn | 3,153 |
| Avg Output/Turn | 578 |
| Token Efficiency (out/in) | 0.183 |
| Estimated Cost | $0.00196 |

## Tool Usage
| Metric | Value |
|--------|-------|
| Total Tool Calls | 4 |
| Unique Tools Used | write_to_file, apply_diff, execute_command, attempt_completion |
| Redundant Reads | 0 |
| Failed Tool Calls | 0 |

### Tool Call Breakdown
| Tool | Count |
|------|-------|
| write_to_file | 1 |
| apply_diff | 1 |
| execute_command | 1 |
| attempt_completion | 1 |

## Latency
| Metric | Value |
|--------|-------|
| Total Latency | 21.2s |
| Avg per Turn | 5.3s |
| Fastest Turn | 1.8s |
| Slowest Turn | 14.3s |

## Reasoning
| Metric | Value |
|--------|-------|
| Turns with Reasoning | 2 / 4 |
| Avg Reasoning Chars/Turn | 1465 |

## Behavioral Signals