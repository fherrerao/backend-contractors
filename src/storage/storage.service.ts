import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Storage } from '@google-cloud/storage';
import { randomUUID } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import type { Readable } from 'node:stream';

type StorageDriver = 'local' | 'gcs';

@Injectable()
export class StorageService {
  private readonly driver: StorageDriver;
  private readonly root: string;
  private readonly bucketName: string | undefined;
  private readonly gcs: Storage | null;

  constructor(config: ConfigService) {
    this.driver = (config.get<string>('STORAGE_DRIVER', 'local') as StorageDriver) || 'local';
    this.root = resolve(config.get<string>('UPLOAD_DIR', 'uploads'));
    this.bucketName = config.get<string>('GCS_BUCKET');
    this.gcs = this.driver === 'gcs' ? new Storage() : null;

    if (this.driver === 'gcs' && !this.bucketName) {
      throw new Error('GCS_BUCKET is required when STORAGE_DRIVER=gcs');
    }
  }

  /** Guarda el archivo y devuelve la clave relativa con la que se recupera. */
  async save(buffer: Buffer, originalName: string): Promise<string> {
    const key = `${randomUUID()}${extname(originalName).toLowerCase()}`;

    if (this.driver === 'gcs') {
      const bucket = this.gcs!.bucket(this.bucketName!);
      await bucket.file(key).save(buffer, {
        resumable: false,
        metadata: { contentType: undefined },
      });
      return key;
    }

    await mkdir(this.root, { recursive: true });
    await writeFile(this.pathFor(key), buffer);
    return key;
  }

  async getStream(key: string): Promise<Readable> {
    if (this.driver === 'gcs') {
      const file = this.gcs!.bucket(this.bucketName!).file(key);
      const [exists] = await file.exists();
      if (!exists) throw new NotFoundException('Archivo no encontrado');
      return file.createReadStream();
    }

    const path = this.pathFor(key);
    if (!existsSync(path)) throw new NotFoundException('Archivo no encontrado');
    return createReadStream(path);
  }

  async delete(key: string) {
    if (this.driver === 'gcs') {
      try {
        await this.gcs!.bucket(this.bucketName!).file(key).delete({ ignoreNotFound: true });
      } catch (error) {
        const code = (error as { code?: number }).code;
        if (code !== 404) throw error;
      }
      return;
    }

    try {
      await unlink(this.pathFor(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  private pathFor(key: string) {
    const path = resolve(this.root, key);
    if (!path.startsWith(this.root)) throw new NotFoundException('Archivo no encontrado');
    return path;
  }
}
