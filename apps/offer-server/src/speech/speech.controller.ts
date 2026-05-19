import { BadRequestException, Controller, Post } from '@nestjs/common';
import { SpeechService } from './speech.service';
import { UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

type UploadedAudio = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

@Controller('speech')
export class SpeechController {
  constructor(private readonly speechService: SpeechService) {}

  @Post('asr')
  @UseInterceptors(FileInterceptor('audio'))
  async recognize(@UploadedFile() file?: UploadedAudio) {
    if (!file?.buffer?.length) {
      throw new BadRequestException(
        '请通过 FormData 的 audio 字段上传音频文件',
      );
    }
    const text = await this.speechService.recognizeBySentence(file);
    return text;
  }
}
