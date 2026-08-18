import "server-only";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  ObjectStorageProvider,
  StoredObject,
} from "@/core/contracts/object-storage-provider";
import { ConfigurationError } from "@/core/errors/application-errors";
import { resolveDeploymentEnvironment } from "@/lib/env/server";
import { assertInternalStorageKey } from "./storage-key";

export class DevelopmentFilesystemStorage implements ObjectStorageProvider {
  private readonly root: string;

  constructor(root = path.join(process.cwd(), ".roleprowl-storage")) {
    const deployment = resolveDeploymentEnvironment();
    if (deployment === "preview" || deployment === "production") {
      throw new ConfigurationError(
        "Filesystem document storage is development-only. Configure durable private object storage for production.",
      );
    }
    this.root = path.resolve(root);
  }

  private resolveKey(key: string) {
    return path.join(this.root, assertInternalStorageKey(key));
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
