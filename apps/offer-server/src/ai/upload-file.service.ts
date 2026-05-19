import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UploadFile } from './entities/UploadFile.entity';

@Injectable()
export class UploadFileService {
  constructor(
    @InjectRepository(UploadFile)
    private uploadFileRepo: Repository<UploadFile>,
  ) {}

  async save(data: {
    userId: number;
    username: string;
    filename: string;
    fileType: string;
    sectionCount: number;
    chunkCount: number;
    content?: string;
    filePath?: string;
  }) {
    return this.uploadFileRepo.save(this.uploadFileRepo.create(data));
  }

  async updateContent(id: number, content: string) {
    return this.uploadFileRepo.update(id, { content });
  }

  async findByUserId(userId: number) {
    return this.uploadFileRepo.find({
      where: { userId },
      order: { uploadTime: 'DESC' },
      take: 50,
    });
  }

  async findByUserAndFilename(userId: number, filename: string) {
    return this.uploadFileRepo.findOne({
      where: { userId, filename },
    });
  }

  async findById(id: number) {
    return this.uploadFileRepo.findOne({ where: { id } });
  }

  async findContentById(id: number) {
    const record = await this.uploadFileRepo.findOne({
      where: { id },
      select: ['id', 'filename', 'fileType', 'content', 'userId'],
    });
    return record;
  }

  async findFilePathById(id: number) {
    const record = await this.uploadFileRepo.findOne({
      where: { id },
      select: ['id', 'filename', 'fileType', 'filePath', 'userId'],
    });
    return record;
  }

  async delete(id: number, userId: number) {
    const record = await this.uploadFileRepo.findOne({
      where: { id, userId },
    });
    if (!record) return null;
    await this.uploadFileRepo.remove(record);
    return record;
  }
}
