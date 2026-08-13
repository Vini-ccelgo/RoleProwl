import "server-only";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  ObjectStorageProvider,
  StoredObject,
} from "@/core/contracts/object-storage-provider";
import {
  ConfigurationError,
  ValidationError,
} from "@/core/errors/application-errors";

const SAFE_STORAGE_KEY = /^[a-zA-Z0-9/_-]+$/u;

export class DevelopmentFilesystemStorage implements ObjectStorageProvider {
  private readonly root: string;

  constructor(root = path.join(process.cwd(), ".roleprowl-storage")) {
    if (process.env.NODE_ENV === "production") {
      throw new ConfigurationError(
        "Filesystem document storage is development-only. Configure durable private object storage for production.",
      );
    }
    this.root = path.resolve(root);
  }

  private resolveKey(key: string) {
    if (!SAFE_STORAGE_KEY.test(key) || key.includes("..")) {
      throw new ValidationError("Invalid internal storage key.");
    }
    return path.join(this.root, key);
  }

  async put(
    key: string,
    data: Uint8Array,
    contentType: string,
  ): Promise<StoredObject> {
    const target = this.resolveKey(key);
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    await writeFile(target, data, { mode: 0o600, flag: "wx" });
    return { key, contentType, size: data.byteLength };
  }

  async get(key: string): Promise<Uint8Array | null> {
    try {
      return await readFile(this.resolveKey(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(this.resolveKey(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

export function documentStorage(): ObjectStorageProvider {
  return new DevelopmentFilesystemStorage(
    process.env.ROLEPROWL_LOCAL_STORAGE_PATH,
  );
}
