import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @IsNotEmpty({ message: '用户名不能为空' })
  username: string;
  @IsNotEmpty({ message: '密码不能为空' })
  @IsString({ message: '密码必须是字符串' })
  @MinLength(6, { message: '密码长度不能小于6位' })
  password: string;
  @IsNotEmpty({ message: '邮箱不能为空' })
  @IsString({ message: '邮箱必须是字符串' })
  @IsEmail({}, { message: '邮箱格式错误' })
  email: string;
  @IsNotEmpty({
    message: '验证码不能为空',
  })
  captcha: string;
}
