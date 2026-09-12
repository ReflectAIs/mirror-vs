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