import { Controller, Get, UseGuards } from '@nestjs/common';
import { AppService } from './app.service';
import { RequirePermission } from './server.decorator';
import { RequireLogin } from './server.decorator';

@Controller()
@RequireLogin()
export class AppController {
  constructor(private readonly appService: AppService) {}
  @RequirePermission(['case2'])
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
