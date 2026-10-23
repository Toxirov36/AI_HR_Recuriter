import {
  BadGatewayException,
  GatewayTimeoutException,
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { Security } from '../../../common/utils/security';
import { instructions as defaultInstructions } from '../prompts/evidence.prompt';

const MAX_OUTPUT_TOKENS = 8000;

const completionSchema = z.object({
  choices: z
    .array(
      z.object({
        finish_reason: z.string().nullable().optional(),
        message: z.object({ content: z.string().nullable().optional() }),
      }),
    )
    .min(1),
});

/**
 * Structured text generation through DeepSeek's OpenAI-compatible chat API (JSON mode).
 * DeepSeek has no embedding, audio or vision endpoints; those stay on Gemini.
 */
@Injectable()
export class DeepSeekProvider {
  private readonly logger = new Logger(DeepSeekProvider.name);

  constructor(private security: Security) {}

  async generate<T extends z.ZodType>(
    schema: T,
    task: string,
    input: unknown,
    systemInstructions = defaultInstructions,
  ): Promise<z.infer<T>> {
    const config = this.security.config;
    if (!config.DEEPSEEK_API_KEY)
      throw new ServiceUnavailableException(
        'AI is not configured. Set DEEPSEEK_API_KEY on the backend to enable this feature.',
      );
    // JSON mode does not enforce a schema, so the schema travels in the prompt and the reply is validated here.
    const system =
      `${systemInstructions}\n${task}\n\n` +
      'Respond with a single valid JSON object only (no markdown, no commentary) that conforms to this JSON Schema:\n' +
      JSON.stringify(z.toJSONSchema(schema));
    const body = {
      model: config.DEEPSEEK_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify(input) },
      ],
      response_format: { type: 'json_object' },
      max_tokens: MAX_OUTPUT_TOKENS,
      temperature: 0.3,
      stream: false,
    };

    for (let attempt = 0; ; attempt += 1) {
      const text = await this.complete(body);
      try {
        return schema.parse(JSON.parse(text));
      } catch {
        this.logger.warn(`DeepSeek returned invalid or incomplete structured output (attempt ${attempt + 1})`);
        if (attempt >= 1)
          throw new BadGatewayException('AI processing failed or returned an incomplete response. Please retry.');
      }
    }
  }

  private async complete(body: unknown): Promise<string> {
    const config = this.security.config;
    const url = `${config.DEEPSEEK_BASE_URL.replace(/\/+$/, '')}/chat/completions`;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const signal = AbortSignal.timeout(config.AI_TIMEOUT_MS);
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.DEEPSEEK_API_KEY}` },
          body: JSON.stringify(body),
          signal,
        });
        if (response.ok) {
          const parsed = completionSchema.parse(await response.json());
          const choice = parsed.choices[0];
          const content = choice.message.content?.trim() ?? '';
          // "length" means the reply was cut off, so the JSON would be incomplete.
          if (!content || choice.finish_reason === 'length') {
            this.logger.warn(`DeepSeek reply empty or truncated (finish_reason=${choice.finish_reason ?? 'none'})`);
            if (attempt === 0) continue;
            throw new BadGatewayException('AI processing failed or returned an incomplete response. Please retry.');
          }
          return content;
        }
        // Log only status and operation; never provider bodies, CVs, or credentials.
        this.logger.warn(`DeepSeek chat HTTP ${response.status} (attempt ${attempt + 1})`);
        await response.body?.cancel();
        const retryable = response.status === 429 || response.status >= 500;
        if (retryable && attempt === 0) {
          await delay(500, undefined, { signal });
          continue;
        }
        if (response.status === 429)
          throw new ServiceUnavailableException('AI request limit or quota reached. Please retry shortly.');
        if (response.status === 402)
          throw new ServiceUnavailableException('AI account balance is insufficient. Top up the DeepSeek account.');
        if (response.status === 401 || response.status === 403)
          throw new ServiceUnavailableException('AI access denied. Check the backend DEEPSEEK_API_KEY.');
        if (retryable) throw new ServiceUnavailableException('AI is temporarily unavailable. Please retry shortly.');
        throw new BadGatewayException('AI rejected the request. Check the backend model configuration and server logs.');
      } catch (error) {
        if (error instanceof HttpException) throw error;
        if (signal.aborted) {
          this.logger.warn(`DeepSeek request exceeded ${config.AI_TIMEOUT_MS}ms`);
          throw new GatewayTimeoutException('AI took too long to respond. Please retry.');
        }
        if (error instanceof TypeError && attempt === 0) {
          this.logger.warn('DeepSeek connection failed; retrying once');
          continue;
        }
        throw new BadGatewayException('AI processing failed: the AI connection or response failed. Please retry.');
      }
    }
    throw new ServiceUnavailableException('AI is temporarily unavailable. Please retry shortly.');
  }
}
