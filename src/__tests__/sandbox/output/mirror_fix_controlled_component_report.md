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