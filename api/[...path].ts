import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const errors: string[] = [];

  // Test 1: Can we import pg?
  try {
    const pg = await import("pg");
    errors.push("pg: OK");
  } catch (e: any) {
    errors.push("pg: FAIL - " + e.message);
  }

  // Test 2: Can we import drizzle?
  try {
    const drizzle = await import("drizzle-orm/node-postgres");
    errors.push("drizzle: OK");
  } catch (e: any) {
    errors.push("drizzle: FAIL - " + e.message);
  }

  // Test 3: Can we import schema?
  try {
    const schema = await import("../shared/schema");
    errors.push("schema: OK - tables: " + Object.keys(schema).filter(k => !k.startsWith("insert") && !k.startsWith("Insert")).join(", "));
  } catch (e: any) {
    errors.push("schema: FAIL - " + e.message);
  }

  // Test 4: Can we connect to db?
  try {
    const pg = await import("pg");
    const pool = new pg.default.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
    const result = await pool.query("SELECT 1 as test");
    await pool.end();
    errors.push("db connect: OK");
  } catch (e: any) {
    errors.push("db connect: FAIL - " + e.message);
  }

  res.status(200).json({
    hasDbUrl: !!process.env.DATABASE_URL,
    results: errors,
  });
}
