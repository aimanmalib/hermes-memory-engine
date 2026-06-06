# ADR-004: LLM Provider Abstraction

## Status

Accepted

## Context

Memory compression and summarization need LLM calls. We want to support:
- OpenAI (GPT-4, GPT-3.5)
- Anthropic (Claude)
- Custom/self-hosted models

## Decision

Define a minimal `LLMProvider` interface:

```typescript
interface LLMProvider {
  complete(prompt: string, options?: CompletionOptions): Promise<string>;
}
```

Both `OpenAIAdapter` and `ClaudeAdapter` implement `LLMProvider` for compression, PLUS expose tool-calling schemas for agent integration.

## Consequences

**Pros:**
- Single interface for compression — swap models easily
- Adapters are dual-purpose (compression + agent tool calling)
- Easy to add new providers (Ollama, Groq, etc.)

**Cons:**
- Tool-calling format differs between OpenAI and Claude — adapters handle this internally
- System prompt injection is provider-specific
