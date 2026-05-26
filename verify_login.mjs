import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const p = new PrismaClient();
const rut = '15424521-5';
const normalized = rut.replace(/\./g, '').toLowerCase().trim();
const u = await p.user.findFirst({ where: { rut: normalized, role: 'CLIENTE' } });
console.log('sc User:');
console.log('  id:', u.id);
console.log('  rut:', u.rut);
console.log('  email:', u.email);
console.log('  active:', u.active);
console.log('  mustChangePassword:', u.mustChangePassword);
console.log('  passwordHash prefix:', u.passwordHash.slice(0, 12));
console.log('  bcrypt.compare("TEST12"):', await bcrypt.compare('TEST12', u.passwordHash));
console.log('  bcrypt.compare("9SCQCY"):', await bcrypt.compare('9SCQCY', u.passwordHash));
await p.$disconnect();
