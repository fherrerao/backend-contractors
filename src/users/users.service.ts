import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto.js';

const userSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  isActive: true,
  contractorId: true,
  contractor: { select: { id: true, name: true } },
  createdAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.user.findMany({ select: userSelect, orderBy: { createdAt: 'desc' } });
  }

  async create(dto: CreateUserDto) {
    await this.assertContractor(dto.role, dto.contractorId);
    const email = dto.email.toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw new ConflictException('Ya existe un usuario con ese email');
    }
    return this.prisma.user.create({
      data: {
        email,
        name: dto.name,
        role: dto.role,
        contractorId: dto.role === 'CONTRACTOR_USER' ? dto.contractorId : null,
        passwordHash: await bcrypt.hash(dto.password, 10),
      },
      select: userSelect,
    });
  }

  async update(id: string, dto: UpdateUserDto) {
    const current = await this.prisma.user.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Usuario no encontrado');

    const role = dto.role ?? current.role;
    const contractorId =
      role === 'CONTRACTOR_USER' ? (dto.contractorId ?? current.contractorId) : null;
    await this.assertContractor(role, contractorId);

    if (dto.email && dto.email.toLowerCase() !== current.email) {
      const exists = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
      if (exists) throw new ConflictException('Ya existe un usuario con ese email');
    }

    return this.prisma.user.update({
      where: { id },
      data: {
        email: dto.email?.toLowerCase(),
        name: dto.name,
        role,
        contractorId,
        isActive: dto.isActive,
        passwordHash: dto.password ? await bcrypt.hash(dto.password, 10) : undefined,
      },
      select: userSelect,
    });
  }

  private async assertContractor(role: string, contractorId?: string | null) {
    if (role !== 'CONTRACTOR_USER') return;
    if (!contractorId) {
      throw new BadRequestException('Un usuario de contratista debe tener contratista asignado');
    }
    const exists = await this.prisma.contractor.findUnique({ where: { id: contractorId } });
    if (!exists) throw new BadRequestException('El contratista no existe');
  }
}
