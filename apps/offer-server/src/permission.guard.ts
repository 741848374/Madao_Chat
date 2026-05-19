import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { Reflector } from '@nestjs/core';
import { Inject } from '@nestjs/common';

@Injectable()
export class PermissionGuard implements CanActivate {
  @Inject(Reflector)
  private reflector: Reflector;
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    if (!request.user) {
      return true;
    }
    const permissions = request.user.permissions;
    console.log('permissions:', permissions);
    const requiredPermission = this.reflector.getAllAndOverride(
      'require-permission',

      [context.getHandler(), context.getClass()],
    );
    if (!requiredPermission) {
      return true;
    }

    for (const curPermission of requiredPermission) {
      const found = permissions.find((item) => item.code === curPermission);
      if (!found) {
        throw new UnauthorizedException('您没有访问该接口的权限');
      }
    }
    return true;
  }
}
