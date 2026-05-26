import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const rut = process.argv[2];
const newPwd = process.argv[3];
if (!rut || !newPwd) { console.error('Usage: node reset_pwd.mjs <rut> <newPwd>'); process.exit(2); }
const normalized = rut.replace(/\./g, '').toLowerCase().trim();

const p = new PrismaClient();
const hash = await bcrypt.hash(newPwd, 12);
const user = await p.user.findFirst({ where: { rut: normalized, role: 'CLIENTE' } });
if (!user) { console.error('sc User no encontrado para', normalized); process.exit(1); }
await p.user.update({
  where: { id: user.id },
  data: { passwordHash: hash, mustChangePassword: false },
});
await p.auditLog.create({
  data: { action: 'PASSWORD_CHANGED', actorId: user.id, message: 'Reset manual senior debug 2026-05-22.', metadata: JSON.stringify({ source: 'manual-debug-reset' }) },
});
const after = await p.user.findUnique({ where: { id: user.id } });
console.log('sc User updated. hash:', after.passwordHash);
console.log('compare new pwd:', await bcrypt.compare(newPwd, after.passwordHash));
await p.$disconnect();
