import { Injectable } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ChatModelService {
  private chatModel: ChatOpenAI;
  constructor(private configService: ConfigService) {
    this.chatModel = new ChatOpenAI({
      apiKey: this.configService.get('OPENAI_API_KEY'),
      model: this.configService.get('MODEL_NAME'),
      temperature: 0,
      configuration: {
        baseURL: this.configService.get('OPENAI_BASE_URL'),
      },
    });
  }
  getModel(): ChatOpenAI {
    return this.chatModel;
  }
}
