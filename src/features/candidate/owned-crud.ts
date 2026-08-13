import { NotFoundError } from "@/core/errors/application-errors";

export interface OwnedRecord {
  readonly id: string;
  readonly userId: string;
}

export interface OwnedRecordRepository<TRecord extends OwnedRecord, TInput> {
  create(userId: string, input: TInput): Promise<TRecord>;
  find(id: string, userId: string): Promise<TRecord | null>;
  update(id: string, userId: string, input: TInput): Promise<TRecord | null>;
  delete(id: string, userId: string): Promise<boolean>;
}

export class OwnedCrud<TRecord extends OwnedRecord, TInput> {
  constructor(
    private readonly repository: OwnedRecordRepository<TRecord, TInput>,
  ) {}

  create(userId: string, input: TInput): Promise<TRecord> {
    return this.repository.create(userId, input);
  }

  async read(userId: string, id: string): Promise<TRecord> {
    const record = await this.repository.find(id, userId);
    if (!record) throw new NotFoundError();
    return record;
  }

  async update(userId: string, id: string, input: TInput): Promise<TRecord> {
    const record = await this.repository.update(id, userId, input);
    if (!record) throw new NotFoundError();
    return record;
  }

  async delete(userId: string, id: string): Promise<void> {
    if (!(await this.repository.delete(id, userId))) throw new NotFoundError();
  }
}
