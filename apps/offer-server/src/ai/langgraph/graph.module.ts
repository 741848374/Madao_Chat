import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GraphService } from './graph.service';
import { ToolModule } from 'src/tool/tool.module';
import { User } from '../../auth/entities/User.entity';
@Module({
  imports: [ToolModule, TypeOrmModule.forFeature([User])],
  controllers: [],
  providers: [GraphService],
  exports: [GraphService],
})
export class GraphModule {}
