import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import { Request } from 'express';
// 登录装饰器
export const RequireLogin = () => SetMetadata('require-login', true);

// 公共接口装饰器
export const Public = () => SetMetadata('require-login', false);

// 权限装饰器
export const RequirePermission = (permission: string[]) =>
  SetMetadata('require-permission', permission);

// 用户信息装饰器
export const UserInfo = createParamDecorator(
  (data: string, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<Request>();

    if (!request.user) {
      return null;
    }
    return data ? request.user[data] : request.user;
  },
);
