import { AgentOrchestrator } from './src/agent/orchestrator';
import { ChatMessage } from './src/types';

async function run() {
  const orchestrator = new AgentOrchestrator(
    async (key) => {
      if (key === 'figma_api_key') return 'test_figma_key';
      if (key === 'deepseek_api_key') return 'test_deepseek_key';
      return undefined;
    },
    () => [],
    async () => {},
    (msg) => console.log('POSTMESSAGE:', msg),
    (p) => p
  );

  // Mock _getLLMCompletion
  (orchestrator as any)._getLLMCompletion = async (
    provider: any, host: any, model: any, apiKey: any, messages: any, signal: any, controller: any
  ) => {
    console.log('MOCK LLM CALLED!');
    // Simulate LLM streaming a tool call
    setTimeout(() => {
      (orchestrator as any)._postMessage({ type: 'chatResponseChunk', text: '<figma_inspect url="https://www.figma.com/design/6SsVL4qkRQyp2Lk3Eznbgu/MCP-Test?node-id=1-11&t=VTWsXj0Nb2I10Qwa-0" />' });
      
      // simulate streamDeepSeekChat's completion block which aborts the stream and returns cleaned
      const fullText = '<figma_inspect url="https://www.figma.com/design/6SsVL4qkRQyp2Lk3Eznbgu/MCP-Test?node-id=1-11&t=VTWsXj0Nb2I10Qwa-0" />';
      const cleaned = (orchestrator as any).getCleanedToolResponse(fullText);
      (orchestrator as any)._postMessage({ type: 'chatResponseComplete', fullText: cleaned });
      
      // Actually _getLLMCompletion returns the fullText or cleaned text depending on what aborted it.
      // Wait, in real code, `resolve(cleaned)` is called inside the chunk handler if `hasCompleteToolCall` is true!
      // So _getLLMCompletion returns `cleaned`.
    }, 100);
    
    // In our mock, we just return the cleaned text as if the stream was aborted by the tool call.
    const fullText = '<figma_inspect url="https://www.figma.com/design/6SsVL4qkRQyp2Lk3Eznbgu/MCP-Test?node-id=1-11&t=VTWsXj0Nb2I10Qwa-0" />';
    const cleaned = (orchestrator as any).getCleanedToolResponse(fullText);
    return cleaned;
  };

  const userMessage = "Create a seperate page using this figma link: https://www.figma.com/design/6SsVL4qkRQyp2Lk3Eznbgu/MCP-Test?node-id=1-11&t=VTWsXj0Nb2I10Qwa-0";
  const currentMessages: ChatMessage[] = [];

  console.log("Calling handleMessageStream...");
  await orchestrator.handleMessageStream(userMessage, currentMessages);
  console.log("Finished handleMessageStream!");
}

run().catch(console.error);
