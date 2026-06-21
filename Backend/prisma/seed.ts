import { PrismaClient } from "../src/generated/prisma/index.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";

// We have to recreate the Prisma connection specifically for the seed script
const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌐 Downloading Peter Norvig's 330k N-Grams dataset (this may take a moment)...");
  
  // 1. Download the massive defensible dataset
  const response = await fetch("https://norvig.com/ngrams/count_1w.txt");
  const text = await response.text();
  
  // 2. Parse the tab-separated file (Word \t Count)
  const lines = text.split("\n").filter(line => line.trim().length > 0);
  console.log(`✅ Successfully downloaded ${lines.length} words! Filtering to the top 100,000...`);
  
  console.log("🧹 Clearing old database records...");
  await prisma.searchQuery.deleteMany({});
  
  console.log("⏳ Seeding 100,000 records into the database... This will take a few seconds.");
  
  // 3. Format the data for Prisma using the ACTUAL usage counts, capping at 100k
  const seedData = lines.slice(0, 100000).map((line) => {
    const [word, countStr] = line.split("\t");
    return {
      query: word.trim(),
      // Use the actual defensible frequency count from the dataset
      count: parseInt(countStr, 10) || 1
    };
  });

  // 4. Bulk insert using createMany
  const result = await prisma.searchQuery.createMany({
    data: seedData,
    skipDuplicates: true // Just in case there are duplicates in the text file
  });

  console.log(`🎉 Success! Seeded ${result.count} words into the database.`);
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:");
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
