import "server-only";
import type { ObjectStorageProvider } from "@/core/contracts/object-storage-provider";
import { documentStorageEnv } from "@/lib/env/server";
import { DevelopmentFilesystemStorage } from "./development-filesystem-storage";
import { S3ObjectStorageProvider } from "./s3-object-storage";

export function documentStorage(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): ObjectStorageProvider {
  const configuration = documentStorageEnv(environment);
  if (configuration.provider === "filesystem")
    return new DevelopmentFilesystemStorage(configuration.root);
  return new S3ObjectStorageProvider(configuration);
}
