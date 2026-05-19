import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  Inject,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { RedisService } from 'src/redis/redis.service';
import { EmailService } from 'src/email/email.service';
import { LoginDto } from './dto/login.dto';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { updateInfoDto } from './dto/updateInfo.dto';
import { UserInfo } from 'src/server.decorator';
import { ForgotPasswordDto } from './dto/forgot-password.dto';

@Controller('auth')
export class AuthController {
  @Inject(ConfigService)
  private configService: ConfigService;
  @Inject(RedisService)
  private readonly redisService: RedisService;
  @Inject(AuthService)
  private readonly authService: AuthService;
  @Inject(EmailService)
  private readonly emailService: EmailService;
  @Inject(JwtService)
  private readonly jwtService: JwtService;

  // 注册用户接口
  @Post('register')
  register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }
  // 获取注册验证码接口
  @Get('register-captcha')
  async getRegisterCaptcha(@Query('address') address: string) {
    const code = Math.random().toString().slice(2, 8);

    await this.redisService.set(`captcha_${address}`, code, 5 * 60);

    await this.emailService.sendEmail({
      to: address,
      subject: '注册验证码',
      text: `您的验证码是：${code}`,
    });
  }
  // 登录接口
  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    const vo = await this.authService.login(loginDto);

    vo.accessToken = this.jwtService.sign(
      {
        userId: vo.userInfo.id,
        username: vo.userInfo.username,
        role: vo.userInfo.roles,
        permissions: vo.userInfo.permissions,
      },
      {
        expiresIn:
          this.configService.get('jwt_access_token_expires_time') || '30m',
      },
    );
    vo.refreshToken = this.jwtService.sign(
      {
        userId: vo.userInfo.id,
      },
      {
        expiresIn:
          this.configService.get('jwt_refresh_token_expires_time') || '7d',
      },
    );
    return vo;
  }

  // 刷新token接口
  @Post('refresh')
  async refresh(@Query('refreshToken') refreshToken: string) {
    try {
      const data = this.jwtService.verify(refreshToken);
      const userInfo = await this.authService.findUserById(data.userId);
      const access_token = this.jwtService.sign(
        {
          userId: userInfo.id,
          username: userInfo.username,
          role: userInfo.roles,
          permissions: userInfo.permissions,
        },
        {
          expiresIn:
            this.configService.get('jwt_access_token_expires_time') || '30m',
        },
      );
      const refresh_token = this.jwtService.sign(
        {
          userId: userInfo.id,
        },
        {
          expiresIn:
            this.configService.get('jwt_refresh_token_expires_time') || '7d',
        },
      );
      return {
        code: 200,
        msg: '刷新成功',
        access_token,
        refresh_token,
        inviteCode: userInfo.inviteCode,
      };
    } catch (err) {
      return {
        code: 401,
        msg: err.message,
      };
    }
  }

  //信息修改接口
  @Post('update-info')
  async updateInfo(
    @UserInfo('UserId') userId: number,
    @Body() updateInfoDto: updateInfoDto,
  ) {
    return this.authService.updateInfo(userId, updateInfoDto);
  }

  // 忘记密码 - 生成新密码发送至邮箱
  @Post('forgot-password')
  forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(
      forgotPasswordDto.username,
      forgotPasswordDto.email,
    );
  }
}
