import { Controller, Get, Query, Inject } from '@nestjs/common';
import { EmailService } from './email.service';
import { RedisService } from 'src/redis/redis.service';

@Controller('email')
export class EmailController {
  @Inject(RedisService)
  private readonly redisService: RedisService;
  constructor(private readonly emailService: EmailService) {}
  @Get('update_password/captcha')
  async updatePasswordCaptcha(@Query('address') address: string) {
    const code = Math.random().toString().slice(2, 8);

    await this.redisService.set(
      `update_password_captcha_${address}`,
      code,
      10 * 60,
    );

    await this.emailService.sendEmail({
      to: address,
      subject: 'MADAO验证码',
      text: `你的MADAO验证码是 ${code}`,
    });
    return '发送成功';
  }
}
