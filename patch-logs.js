const fs = require('fs');

let code = fs.readFileSync('src/agent/orchestrator.ts', 'utf8');

const logFn = `
    const fs = require('fs');
    const log = (msg) => {
      try { fs.appendFileSync('d:\\\\github\\\\mirror-vs\\\\debug-log.txt', new Date().toISOString() + ' - ' + msg + '\\n'); } catch (e) {}
    };
    log('--- STARTED handleMessageStream ---');
`;

code = code.replace(/public async handleMessageStream\(userMessage: string, currentMessages: ChatMessage\[\]\) \{/, 
  "public async handleMessageStream(userMessage: string, currentMessages: ChatMessage[]) {" + logFn);

code = code.replace(/loopCount\+\+;/, "log('Loop iteration ' + loopCount); loopCount++;");
code = code.replace(/this\._postMessage\(\{ type: 'chatResponseStart' \}\);/, "log('Posting chatResponseStart'); this._postMessage({ type: 'chatResponseStart' });");
code = code.replace(/assistantResponse = await this\._getLLMCompletion\(/, "log('Calling _getLLMCompletion'); assistantResponse = await this._getLLMCompletion(");
code = code.replace(/const toolCalls = this\._parseToolCalls\(assistantResponse\);/, "log('Finished _getLLMCompletion. Calling _parseToolCalls...'); const toolCalls = this._parseToolCalls(assistantResponse); log('Parsed ' + toolCalls.length + ' tool calls');");
code = code.replace(/this\._postMessage\(\{ type: 'loopComplete' \}\);/g, "log('Posting loopComplete'); this._postMessage({ type: 'loopComplete' });");

fs.writeFileSync('src/agent/orchestrator.ts', code);
