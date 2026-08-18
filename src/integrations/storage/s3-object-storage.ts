import "server-only";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type {
  ObjectStorageProvider,
  StoredObject,
} from "@/core/contracts/object-storage-provider";
import { assertInternalStorageKey } from "./storage-key";

export interface S3ObjectStorageConfiguration {
  readonly bucket: string;
  readonly endpoint: string;
  readonly region: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
}

export type S3StorageClient = Pick<S3Client, "send">;

export class S3ObjectStorageProvider implements ObjectStorageProvider {
  private readonly client: S3StorageClient;

  constructor(
    private readonly configuration: S3ObjectStorageConfiguration,
    client?: S3StorageClient,
  ) {
    this.client =
      client ??
      new S3Client({
        endpoint: configuration.endpoint,
        region: configuration.region,
        credentials: {
          accessKeyId: configuration.accessKeyId,
          secretAccessKey: configuration.secretAccessKey,
        },
        forcePathStyle: true,
      });
  }

  async put(
    key: string,
    data: Uint8Array,
    contentType: string,
  ): Promise<StoredObject> {
    const safeKey = assertInternalStorageKey(key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.configuration.bucket,
        Key: safeKey,
        Body: data,
        ContentLength: data.byteLength,
        ContentType: contentType,
      }),
    );
    return { key: safeKey, contentType, size: data.byteLength };
  }

  async get(key: string): Promise<Uint8Array | null> {
    const safeKey = assertInternalStorageKey(key);
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.configuration.bucket,
          Key: safeKey,
        }),
      );
      return response.Body
        ? new Uint8Array(await response.Body.transformToByteArray())
        : null;
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } })
        .$metadata?.httpStatusCode;
      const name = error instanceof Error ? error.name : "";
      if (status === 404 || name === "NoSuchKey" || name === "NotFound")
        return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.configuration.bucket,
        Key: assertInternalStorageKey(key),
      }),
    );
  }
}
