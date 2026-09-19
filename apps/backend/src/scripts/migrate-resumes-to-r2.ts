import { Database } from '../database/prisma.service';
import { R2Storage } from '../common/storage/r2-storage.service';

async function main() {
  const storage = new R2Storage();
  if (!storage.enabled) throw new Error('R2 storage is not configured');

  const db = new Database();
  await db.$connect();
  let migrated = 0;
  try {
    const candidates = await db.candidate.findMany({
      where: { resumeData: { not: null }, resumeObjectKey: null },
      select: {
        id: true,
        companyId: true,
        resumeData: true,
        resumeName: true,
        resumeMime: true,
      },
    });

    for (const candidate of candidates) {
      if (!candidate.resumeData || !candidate.resumeName || !candidate.resumeMime) continue;
      const key = await storage.putResume(
        candidate.companyId,
        candidate.id,
        candidate.resumeName,
        candidate.resumeMime,
        candidate.resumeData,
      );
      const updated = await db.candidate.updateMany({
        where: { id: candidate.id, companyId: candidate.companyId, resumeObjectKey: null },
        data: {
          resumeObjectKey: key,
          resumeSize: candidate.resumeData.length,
          resumeData: null,
        },
      });
      if (!updated.count) await storage.delete(key);
      else migrated++;
    }
    console.log(`R2 resume migration complete: ${migrated} file(s) moved.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'R2 resume migration failed');
  process.exitCode = 1;
});
