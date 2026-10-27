import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const sampleDocuments = [
  { name: 'RUT', description: 'Registro Unico Tributario', required: true, expires: false },
  { name: 'Camara de comercio', description: 'Certificado de existencia y representacion legal (no mayor a 30 dias)', required: true, expires: true },
  { name: 'Poliza de responsabilidad civil', description: 'Poliza vigente de responsabilidad civil extracontractual', required: true, expires: true },
  { name: 'Planilla de seguridad social', description: 'Pago de aportes a seguridad social del mes', required: true, expires: true },
  { name: 'Certificado bancario', description: 'Certificacion de cuenta bancaria', required: true, expires: false },
  { name: 'Certificado SG-SST', description: 'Sistema de gestion de seguridad y salud en el trabajo', required: false, expires: true },
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

  let project = await prisma.project.findFirst({
    where: { contractorId: contractor.id, name: 'Proyecto general' },
  });
  if (!project) {
    project = await prisma.project.create({
      data: {
        name: 'Proyecto general',
        description: 'Proyecto de ejemplo',
        code: 'GEN-001',
        contractorId: contractor.id,
      },
    });
  }

  for (const doc of sampleDocuments) {
    await prisma.document.upsert({
      where: { projectId_name: { projectId: project.id, name: doc.name } },
      update: {},
      create: { ...doc, projectId: project.id },
    });
  }

  const documents = await prisma.document.findMany({ where: { projectId: project.id } });

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
    const link = await prisma.projectWorker.upsert({
      where: { projectId_workerId: { projectId: project.id, workerId: worker.id } },
      update: {},
      create: { projectId: project.id, workerId: worker.id },
    });
    await prisma.projectWorkerDocument.createMany({
      data: documents.map((d) => ({ projectWorkerId: link.id, documentId: d.id })),
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
