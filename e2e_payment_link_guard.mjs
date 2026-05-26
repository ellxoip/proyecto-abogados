import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const SC = 'http://localhost:3001';
const API_KEY = '74a9bae35d0f020014027de0fb58b9d656c7d1bc847705a0009599edb940313b';
const TEST_RUT = '99888777-6';
const NORMALIZED = '99888777-6';

const p = new PrismaClient();

await p.auditLog.deleteMany({ where: { actorId: { in: (await p.user.findMany({ where: { rut: NORMALIZED } })).map(u => u.id) } } });
await p.user.deleteMany({ where: { rut: NORMALIZED } });

function post(path, body) {
  return fetch(`${SC}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
    body: JSON.stringify(body),
  });
}

let res = await post('/api/internal/integration/clients/payment-link', {
  rut: TEST_RUT,
  nombre: 'PL Tester',
  email: 'pl.tester@test.local',
  telefono: '+56900000002',
  payment_link: 'https://pagacuotas.cl/c/test',
  password_plain: 'INIT12',
});
console.log('1) payment-link create:', res.status);
const u1 = await p.user.findFirst({ where: { rut: NORMALIZED, role: 'CLIENTE' } });
console.log('   matches INIT12?', await bcrypt.compare('INIT12', u1.passwordHash));

res = await fetch(`${SC}/api/internal/integration/clients/password-sync`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
  body: JSON.stringify({ rut: TEST_RUT, password_plain: 'ROT123', source: 'test-rotation' }),
});
console.log('2) password-sync:', res.status);

res = await post('/api/internal/integration/clients/payment-link', {
  rut: TEST_RUT,
  nombre: 'PL Tester v2',
  email: 'pl.tester@test.local',
  telefono: '+56900000002',
  payment_link: 'https://pagacuotas.cl/c/test-v2',
  password_plain: 'INIT12',
});
console.log('3) payment-link re-call con clave vieja:', res.status);
const uF = await p.user.findFirst({ where: { rut: NORMALIZED, role: 'CLIENTE' } });
console.log('   matches ROT123?', await bcrypt.compare('ROT123', uF.passwordHash));
console.log('   matches INIT12?', await bcrypt.compare('INIT12', uF.passwordHash));
console.log('   paymentLink:', uF.paymentLink);
console.log('   fullName:', uF.fullName);

const ok = (await bcrypt.compare('ROT123', uF.passwordHash)) === true
        && (await bcrypt.compare('INIT12', uF.passwordHash)) === false
        && uF.paymentLink === 'https://pagacuotas.cl/c/test-v2'
        && uF.fullName === 'PL Tester v2';
console.log(ok ? '\nPASS — payment-link guard funciona.' : '\nFAIL');

await p.auditLog.deleteMany({ where: { actorId: uF.id } });
await p.user.delete({ where: { id: uF.id } });
await p.$disconnect();
process.exit(ok ? 0 : 1);
