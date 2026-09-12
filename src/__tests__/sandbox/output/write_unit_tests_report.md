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