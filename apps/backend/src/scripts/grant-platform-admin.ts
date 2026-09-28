import '../config/app.config';
import { Database } from '../database/prisma.service';

// Local operator command only. Registration and company APIs cannot assign this role.
async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email || !email.includes('@'))
    throw new Error('Usage: npm run platform:grant -w apps/backend -- account@example.com');
  const db = new Database();
  try {
    await db.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { email }, include: { company: true } });
      if (!user || !user.isActive || !user.company.isActive)
        throw new Error('An existing active account and company are required.');
      await tx.$queryRaw`SELECT id FROM "Company" WHERE id = ${user.companyId} FOR UPDATE`;
      const company = await tx.company.findUniqueOrThrow({ where: { id: user.companyId } });
      if (!company.isActive) throw new Error('Company is blocked.');
      if (user.platformRole === 'SUPER_ADMIN') {
        console.log('Account already has platform administrator access.');
        return;
      }
      await tx.user.update({ where: { id: user.id }, data: { platformRole: 'SUPER_ADMIN' } });
      await tx.platformAuditLog.create({
        data: {
          actorId: user.id,
          actorName: 'Local operator',
          companyId: user.companyId,
          companyName: company.name,
          action: 'PLATFORM_ADMIN_GRANTED',
          reason: `Platform access granted to user #${user.id} through the local operator command.`,
        },
      });
      console.log(
        `Platform administrator access granted to account #${user.id}. Refresh the browser to load permissions.`,
      );
    });
  } finally {
    await db.onModuleDestroy();
  }
}
void main().catch((error: unknown) => {
  console.error(
    error instanceof Error && !('code' in error)
      ? error.message
      : 'Could not grant platform administrator access. Check database connectivity.',
  );
  process.exitCode = 1;
});
