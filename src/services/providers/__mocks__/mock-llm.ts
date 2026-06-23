import { BaseProvider, ChatMessage, StreamChunk, ProviderConfig } from '../base-provider';

export class MockLLMProvider extends BaseProvider {
  private static responses: string[] = [];
  private static currentIndex = 0;

  constructor(
    apiKey = 'mock-key',
    model = 'mock-model',
  ) {
    const config: ProviderConfig = {
      id: 'mock-llm',
      name: 'Mock LLM',
      baseUrl: 'http://mock-api.com',
      apiKey,
      model,
      supportsStreaming: true,
      supportsToolCalling: true,
      supportsImages: false,
    };
    super(config);
  }

  /**
   * Set the mock responses that the provider will stream back.
   */
  public static setMockResponses(responses: string[]) {
    this.responses = responses;
    this.currentIndex = 0;
  }

  public static addMockResponse(response: string) {
    this.responses.push(response);
  }

  public static reset() {
    this.responses = [];
    this.currentIndex = 0;
  }

  public async *streamChat(
    messages: ChatMessage[],
    signal: AbortSignal,
    tools?: object[],
  ): AsyncGenerator<StreamChunk> {
    if (MockLLMProvider.currentIndex >= MockLLMProvider.responses.length) {
      // Fallback response if we run out of scheduled mock completions
      const fallback = 'Task complete! No further action needed.';
      yield { type: 'text', content: fallback };
      return;
    }

    const nextResponse = MockLLMProvider.responses[MockLLMProvider.currentIndex++];
    
    // Simulate streaming by yielding parts of the response
    const words = nextResponse.split(' ');
    for (let i = 0; i < words.length; i++) {
      if (signal.aborted) break;
      const delimiter = i === words.length - 1 ? '' : ' ';
      yield { type: 'text', content: words[i] + delimiter };
      // Small timeout to simulate network latency if needed, but in tests sync/immediate is cleaner
    }

    yield {
      type: 'usage',
      inputTokens: messages.reduce((sum, m) => sum + (m.content || '').length / 4, 0),
      outputTokens: nextResponse.length / 4,
    };
  }

  public async complete(prompt: string, signal: AbortSignal): Promise<string> {
    if (MockLLMProvider.currentIndex < MockLLMProvider.responses.length) {
      return MockLLMProvider.responses[MockLLMProvider.currentIndex++];
    }
    return 'Mock completion response.';
  }

  public async fetchModels(): Promise<string[]> {
    return ['mock-model', 'mock-model-v2'];
  }
}
