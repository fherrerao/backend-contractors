import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const documentTypes = [
  { name: 'RUT', description: 'Registro Unico Tributario', required: true, expires: false },
  { name: 'Camara de comercio', description: 'Certificado de existencia y representacion legal (no mayor a 30 dias)', required: true, expires: true },
  { name: 'Poliza de responsabilidad civil', description: 'Poliza vigente de responsabilidad civil extracontractual', required: true, expires: true },
  { name: 'Planilla de seguridad social', description: 'Pago de aportes a seguridad social del mes', required: true, expires: true },
  { name: 'Certificado bancario', description: 'Certificacion de cuenta bancaria', required: true, expires: false },
  { name: 'Certificado SG-SST', description: 'Sistema de gestion de seguridad y salud en el trabajo', required: false, expires: true },
];

async function main() {
  const passwordHash = await bcrypt.hash('Admin123*', 10);

  for (const type of documentTypes) {
    await prisma.documentType.upsert({
      where: { name: type.name },
      update: {},
      create: type,
    });
  }

  await prisma.user.upsert({
    where: { email: 'admin@contractors.local' },
    update: {},
    create: { email: 'admin@contractors.local', name: 'Administrador', role: 'ADMIN', passwordHash },
  });

  await prisma.user.upsert({
    where: { email: 'aprobador@contractors.local' },
    update: {},
    create: { email: 'aprobador@contractors.local', name: 'Aprobador HSE', role: 'APPROVER', passwordHash },
  });

  const contractor = await prisma.contractor.upsert({
    where: { taxId: '900123456-7' },
    update: {},
    create: {
      name: 'Construcciones Andinas S.A.S.',
      taxId: '900123456-7',
      email: 'contacto@andinas.co',
      phone: '+57 300 000 0000',
      contactName: 'Laura Gomez',
    },
  });

  const types = await prisma.documentType.findMany({ where: { isActive: true } });
  await prisma.document.createMany({
    data: types.map((t) => ({ contractorId: contractor.id, typeId: t.id })),
    skipDuplicates: true,
  });

  await prisma.user.upsert({
    where: { email: 'contratista@contractors.local' },
    update: {},
    create: {
      email: 'contratista@contractors.local',
      name: 'Laura Gomez',
      role: 'CONTRACTOR_USER',
      contractorId: contractor.id,
      passwordHash,
    },
  });

  console.log('Seed completado. Contrasena de todos los usuarios: Admin123*');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
