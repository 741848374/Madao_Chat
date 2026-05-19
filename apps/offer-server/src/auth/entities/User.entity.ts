import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToMany,
  OneToMany,
  JoinTable,
} from 'typeorm';
import { Role } from './Role.entity';
import { UploadFile } from '../../ai/entities/UploadFile.entity';
import { GithubKnowledge } from '../../github/entities/github-knowledge.entity';
@Entity({
  name: 'user',
})
export class User {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({
    length: 50,
    comment: '用户名',
    unique: true,
  })
  username: string;
  @Column({
    length: 50,
    comment: '密码',
  })
  password: string;
  @Column({
    length: 50,
    comment: '邮箱',
    unique: true,
  })
  email: string;
  @Column({
    comment: '头像',
    length: 100,
    nullable: true,
  })
  headPic: string;

  @Column({
    comment: '用户状态',
    default: 1,
  })
  status: number;

  @Column({
    length: 36,
    comment: '面试邀请码(UUID)',
    unique: true,
    nullable: true,
  })
  inviteCode: string;

  @CreateDateColumn()
  createTime: Date;

  @UpdateDateColumn()
  updateTime: Date;

  @ManyToMany(() => Role, {
    cascade: ['insert', 'update'], // 可选：级联保存/更新
    eager: false,
  })
  @JoinTable({
    name: 'user_roles',
  })
  roles: Role[];

  @OneToMany(() => UploadFile, (f) => f.user)
  uploadFiles: UploadFile[];

  @OneToMany(() => GithubKnowledge, (g) => g.user)
  githubKnowledge: GithubKnowledge[];
}
