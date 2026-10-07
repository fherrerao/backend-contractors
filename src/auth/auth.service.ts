import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthUser } from './auth.types.js';
import { LoginDto } from './dto/login.dto.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login({ email, password }: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (!user || !user.isActive || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Credenciales invalidas');
    }

    const payload: AuthUser = {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      contractorId: user.contractorId,
    };
    return {
      accessToken: await this.jwt.signAsync(payload),
      user: await this.me(user.id),
    };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        contractorId: true,
        contractor: { select: { id: true, name: true, status: true } },
      },
    });
    if (!user) throw new UnauthorizedException();
    return user;
  }
}
