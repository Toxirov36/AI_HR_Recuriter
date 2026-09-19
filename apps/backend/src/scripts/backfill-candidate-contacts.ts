import { Database } from '../database/prisma.service';
import { extractContactDetails } from '../modules/resumes/resumes.service';

async function main() {
  const db = new Database();
  await db.$connect();
  let candidatesUpdated = 0;
  let fieldsUpdated = 0;

  try {
    const candidates = await db.candidate.findMany({
      where: {
        resumeText: { not: null },
        OR: [{ email: null }, { phone: null }],
      },
      select: {
        id: true,
        companyId: true,
        email: true,
        phone: true,
        resumeText: true,
      },
    });

    for (const candidate of candidates) {
      if (!candidate.resumeText) continue;
      const contacts = extractContactDetails(candidate.resumeText);
      const email = candidate.email ? undefined : (contacts.email ?? undefined);
      const phone = candidate.phone ? undefined : (contacts.phone ?? undefined);
      if (!email && !phone) continue;

      await db.candidate.update({
        where: { id_companyId: { id: candidate.id, companyId: candidate.companyId } },
        data: { email, phone },
      });
      candidatesUpdated++;
      fieldsUpdated += Number(Boolean(email)) + Number(Boolean(phone));
    }

    console.log(
      `Candidate contact backfill complete: ${candidatesUpdated} candidate(s), ${fieldsUpdated} field(s) updated.`,
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Candidate contact backfill failed');
  process.exitCode = 1;
});
