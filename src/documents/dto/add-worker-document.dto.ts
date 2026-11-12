import { IsUUID } from 'class-validator';

export class AddWorkerDocumentDto {
  @IsUUID()
  requirementId: string;
}
