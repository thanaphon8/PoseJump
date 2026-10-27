import { MongoClient, type Db } from "mongodb";

// เก็บ client ไว้ใน global กันเชื่อมต่อซ้ำตอน hot reload
declare global {
  // eslint-disable-next-line no-var
  var _pjMongoClient: Promise<MongoClient> | undefined;
}

function client(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("ไม่พบ MONGODB_URI ใน .env.local");
  if (!globalThis._pjMongoClient) {
    globalThis._pjMongoClient = new MongoClient(uri).connect();
  }
  return globalThis._pjMongoClient;
}

let indexes: Promise<void> | null = null;

export async function getDb(): Promise<Db> {
  const c = await client();
  const db = c.db(process.env.MONGODB_DB || "posejump");

  if (!indexes) {
    indexes = Promise.all([
      db.collection("users").createIndex({ username: 1 }, { unique: true }),
      db
        .collection("sessions")
        .createIndex({ tokenHash: 1 }, { unique: true }),
      // หมดอายุแล้ว MongoDB ลบเซสชันให้เอง
      db
        .collection("sessions")
        .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      db.collection("jumps").createIndex({ userId: 1, ts: -1 }),
      db.collection("settings").createIndex({ userId: 1 }, { unique: true }),
    ]).then(() => undefined);
    indexes.catch(() => {
      indexes = null;
    });
    // รหัสพนักงานไม่ซ้ำภายในบริษัทเดียวกัน (ซ้ำข้ามบริษัทได้)
    // แยกออกมา: ถ้าข้อมูลเดิมมีคู่ซ้ำ จะแค่ log ไม่ทำให้ทุก request พัง
    db.collection("users")
      .createIndex(
        { companyId: 1, employeeId: 1 },
        { unique: true, name: "company_employee_unique" }
      )
      .catch((e) => console.error("create company_employee_unique failed", e));
  }
  await indexes;
  return db;
}