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