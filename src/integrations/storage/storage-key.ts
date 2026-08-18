import { ValidationError } from "@/core/errors/application-errors";

const SAFE_STORAGE_KEY = /^[a-zA-Z0-9/_-]+$/u;

export function assertInternalStorageKey(key: string) {
  if (!SAFE_STORAGE_KEY.test(key) || key.includes(".."))
    throw new ValidationError("Invalid internal storage key.");
  return key;
}
