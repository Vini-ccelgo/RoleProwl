export interface StoredObject {
  readonly key: string;
  readonly contentType: string;
  readonly size: number;
}
export interface ObjectStorageProvider {
  put(
    key: string,
    data: Uint8Array,
    contentType: string,
  ): Promise<StoredObject>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
}
