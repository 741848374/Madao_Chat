import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../auth/entities/User.entity';

@Entity({ name: 'upload_file' })
export class UploadFile {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', comment: '用户ID' })
  @Index()
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ length: 100, comment: '用户名' })
  username: string;

  @Column({ length: 500, comment: '文件名' })
  filename: string;

  @Column({ length: 20, comment: '文件类型' })
  fileType: string;

  @Column({ type: 'int', comment: '分割部分数', default: 0 })
  sectionCount: number;

  @Column({ type: 'int', comment: '向量块数', default: 0 })
  chunkCount: number;

  @Column({
    type: 'longtext',
    comment: '解析后的完整内容(JSON)',
    nullable: true,
  })
  content: string;

  @Column({ length: 500, comment: '文件存储路径', nullable: true })
  filePath: string;

  @CreateDateColumn()
  uploadTime: Date;
}
