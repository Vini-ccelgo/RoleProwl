import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";
import {
  createS3StorageClient,
  S3ObjectStorageProvider,
  type S3StorageClient,
} from "./s3-object-storage";

const configuration = {
  bucket: "roleprowl",
  endpoint: "https://s3.us-east-005.backblazeb2.com",
  region: "us-east-005",
  accessKeyId: "fixture-access-key",
  secretAccessKey: "fixture-secret-key",
};

describe("S3 object storage", () => {
  it("configures the AWS client for Backblaze-compatible S3 transport", async () => {
    const client = createS3StorageClient(configuration);
    expect(client.config.endpoint).toBeDefined();
    const endpoint = await client.config.endpoint!();
    const resolve = async <T>(value: T | (() => Promise<T>)) =>
      typeof value === "function"
        ? (value as () => Promise<T>)()
        : Promise.resolve(value);

    expect(await client.config.region()).toBe("us-east-005");
    expect(endpoint.protocol).toBe("https:");
    expect(endpoint.hostname).toBe("s3.us-east-005.backblazeb2.com");
    expect(await resolve(client.config.forcePathStyle)).toBe(true);
    expect(await resolve(client.config.requestChecksumCalculation)).toBe(
      "WHEN_REQUIRED",
    );
    expect(await resolve(client.config.responseChecksumValidation)).toBe(
      "WHEN_REQUIRED",
    );
    client.destroy();
  });

  it("puts, reads, and deletes private objects through the existing contract", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const send = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        Body: { transformToByteArray: async () => bytes },
      })
      .mockResolvedValueOnce({});
    const storage = new S3ObjectStorageProvider(configuration, {
      send,
    } as unknown as S3StorageClient);

    await expect(
      storage.put("users/random/document", bytes, "application/pdf"),
    ).resolves.toEqual({
      key: "users/random/document",
      contentType: "application/pdf",
      size: 3,
    });
    await expect(storage.get("users/random/document")).resolves.toEqual(bytes);
    await expect(storage.delete("users/random/document")).resolves.toBe(
      undefined,
    );

    const put = send.mock.calls[0]?.[0];
    const get = send.mock.calls[1]?.[0];
    const remove = send.mock.calls[2]?.[0];
    expect(put).toBeInstanceOf(PutObjectCommand);
    expect(put.input).toMatchObject({
      Bucket: "roleprowl",
      Key: "users/random/document",
      ContentType: "application/pdf",
    });
    expect(put.input).not.toHaveProperty("ACL");
    expect(get).toBeInstanceOf(GetObjectCommand);
    expect(remove).toBeInstanceOf(DeleteObjectCommand);
  });

  it("maps a provider 404 to a missing object and rejects unsafe keys", async () => {
    const notFound = Object.assign(new Error("missing"), {
      $metadata: { httpStatusCode: 404 },
    });
    const send = vi.fn().mockRejectedValue(notFound);
    const storage = new S3ObjectStorageProvider(configuration, {
      send,
    } as unknown as S3StorageClient);
    await expect(storage.get("users/random/missing")).resolves.toBeNull();
    await expect(
      storage.put("../private", new Uint8Array(), "application/pdf"),
    ).rejects.toThrow("Invalid internal storage key");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("translates provider failures without exposing provider details", async () => {
    const send = vi.fn().mockRejectedValue(new Error("secret provider detail"));
    const storage = new S3ObjectStorageProvider(configuration, {
      send,
    } as unknown as S3StorageClient);

    await expect(
      storage.put(
        "candidate-documents/random",
        new Uint8Array([1]),
        "application/pdf",
      ),
    ).rejects.toMatchObject({
      code: "INTEGRATION",
      message: "Private document storage write failed.",
    });
    await expect(
      storage.get("candidate-documents/random"),
    ).rejects.toMatchObject({
      code: "INTEGRATION",
      message: "Private document storage read failed.",
    });
    await expect(
      storage.delete("candidate-documents/random"),
    ).rejects.toMatchObject({
      code: "INTEGRATION",
      message: "Private document storage deletion failed.",
    });
  });
});
