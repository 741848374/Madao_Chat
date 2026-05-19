import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Permission } from './auth/entities/Permission.entity';

interface JwtUserData {
  userId: number;
  username: string;
  roles: string[];
  permissions: Permission[];
}
declare module 'express' {
  interface Request {
    user: JwtUserData;
  }
}
@Injectable()
export class LoginGuard implements CanActivate {
  @Inject(Reflector)
  private reflector: Reflector;
  @Inject(JwtService)
  private jwtService: JwtService;
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();

    //
    const requireLogin = this.reflector.getAllAndOverride('require-login', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requireLogin) {
      return true;
    }
    const authorization = request.headers.authorization;
    if (!authorization) {
      throw new UnauthorizedException('用户未登录');
    }
    try {
      const token = authorization.split(' ')[1];
      const payload = this.jwtService.verify<JwtUserData>(token);
      request.user = {
        UserId: payload.userId,
        username: payload.username,
        roles: payload.roles,
        permissions: payload.permissions,
      };
      return true;
    } catch (err) {
      throw new UnauthorizedException('token无效,请重新登录');
    }
  }
}
