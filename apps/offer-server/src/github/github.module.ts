import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GithubController } from './github.controller';
import { GithubKnowledge } from './entities/github-knowledge.entity';
import { ToolModule } from '../tool/tool.module';
import { User } from '../auth/entities/User.entity';

@Module({
  imports: [ToolModule, TypeOrmModule.forFeature([GithubKnowledge, User])],
  controllers: [GithubController],
})
export class GithubModule {}
