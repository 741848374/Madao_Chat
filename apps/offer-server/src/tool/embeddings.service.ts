import { Injectable } from '@nestjs/common';

import { OpenAIEmbeddings } from '@langchain/openai';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmbeddingsService {
  private embeddings: OpenAIEmbeddings;
  constructor(private configService: ConfigService) {
    this.embeddings = new OpenAIEmbeddings({
      apiKey: this.configService.get('OPENAI_API_KEY'),
      model: this.configService.get('EMBEDDINGS_MODEL_NAME'),
      configuration: {
        baseURL: this.configService.get('OPENAI_BASE_URL'),
      },
      dimensions: this.configService.get('VECTOR_DIM'),
      batchSize: 10,
    });
  }

  getEmbeddings() {
    return this.embeddings;
  }
}
