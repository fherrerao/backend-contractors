import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const sampleRequirements = [
  { name: 'Cedula de ciudadania', description: 'Documento de identidad vigente', required: true, expires: false },
  { name: 'Certificado medico ocupacional', description: 'Apto para el cargo', required: true, expires: true },
  { name: 'ARL', description: 'Afiliacion a riesgos laborales', required: true, expires: true },
  { name: 'Seguridad social', description: 'Pago de aportes del mes', required: true, expires: true },
  { name: 'Certificado de alturas', description: 'Solo si el cargo lo requiere', required: false, expires: true },
];

async function main() {
  const passwordHash = await bcrypt.hash('Admin123*', 10);

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

  const existingProject = await prisma.project.findFirst({
    where: { contractorId: contractor.id, name: 'Proyecto general' },
  });
  const project =
    existingProject ??
    (await prisma.project.create({
      data: {
        name: 'Proyecto general',
        description: 'Proyecto de ejemplo',
        code: 'GEN-001',
        contractorId: contractor.id,
      },
    }));

  for (const item of sampleRequirements) {
    const requirement = await prisma.requirement.upsert({
      where: { contractorId_name: { contractorId: contractor.id, name: item.name } },
      update: { isActive: true },
      create: { name: item.name, contractorId: contractor.id, isActive: true },
    });
    await prisma.projectDocument.upsert({
      where: { projectId_requirementId: { projectId: project.id, requirementId: requirement.id } },
      update: {
        description: item.description,
        required: item.required,
        expires: item.expires,
      },
      create: {
        projectId: project.id,
        requirementId: requirement.id,
        description: item.description,
        required: item.required,
        expires: item.expires,
      },
    });
  }

  const requirements = await prisma.requirement.findMany({
    where: { contractorId: contractor.id, isActive: true },
  });

  const worker1 = await prisma.worker.upsert({
    where: { contractorId_documentId: { contractorId: contractor.id, documentId: '1234567890' } },
    update: {},
    create: {
      name: 'Carlos Perez',
      documentId: '1234567890',
      position: 'Soldador',
      phone: '+57 310 111 2233',
      email: 'carlos.perez@andinas.co',
      contractorId: contractor.id,
    },
  });

  const worker2 = await prisma.worker.upsert({
    where: { contractorId_documentId: { contractorId: contractor.id, documentId: '9876543210' } },
    update: {},
    create: {
      name: 'Maria Lopez',
      documentId: '9876543210',
      position: 'Supervisora de obra',
      phone: '+57 320 444 5566',
      email: 'maria.lopez@andinas.co',
      contractorId: contractor.id,
    },
  });

  for (const worker of [worker1, worker2]) {
    await prisma.document.createMany({
      data: requirements.map((requirement) => ({
        workerId: worker.id,
        requirementId: requirement.id,
      })),
      skipDuplicates: true,
    });
  }

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
