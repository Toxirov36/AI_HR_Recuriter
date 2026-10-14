import {
  BadGatewayException,
  GatewayTimeoutException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { z } from 'zod';
import { setTimeout as delay } from 'node:timers/promises';
import { Security } from '../../../common/utils/security';
import { instructions } from '../prompts/evidence.prompt';
import { resumeSchema } from '../schemas/resume.schema';

@Injectable()
export class GeminiProvider {
  private readonly logger = new Logger(GeminiProvider.name);

  constructor(@Inject(Security) private security: Security) {}

  async generate<T extends z.ZodType>(
    schema: T,
    task: string,
    input: unknown,
    systemInstructions = instructions,
  ): Promise<z.infer<T>> {
    const config = this.security.config;
    if (!config.GEMINI_API_KEY)
      throw new ServiceUnavailableException(
        'AI is not configured. Set GEMINI_API_KEY on the backend to enable this feature.',
      );
    try {
      const response = await this.request(config.GEMINI_MODEL, 'generateContent', {
        systemInstruction: { parts: [{ text: `${systemInstructions}\n${task}` }] },
        contents: [{ role: 'user', parts: [{ text: JSON.stringify(input) }] }],
        generationConfig: {
          maxOutputTokens: 10000,
          responseMimeType: 'application/json',
          responseJsonSchema: z.toJSONSchema(schema),
        },
      });
      const parsed = z
        .object({
          candidates: z
            .array(
              z.object({
                finishReason: z.literal('STOP'),
                content: z.object({
                  parts: z.array(
                    z.object({ text: z.string().optional(), thought: z.boolean().optional() }),
                  ),
                }),
              }),
            )
            .min(1),
        })
        .parse(response);
      const text = parsed.candidates[0].content.parts
        .filter((part) => !part.thought)
        .map((part) => part.text ?? '')
        .join('');
      return schema.parse(JSON.parse(text));
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.warn('Gemini returned invalid or incomplete structured output');
      throw new BadGatewayException(
        'AI processing failed or returned an incomplete response. Please retry.',
      );
    }
  }

  async request(
    model: string,
    method: 'generateContent' | 'embedContent',
    body: unknown,
  ): Promise<unknown> {
    const config = this.security.config;
    // Har urinish uchun mustaqil signal — birinchisi timeout bo'lsa,
    // ikkinchi retry yangi to'liq vaqt bilan boshlanadi.
    for (let attempt = 0; attempt < 2; attempt++) {
      const signal = AbortSignal.timeout(config.AI_TIMEOUT_MS);
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:${method}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': config.GEMINI_API_KEY,
            },
            body: JSON.stringify(body),
            signal,
          },
        );
        if (response.ok) return await response.json();
        // Log only status and operation; never provider bodies, CVs, or credentials.
        this.logger.warn(`Gemini ${model} ${method} HTTP ${response.status} (attempt ${attempt + 1})`);
        await response.body?.cancel();
        const retryable = response.status === 429 || response.status >= 500;
        if (retryable && attempt === 0) {
          await delay(500, undefined, { signal });
          continue;
        }
        if (
          response.status === 503 &&
          method === 'generateContent' &&
          config.GEMINI_FALLBACK_MODEL &&
          config.GEMINI_FALLBACK_MODEL !== model
        ) {
          this.logger.warn(`Gemini ${model} unavailable; trying ${config.GEMINI_FALLBACK_MODEL}`);
          return this.request(config.GEMINI_FALLBACK_MODEL, method, body);
        }
        if (response.status === 429)
          throw new ServiceUnavailableException(
            'Gemini request limit or quota reached. Check your Google AI Studio quota and retry shortly.',
          );
        if (response.status === 401 || response.status === 403)
          throw new ServiceUnavailableException(
            'Gemini access denied. Check the backend API key and model permissions.',
          );
        if (retryable)
          throw new ServiceUnavailableException(
            'Gemini is temporarily unavailable. Please retry shortly.',
          );
        throw new BadGatewayException(
          'Gemini rejected the AI request. Check the backend model configuration and server logs.',
        );
      } catch (error) {
        if (error instanceof HttpException) throw error;
        if (signal.aborted) {
          this.logger.warn(`Gemini ${method} exceeded ${config.AI_TIMEOUT_MS}ms`);
          throw new GatewayTimeoutException('Gemini took too long to respond. Please retry.');
        }
        if (error instanceof TypeError && attempt === 0) {
          this.logger.warn(`Gemini ${method} connection failed; retrying once`);
          continue;
        }
        throw new BadGatewayException(
          'AI processing failed: Gemini connection or response failed. Please retry.',
        );
      }
    }
    throw new ServiceUnavailableException(
      'Gemini is temporarily unavailable. Please retry shortly.',
    );
  }

  async embed(resume: z.infer<typeof resumeSchema>) {
    const model = this.security.config.GEMINI_EMBEDDING_MODEL;
    // Bound the professional summary input to fit the embedding model's context.
    const text = JSON.stringify({ summary: resume.summary, skills: resume.skills }).slice(0, 8000);
    try {
      const response = await this.request(model, 'embedContent', {
        content: { parts: [{ text }] },
        outputDimensionality: 768,
      });
      const parsed = z
        .object({ embedding: z.object({ values: z.array(z.number().finite()).length(768) }) })
        .parse(response);
      return { model, dimensions: 768, values: parsed.embedding.values };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new BadGatewayException(
        'AI embedding failed or returned an incomplete response. Please retry.',
      );
    }
  }

  async transcribeAudio(
    audioBuffer: Buffer,
    mimeType: string,
    language = 'uz',
  ): Promise<string> {
    const config = this.security.config;
    if (!config.GEMINI_API_KEY) {
      throw new ServiceUnavailableException(
        'AI is not configured. Set GEMINI_API_KEY on the backend to enable this feature.',
      );
    }

    const languageDescription = {
      uz: 'Uzbek (Latin script)',
      ru: 'Russian',
      en: 'English',
      tg: 'Tajik (Cyrillic script)',
    }[language] ?? 'Uzbek (Latin script)';

    const prompt = `You are an expert audio transcriber for HR recruitment.
Transcribe the spoken audio verbatim into clean text.
The spoken language is primarily ${languageDescription}.
CRITICAL INSTRUCTIONS:
1. Preserve technical terminology, programming languages, and industry job titles in standard form (e.g., "Node.js", "NestJS", "Docker", "Middle", "Senior", "PostgreSQL", "React", "TypeScript", "DevOps").
2. Output ONLY the plain transcription text without quotation marks, markdown formatting, explanations, or introductory text.
3. If the audio is silent or unintelligible, output an empty response.`;

    try {
      const response = await this.request(config.GEMINI_MODEL, 'generateContent', {
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: audioBuffer.toString('base64'),
                },
              },
              { text: prompt },
            ],
          },
        ],
        generationConfig: {
          maxOutputTokens: 2048,
          temperature: 0.1,
        },
      });

      const parsed = z
        .object({
          candidates: z
            .array(
              z.object({
                content: z.object({
                  parts: z.array(
                    z.object({ text: z.string().optional(), thought: z.boolean().optional() }),
                  ),
                }),
              }),
            )
            .min(1),
        })
        .safeParse(response);

      if (!parsed.success) return '';

      const text = parsed.data.candidates[0].content.parts
        .filter((part) => !part.thought)
        .map((part) => part.text ?? '')
        .join('')
        .trim();

      return text;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.warn(`Audio transcription failed: ${(error as Error).message}`);
      throw new BadGatewayException('Audio transcription failed. Please retry.');
    }
  }
}
