import { Injectable, Inject, HttpException, HttpStatus } from '@nestjs/common';
import { RegisterDto } from './dto/register.dto';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/User.entity';
import { RedisService } from '../redis/redis.service';
import { Permission } from './entities/Permission.entity';
import { md5 } from 'src/utils';
import { LoginDto } from './dto/login.dto';
import { LoginUserVo } from './vo/login-user.vo';
import { updateInfoDto } from './dto/updateInfo.dto';
import { EmailService } from '../email/email.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class AuthService {
  private logger = new Logger();

  @InjectRepository(User)
  private userRepository: Repository<User>;

  @Inject(RedisService)
  private redisService: RedisService;
  @Inject(EmailService)
  private emailService: EmailService;

  // 注册用户
  async register(register: RegisterDto) {
    const captcha = await this.redisService.get(`captcha_${register.email}`);
    if (!captcha) {
      throw new HttpException(
        '验证码已过期，请重新获取',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (captcha !== register.captcha) {
      throw new HttpException('验证码错误', HttpStatus.BAD_REQUEST);
    }
    await this.redisService.del(`captcha_${register.email}`);
    const foundUser = await this.userRepository.findOne({
      where: {
        username: register.username,
      },
    });
    if (foundUser) {
      throw new HttpException('用户名已存在', HttpStatus.CONFLICT);
    }
    const foundEmail = await this.userRepository.findOneBy({
      email: register.email,
    });
    if (foundEmail) {
      throw new HttpException('该邮箱已被注册', HttpStatus.CONFLICT);
    }
    const newUser = this.userRepository.create({
      username: register.username,
      password: md5(register.password),
      email: register.email,
      inviteCode: uuidv4(),
    });
    try {
      await this.userRepository.save(newUser);
      return {
        message: '注册成功',
        inviteCode: newUser.inviteCode,
      };
    } catch (error) {
      this.logger.error(error, AuthService);
      throw new HttpException(
        '注册失败，请稍后重试',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // 登录用户
  async login(login: LoginDto) {
    const foundUser = await this.userRepository.findOne({
      where: { username: login.username },
      relations: ['roles', 'roles.permissions'],
    });

    if (!foundUser)
      throw new HttpException('用户名不存在', HttpStatus.BAD_REQUEST);
    if (foundUser.password !== md5(login.password))
      throw new HttpException('密码错误', HttpStatus.BAD_REQUEST);

    // --- 显式去重角色和权限 ---
    const vo = new LoginUserVo();
    vo.userInfo = {
      id: foundUser.id,
      username: foundUser.username,
      email: foundUser.email,
      headPic: foundUser.headPic,
      status: foundUser.status,
      createTime: foundUser.createTime.getTime(),
      roles: foundUser.roles.map((item) => item.name),
      permissions: foundUser.roles.reduce<Permission[]>((arr, item) => {
        item.permissions.forEach((permission) => {
          if (!arr.includes(permission)) {
            arr.push(permission);
          }
        });
        return arr;
      }, []),
      inviteCode: foundUser.inviteCode ?? null,
    };

    return vo;
  }
  //根据id查询用户信息
  async findUserById(id: number) {
    const foundUser = await this.userRepository.findOne({
      where: { id },
      relations: ['roles', 'roles.permissions'],
    });
    if (!foundUser) throw new Error('用户不存在');
    return {
      id: foundUser.id,
      username: foundUser.username,
      roles: foundUser.roles.map((item) => item.name),
      permissions: foundUser.roles.reduce<Permission[]>((arr, item) => {
        item.permissions.forEach((permission) => {
          if (!arr.includes(permission)) {
            arr.push(permission);
          }
        });
        return arr;
      }, []),
      inviteCode: foundUser.inviteCode ?? null,
    };
  }

  //信息修改接口
  async updateInfo(userId: number, updateInfoDto: updateInfoDto) {
    const captcha = await this.redisService.get(
      `update_password_captcha_${updateInfoDto.email}`,
    );

    if (!captcha) {
      throw new HttpException('验证码已失效', HttpStatus.BAD_REQUEST);
    }
    if (updateInfoDto.captcha !== captcha) {
      throw new HttpException('验证码不正确', HttpStatus.BAD_REQUEST);
    }

    const foundUser = await this.userRepository.findOneBy({
      id: userId,
    });
    if (!foundUser) throw new Error('用户不存在');
    foundUser.headPic = updateInfoDto.headPic;
    foundUser.email = updateInfoDto.email;
    await this.userRepository.save(foundUser);
    return '修改成功';
  }

  // 忘记密码 - 验证用户名+邮箱，生成新密码并发送邮件
  async forgotPassword(username: string, email: string) {
    const foundUser = await this.userRepository.findOne({
      where: { username },
    });
    if (!foundUser) {
      throw new HttpException('用户名不存在', HttpStatus.BAD_REQUEST);
    }
    if (foundUser.email !== email) {
      throw new HttpException('用户名与邮箱不匹配', HttpStatus.BAD_REQUEST);
    }

    const newPassword = Math.random().toString(36).slice(2, 10);
    foundUser.password = md5(newPassword);
    await this.userRepository.save(foundUser);

    await this.emailService.sendEmail({
      to: email,
      subject: '您的密码已重置',
      text: `您好 ${username}，您的新密码是：${newPassword}，请登录后尽快修改密码`,
    });

    return '新密码已发送至您的注册邮箱';
  }
}
