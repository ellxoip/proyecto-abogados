import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const SC = 'http://localhost:3001';
const API_KEY = '74a9bae35d0f020014027de0fb58b9d656c7d1bc847705a0009599edb940313b';
const TEST_RUT = '99888777-6';
const NORMALIZED = '99888777-6';

const p = new PrismaClient();

function post(path, body) {
  return fetch(`${SC}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
    body: JSON.stringify(body),
  });
}

// Clean up any prior run.
await p.case.deleteMany({ where: { code: 'E2E-CASE-GUARD' } });
await p.auditLog.deleteMany({ where: { actorId: { in: (await p.user.findMany({ where: { rut: NORMALIZED } })).map(u => u.id) } } });
await p.user.deleteMany({ where: { rut: NORMALIZED } });

// Step 1: create User via cases POST.
let res = await post('/api/internal/integration/cases', {
  rut: TEST_RUT,
  nombre: 'E2E Tester',
  email: 'e2e.tester@test.local',
  telefono: '+56900000001',
  password_plain: 'CLAVE1',
  case_code: 'E2E-CASE-GUARD',
  service_category: 'OTRO',
});
console.log('1) create User:', res.status);
const userInitial = await p.user.findFirst({ where: { rut: NORMALIZED, role: 'CLIENTE' } });
console.log('   hash:', userInitial.passwordHash.slice(0, 12), '— matches CLAVE1?', await bcrypt.compare('CLAVE1', userInitial.passwordHash));

// Step 2: simulate cliente rotation via password-sync (entrante desde fc).
res = await fetch(`${SC}/api/internal/integration/clients/password-sync`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
  body: JSON.stringify({ rut: TEST_RUT, password_plain: 'NUEVA9', source: 'test-rotation' }),
});
console.log('2) password-sync:', res.status);
const userAfterRot = await p.user.findFirst({ where: { rut: NORMALIZED, role: 'CLIENTE' } });
console.log('   hash:', userAfterRot.passwordHash.slice(0, 12), '— matches NUEVA9?', await bcrypt.compare('NUEVA9', userAfterRot.passwordHash));

// Step 3: simulate fc/NEXIO firing cases again with stale CLAVE1 (snapshot).
res = await post('/api/internal/integration/cases', {
  rut: TEST_RUT,
  nombre: 'E2E Tester (renamed)',
  email: 'e2e.tester@test.local',
  telefono: '+56900000001',
  password_plain: 'CLAVE1',
  case_code: 'E2E-CASE-GUARD',
  service_category: 'OTRO',
});
console.log('3) re-POST cases con clave vieja:', res.status);
const userFinal = await p.user.findFirst({ where: { rut: NORMALIZED, role: 'CLIENTE' } });
console.log('   hash:', userFinal.passwordHash.slice(0, 12));
console.log('   matches NUEVA9?', await bcrypt.compare('NUEVA9', userFinal.passwordHash));
console.log('   matches CLAVE1?', await bcrypt.compare('CLAVE1', userFinal.passwordHash));
console.log('   fullName:', userFinal.fullName);

// Assertions
const ok =
  (await bcrypt.compare('NUEVA9', userFinal.passwordHash)) === true &&
  (await bcrypt.compare('CLAVE1', userFinal.passwordHash)) === false &&
  userFinal.fullName === 'E2E Tester (renamed)';
console.log(ok ? '\nPASS — guard funciona: hash conservado, identidad actualizada.' : '\nFAIL — guard no aplicado.');

// Cleanup.
await p.case.deleteMany({ where: { code: 'E2E-CASE-GUARD' } });
await p.auditLog.deleteMany({ where: { actorId: userFinal.id } });
await p.user.delete({ where: { id: userFinal.id } });
await p.$disconnect();
process.exit(ok ? 0 : 1);
