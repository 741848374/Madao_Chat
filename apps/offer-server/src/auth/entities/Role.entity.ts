import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { User } from './User.entity';
import { Permission } from './Permission.entity';

@Entity({
  name: 'roles',
})
export class Role {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({
    length: 20,
    comment: '角色名',
  })
  name: string;
  @ManyToMany(() => Permission, {
    cascade: ['insert', 'update'], // 可选：级联保存/更新
    eager: false,
  })
  @JoinTable({
    name: 'role_permissions',
  })
  permissions: Permission[];
}
