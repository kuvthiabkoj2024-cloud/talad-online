import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service.js';

/** Units of sale (kg, pcs, box…) for product forms (§2.6). */
@ApiTags('catalog')
@Controller('units')
export class UnitsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.unit.findMany({ orderBy: { code: 'asc' }, select: { id: true, code: true, name: true } });
  }
}
