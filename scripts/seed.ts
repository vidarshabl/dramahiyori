if (!process.env.DATABASE_URL && !process.env.TURSO_DATABASE_URL) {
  (process.env as { [key:string]:string|undefined })["NODE_ENV"] ||= "development";
}
const {seedDemoData}=await import("../lib/db.ts");
await seedDemoData();
console.log("Demo catalog seeding completed.");

export {};
