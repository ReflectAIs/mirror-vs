import { Anthropic } from "@anthropic-ai/sdk"
import OpenAI from "openai"

import type { ModelInfo } from "@mirror-vs/types"
import { customDefaultModelId, customDefaultModelInfo } from "@mirror-vs/types"

import { type ApiHandlerOptions, getModelMaxOutputTokens } from "../../shared/api"
import { TagMatcher } from "../../utils/tag-matcher"
import { ApiStream, ApiStreamUsageChunk } from "../transform/stream"
import { convertToOpenAiMessages } from "../transform/openai-format"

import type { SingleCompletionHandler, ApiHandlerCreateMessageMetadata } from "../index"
import { DEFAULT_HEADERS } from "./constants"
import { BaseProvider } from "./base-provider"
import { handleOpenAIError } from "./utils/openai-error-handler"
import { calculateApiCostOpenAI } from "../../shared/cost"
import { getApiRequestTimeout } from "./utils/timeout-config"

/**
 * CustomHandler – a simple OpenAI-compatible provider that lets users
 * configure an arbitrary base URL, API key, and model ID.
 *
 * Mirrors the pattern from mirror-vs-ex's LiteLLMProvider but integrated
 * into the existing provider architecture using the OpenAI SDK.
 */
export class CustomHandler extends BaseProvider implements SingleCompletionHandler {
    private options: ApiHandlerOptions
    private client: OpenAI

    constructor(options: ApiHandlerOptions) {
        super()
        this.options = options

        const baseURL = options.customBaseUrl || "https://api.openai.com/v1"
        const apiKey = options.customApiKey || ""

        this.client = new OpenAI({
            baseURL,
            apiKey,
            defaultHeaders: DEFAULT_HEADERS,
            timeout: getApiRequestTimeout(),
        })
    }

    override async *createMessage(
        systemPrompt: string,
        messages: Anthropic.Messages.MessageParam[],
        metadata?: ApiHandlerCreateMessageMetadata,
    ): ApiStream {
        const { id: model, info } = this.getModel()

        const max_tokens =
            getModelMaxOutputTokens({
                modelId: model,
                model: info,
                settings: this.options,
                format: "openai",
            }) ?? undefined

        const temperature = this.options.modelTemperature ?? info.defaultTemperature ?? 0

        const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
            model,
            max_tokens,
            temperature,
            messages: [{ role: "system", content: systemPrompt }, ...convertToOpenAiMessages(messages)],
            stream: true,
            stream_options: { include_usage: true },
            tools: this.convertToolsForOpenAI(metadata?.tools),
            tool_choice: metadata?.tool_choice,
            parallel_tool_calls: metadata?.parallelToolCalls ?? true,
        }

        // Add thinking parameter if reasoning is enabled and model supports it
        if (this.options.enableReasoningEffort && info.supportsReasoningBinary) {
            ; (params as any).thinking = { type: "enabled" }
        }

        let stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>
        try {
            stream = await this.client.chat.completions.create(params)
        } catch (error) {
            throw handleOpenAIError(error, "Custom")
        }

        const matcher = new TagMatcher(
            "think",
            (chunk) =>
                ({
                    type: chunk.matched ? "reasoning" : "text",
                    text: chunk.data,
                }) as const,
        )

        let lastUsage: OpenAI.CompletionUsage | undefined
        const activeToolCallIds = new Set<string>()

        for await (const chunk of stream) {
            const delta = chunk.choices?.[0]?.delta
            const finishReason = chunk.choices?.[0]?.finish_reason

            if (delta?.content) {
                for (const processedChunk of matcher.update(delta.content)) {
                    yield processedChunk
                }
            }

            if (delta) {
                for (const key of ["reasoning_content", "reasoning"] as const) {
                    if (key in delta) {
                        const reasoning_content = ((delta as any)[key] as string | undefined) || ""
                        if (reasoning_content?.trim()) {
                            yield { type: "reasoning", text: reasoning_content }
                        }
                        break
                    }
                }
            }

            // Emit raw tool call chunks
            if (delta?.tool_calls) {
                for (const toolCall of delta.tool_calls) {
                    if (toolCall.id) {
                        activeToolCallIds.add(toolCall.id)
                    }
                    yield {
                        type: "tool_call_partial",
                        index: toolCall.index,
                        id: toolCall.id,
                        name: toolCall.function?.name,
                        arguments: toolCall.function?.arguments,
                    }
                }
            }

            // Emit tool_call_end events when finish_reason is "tool_calls"
            if (finishReason === "tool_calls" && activeToolCallIds.size > 0) {
                for (const id of activeToolCallIds) {
                    yield { type: "tool_call_end", id }
                }
                activeToolCallIds.clear()
            }

            if (chunk.usage) {
                lastUsage = chunk.usage
            }
        }

        if (lastUsage) {
            yield this.processUsageMetrics(lastUsage, this.getModel().info)
        }

        for (const processedChunk of matcher.final()) {
            yield processedChunk
        }
    }

    private processUsageMetrics(usage: any, modelInfo?: ModelInfo): ApiStreamUsageChunk {
        const inputTokens = usage?.prompt_tokens || 0
        const outputTokens = usage?.completion_tokens || 0
        const cacheWriteTokens = usage?.prompt_tokens_details?.cache_write_tokens || 0
        const cacheReadTokens = usage?.prompt_tokens_details?.cached_tokens || 0

        const { totalCost } = modelInfo
            ? calculateApiCostOpenAI(modelInfo, inputTokens, outputTokens, cacheWriteTokens, cacheReadTokens)
            : { totalCost: 0 }

        return {
            type: "usage",
            inputTokens,
            outputTokens,
            cacheWriteTokens: cacheWriteTokens || undefined,
            cacheReadTokens: cacheReadTokens || undefined,
            totalCost,
        }
    }

    async completePrompt(prompt: string): Promise<string> {
        const { id: modelId } = this.getModel()

        const params: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
            model: modelId,
            messages: [{ role: "user", content: prompt }],
        }

        try {
            const response = await this.client.chat.completions.create(params)
            return response.choices?.[0]?.message.content || ""
        } catch (error) {
            throw handleOpenAIError(error, "Custom")
        }
    }

    override getModel() {
        const modelId = this.options.customModelId || customDefaultModelId
        const modelInfo = this.options.customModelInfo || customDefaultModelInfo

        return { id: modelId, info: modelInfo }
    }
}
