import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

// Requiere la base de datos migrada y con el seed aplicado (npm run db:seed).
describe('Flujo de documentacion (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const suffix = Date.now().toString();
  const password = 'Secreta123*';
  let contractorId: string;
  let projectId: string;
  let contractorUserId: string;

  const login = async (email: string, pass = 'Admin123*') => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: pass })
      .expect(200);
    return res.body.accessToken as string;
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (contractorUserId) await prisma.user.deleteMany({ where: { id: contractorUserId } });
    if (contractorId) await prisma.contractor.deleteMany({ where: { id: contractorId } });
    await app.close();
  });

  it('rechaza peticiones sin token', () =>
    request(app.getHttpServer()).get('/api/contractors').expect(401));

  it('rechaza credenciales invalidas', () =>
    request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin@contractors.local', password: 'incorrecta' })
      .expect(401));

  it('recorre subida, rechazo, resubida y aprobacion hasta quedar habilitado', async () => {
    const server = app.getHttpServer();
    const adminToken = await login('admin@contractors.local');
    const approverToken = await login('aprobador@contractors.local');

    const contractor = await request(server)
      .post('/api/contractors')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: `Contratista E2E ${suffix}`, taxId: `E2E-${suffix}` })
      .expect(201);
    contractorId = contractor.body.id;
    expect(contractor.body.status).toBe('INCOMPLETE');

    const project = await request(server)
      .post(`/api/contractors/${contractorId}/projects`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: `Proyecto E2E ${suffix}`, code: `E2E-${suffix}` })
      .expect(201);
    projectId = project.body.id;

    const createdDocs = [];
    for (const [i, name] of ['RUT', 'Poliza'].entries()) {
      const doc = await request(server)
        .post(`/api/projects/${projectId}/documents`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name,
          required: true,
          expires: i === 1,
          description: `Doc e2e ${name}`,
        })
        .expect(201);
      createdDocs.push(doc.body);
    }

    const user = await request(server)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: `e2e-${suffix}@contractors.local`,
        name: 'Usuario E2E',
        password,
        role: 'CONTRACTOR_USER',
        contractorId,
      })
      .expect(201);
    contractorUserId = user.body.id;
    const contractorToken = await login(`e2e-${suffix}@contractors.local`, password);

    const docs = await request(server)
      .get(`/api/projects/${projectId}/documents`)
      .set('Authorization', `Bearer ${contractorToken}`)
      .expect(200);
    const required = docs.body.filter((d: { required: boolean }) => d.required);
    expect(required.length).toBe(2);

    const otherProject = await prisma.project.findFirstOrThrow({
      where: { contractorId: { not: contractorId } },
    });
    await request(server)
      .get(`/api/projects/${otherProject.id}/documents`)
      .set('Authorization', `Bearer ${contractorToken}`)
      .expect(403);

    await request(server)
      .get('/api/reviews/pending')
      .set('Authorization', `Bearer ${contractorToken}`)
      .expect(403);

    const upload = (documentId: string, expires: boolean) => {
      const req = request(server)
        .post(`/api/projects/${projectId}/documents/${documentId}/file`)
        .set('Authorization', `Bearer ${contractorToken}`)
        .attach('file', Buffer.from('%PDF-1.4 e2e'), {
          filename: 'documento.pdf',
          contentType: 'application/pdf',
        });
      if (expires) req.field('expiresAt', new Date(Date.now() + 90 * 86400000).toISOString());
      return req;
    };

    const review = (id: string, action: string, comment?: string) =>
      request(server)
        .post(`/api/documents/${id}/review`)
        .set('Authorization', `Bearer ${approverToken}`)
        .send({ action, comment });

    const first = required[0];
    await request(server)
      .post(`/api/projects/${projectId}/documents/${first.id}/file`)
      .set('Authorization', `Bearer ${contractorToken}`)
      .attach('file', Buffer.from('texto'), { filename: 'nota.txt', contentType: 'text/plain' })
      .expect(400);

    const submitted = await upload(first.id, first.expires).expect(201);
    expect(submitted.body.status).toBe('SUBMITTED');

    await review(submitted.body.id, 'REJECTED').expect(400);
    const rejected = await review(submitted.body.id, 'REJECTED', 'Documento ilegible').expect(201);
    expect(rejected.body.status).toBe('REJECTED');
    await review(submitted.body.id, 'APPROVED').expect(400);

    for (const doc of required) {
      const res = await upload(doc.id, doc.expires).expect(201);
      await review(res.body.id, 'APPROVED').expect(201);
    }

    const history = await request(server)
      .get(`/api/documents/${submitted.body.id}/reviews`)
      .set('Authorization', `Bearer ${contractorToken}`)
      .expect(200);
    expect(history.body.map((r: { action: string }) => r.action)).toEqual(['APPROVED', 'REJECTED']);

    const detail = await request(server)
      .get(`/api/contractors/${contractorId}`)
      .set('Authorization', `Bearer ${contractorToken}`)
      .expect(200);
    expect(detail.body.status).toBe('COMPLIANT');
  });
});
