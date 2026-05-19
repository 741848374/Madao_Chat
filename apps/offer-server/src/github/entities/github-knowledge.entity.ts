import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  Unique,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../auth/entities/User.entity';

@Entity({ name: 'github_knowledge' })
@Unique('uk_user_repo', ['userId', 'repo'])
export class GithubKnowledge {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', comment: '上传用户ID' })
  @Index()
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ length: 100, comment: 'GitHub 用户名（被扫描的账号）' })
  username: string;

  @Column({ length: 200, comment: '仓库全名 owner/repo' })
  repo: string;

  @Column({ length: 500, comment: '仓库描述', nullable: true })
  description: string;

  @Column({ length: 50, comment: '主要语言', nullable: true })
  language: string;

  @Column({ type: 'text', comment: '标签(JSON数组)', nullable: true })
  topics: string;

  @Column({ length: 500, comment: '仓库链接' })
  html_url: string;

  @Column({ type: 'longtext', comment: 'README 原文', nullable: true })
  readme: string;

  @Column({ type: 'int', comment: '向量块数', default: 0 })
  chunkCount: number;

  @CreateDateColumn()
  uploadTime: Date;
}
