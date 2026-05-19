import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { UploadFileService } from './upload-file.service';
import { UploadFile } from './entities/UploadFile.entity';
import { ToolModule } from 'src/tool/tool.module';
import { GraphModule } from './langgraph/graph.module';

@Module({
  imports: [ToolModule, GraphModule, TypeOrmModule.forFeature([UploadFile])],
  controllers: [AiController],
  providers: [AiService, UploadFileService],
})
export class AiModule {}
