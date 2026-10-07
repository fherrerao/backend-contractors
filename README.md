# Backend - Gestion de Contratistas

API REST en NestJS 12 + Prisma 7 + PostgreSQL para gestionar contratistas y el control de su documentacion: los usuarios del contratista suben documentos y los aprobadores internos los aprueban o rechazan. El estado de cumplimiento del contratista se recalcula automaticamente.

## Requisitos

- Node.js 22+
- Docker (para PostgreSQL) o una instancia de PostgreSQL 16

## Puesta en marcha

```bash
cp .env.example .env        # ajusta los valores si es necesario
npm install                 # tambien genera el cliente de Prisma
npm run db:up               # levanta PostgreSQL en el puerto 5433
npm run db:migrate          # aplica las migraciones
npm run db:seed             # usuarios, tipos de documento y un contratista de ejemplo
npm run start:dev           # API en http://localhost:3001/api
```

### Usuarios del seed

Todos usan la contrasena `Admin123*`.

| Email | Rol |
| --- | --- |
| admin@contractors.local | Administrador |
| aprobador@contractors.local | Aprobador |
| contratista@contractors.local | Usuario del contratista "Construcciones Andinas S.A.S." |

## Variables de entorno

| Variable | Descripcion |
| --- | --- |
| `DATABASE_URL` | Cadena de conexion de PostgreSQL |
| `JWT_SECRET` | Secreto para firmar los tokens |
| `JWT_EXPIRES_IN` | Duracion del token (por defecto `8h`) |
| `PORT` | Puerto de la API (por defecto `3001`) |
| `UPLOAD_DIR` | Carpeta donde se guardan los archivos (por defecto `uploads`) |
| `MAX_UPLOAD_MB` | Tamano maximo por archivo (por defecto `10`) |
| `CORS_ORIGIN` | Origenes permitidos, separados por coma |

## Roles

- `ADMIN`: gestiona contratistas, usuarios y tipos de documento; puede subir y revisar.
- `APPROVER`: ve todos los contratistas y la cola de revision; aprueba o rechaza (el rechazo exige comentario).
- `CONTRACTOR_USER`: ligado a un contratista; solo ve y sube documentos de su empresa.

## Flujo de documentos

`PENDING` -> `SUBMITTED` (subida) -> `APPROVED` o `REJECTED` (revision). Un rechazado o vencido se vuelve a subir y regresa a `SUBMITTED`. Un job diario (1:00 a.m. y al arrancar) marca como `EXPIRED` los aprobados cuya fecha de vencimiento ya paso.

El contratista queda `COMPLIANT` cuando todos los tipos obligatorios estan aprobados y vigentes, `EXPIRED` si alguno vencio, e `INCOMPLETE` en otro caso.

## Endpoints principales

Todas las rutas usan el prefijo `/api` y requieren `Authorization: Bearer <token>`, salvo login y health.

| Metodo | Ruta | Roles |
| --- | --- | --- |
| POST | `/auth/login` | Publico |
| GET | `/auth/me` | Autenticado |
| GET | `/dashboard/stats` | Autenticado |
| GET, POST | `/contractors` | GET: autenticado (contratista ve solo el suyo). POST: ADMIN |
| GET, PATCH | `/contractors/:id` | GET: con alcance. PATCH: ADMIN |
| GET | `/contractors/:id/documents` | Con alcance |
| POST | `/contractors/:id/documents/:typeId` | CONTRACTOR_USER, ADMIN (multipart: `file`, `expiresAt`) |
| GET | `/documents/:id/file` | Con alcance (acepta `?token=` para abrir en pestana nueva) |
| GET | `/documents/:id/reviews` | Con alcance |
| POST | `/documents/:id/review` | APPROVER, ADMIN (`{ action, comment }`) |
| GET | `/reviews/pending`, `/reviews/pending/count` | APPROVER, ADMIN |
| GET, POST, PATCH | `/document-types` | GET: autenticado. Escritura: ADMIN |
| GET, POST, PATCH | `/users` | ADMIN |

## Estructura

```
src/
  auth/            login JWT, guards globales, @Public, @Roles, alcance por contratista
  compliance/      calculo de cumplimiento, job de vencimientos, estadisticas
  contractors/
  document-types/
  documents/       checklist, subida y descarga de archivos
  reviews/         cola de revision y aprobacion/rechazo
  storage/         almacenamiento local de archivos (reemplazable por S3)
  users/
  prisma/          PrismaService
prisma/
  schema.prisma
  seed.ts
```

## Tests

```bash
npm run test       # unitarios
npm run test:e2e   # flujo completo contra la base de datos (requiere migraciones y seed)
```
