import "server-only";
import { z } from "zod";
const databaseEnvironment = z.object({ DATABASE_URL: z.string().url() });
export function databaseEnv() {
  return databaseEnvironment.parse(process.env);
}
