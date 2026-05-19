import { Permission } from '../entities/Permission.entity';

interface UserInfo {
  id: number;

  username: string;

  email: string;

  headPic: string;

  status: number;
  createTime: number;

  roles: string[];

  permissions: Permission[];

  inviteCode: string | null;
}
export class LoginUserVo {
  userInfo: UserInfo;

  accessToken: string;

  refreshToken: string;
}
