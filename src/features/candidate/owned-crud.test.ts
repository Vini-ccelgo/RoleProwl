import { describe, expect, it } from "vitest";
import { NotFoundError } from "@/core/errors/application-errors";
import { OwnedCrud, type OwnedRecordRepository } from "./owned-crud";

interface FixtureRecord {
  readonly id: string;
  readonly userId: string;
  readonly value: string;
}

class FixtureRepository implements OwnedRecordRepository<
  FixtureRecord,
  { value: string }
> {
  private readonly records = new Map<string, FixtureRecord>();
  async create(userId: string, input: { value: string }) {
    const record = { id: `record-${this.records.size + 1}`, userId, ...input };
    this.records.set(record.id, record);
    return record;
  }
  async find(id: string, userId: string) {
    const record = this.records.get(id);
    return record?.userId === userId ? record : null;
  }
  async update(id: string, userId: string, input: { value: string }) {
    const record = await this.find(id, userId);
    if (!record) return null;
    const updated = { ...record, ...input };
    this.records.set(id, updated);
    return updated;
  }
  async delete(id: string, userId: string) {
    return (await this.find(id, userId)) ? this.records.delete(id) : false;
  }
}

describe("owned candidate CRUD", () => {
  it("creates, reads, updates, and deletes an owned record", async () => {
    const service = new OwnedCrud(new FixtureRepository());
    const created = await service.create("user-a", { value: "initial" });
    await expect(service.read("user-a", created.id)).resolves.toEqual(created);
    await expect(
      service.update("user-a", created.id, { value: "updated" }),
    ).resolves.toMatchObject({ value: "updated" });
    await service.delete("user-a", created.id);
    await expect(service.read("user-a", created.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("makes foreign records inaccessible for read, update, and deletion", async () => {
    const service = new OwnedCrud(new FixtureRepository());
    const created = await service.create("user-a", { value: "private" });
    await expect(service.read("user-b", created.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(
      service.update("user-b", created.id, { value: "stolen" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.delete("user-b", created.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
