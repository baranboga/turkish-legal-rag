import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { requireEnv } from "../env";
import * as schema from "./schema";

/**
 * Uygulama/script sorgulari icin baglanti.
 *
 * DATABASE_URL = Supabase transaction pooler (port 6543). Pooler prepared
 * statement DESTEKLEMEZ; bu yuzden `prepare: false` ZORUNLU. Bunu unutursan
 * sorgular anlasilmaz hatalarla patlar.
 *
 * Migration'lar bu client'i KULLANMAZ; onlar DIRECT_URL (5432) uzerinden
 * drizzle-kit ile calisir (bkz. drizzle.config.ts).
 *
 * NOT: Bu modul yalnizca server tarafinda (script'ler + src/search) import
 * edilir. UI bu dosyayi ASLA import etmez.
 */
const queryClient = postgres(requireEnv("DATABASE_URL"), { prepare: false });

export const db = drizzle(queryClient, { schema });
export { queryClient };
