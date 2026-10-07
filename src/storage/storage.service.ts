import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';

@Injectable()
export class StorageService {
  private readonly root: string;

  constructor(config: ConfigService) {
    this.root = resolve(config.get<string>('UPLOAD_DIR', 'uploads'));
  }

  /** Guarda el archivo y devuelve la clave relativa con la que se recupera. */
  async save(buffer: Buffer, originalName: string): Promise<string> {
    await mkdir(this.root, { recursive: true });
    const key = `${randomUUID()}${extname(originalName).toLowerCase()}`;
    await writeFile(this.pathFor(key), buffer);
    return key;
  }

  getStream(key: string) {
    const path = this.pathFor(key);
    if (!existsSync(path)) throw new NotFoundException('Archivo no encontrado');
    return createReadStream(path);
  }

  async delete(key: string) {
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
