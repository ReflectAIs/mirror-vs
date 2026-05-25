$content = Get-Content src/agent/agent-parser.ts -Raw
$content = $content -replace '\[a-zA-Z_0-9\\-\]\+', '[a-zA-Z_0-9-]+'
Set-Content src/agent/agent-parser.ts -Value $content -NoNewline