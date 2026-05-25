/**
 * 1. Limpa Firestore do usuário leonardovilla.tech
 * 2. Cria via Firebase SDK: Argentina 2026 + 6 locais + 2 roles + buddy cibeleiferreira
 * 3. Abre Playwright headed para login + sync + mostrar resultado
 */

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { addDoc, collection, deleteDoc, doc, getDocs, getFirestore, setDoc } from 'firebase/firestore';
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'fs';
import { join } from 'path';

for (const file of ['.env', '.env.test']) {
  try {
    const raw = readFileSync(join(import.meta.dirname, file), 'utf8');
    for (const line of raw.split('\n')) {
      const [k, ...rest] = line.split('=');
      const v = rest.join('=');
      if (k?.trim() && v !== undefined && !process.env[k.trim()]) process.env[k.trim()] = v.trim();
    }
  } catch {}
}

const EMAIL       = process.env.TEST_EMAIL    || 'leonardovilla.tech@gmail.com';
const PASS        = process.env.TEST_PASSWORD || '';
const BUDDY_EMAIL = 'cibeleiferreira@gmail.com';
const BASE        = 'http://localhost:8081';
const SHOTS       = 'c:/repositorio/tripvilla/argentina-screenshots';
mkdirSync(SHOTS, { recursive: true });

const firebaseConfig = {
  apiKey:            process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

const wait = (ms) => new Promise(r => setTimeout(r, ms));
let step = 0;
const shot = async (page, name) => {
  const f = join(SHOTS, `${String(++step).padStart(2,'0')}-${name}.png`);
  await page.screenshot({ path: f, fullPage: true });
  console.log(`  📸 ${name}`);
};

// ─────────────────────────────────────────────────────────
// Firebase SDK helpers
// ─────────────────────────────────────────────────────────
async function deleteCol(db, path) {
  const snap = await getDocs(collection(db, path));
  for (const d of snap.docs) await deleteDoc(doc(db, path, d.id));
  return snap.size;
}
async function deleteSubcol(db, parent, sub) {
  const snap = await getDocs(collection(db, parent));
  for (const d of snap.docs) await deleteCol(db, `${parent}/${d.id}/${sub}`);
}

// ─────────────────────────────────────────────────────────
// Dados
// ─────────────────────────────────────────────────────────
const now = () => new Date().toISOString();

const PLACES = [
  { name: 'Casa Rosada',           location: 'Balcarce 50, Plaza de Mayo, Buenos Aires', openTime: '10:00', closeTime: '18:00', travelTime: '30 min', transport: 'Metrô (Línea A)' },
  { name: 'Teatro Colón',          location: 'Cerrito 628, Buenos Aires',                openTime: '10:00', closeTime: '20:00', travelTime: '15 min', transport: 'Caminhada' },
  { name: 'Cemitério da Recoleta', location: 'Junín 1760, Buenos Aires',                 openTime: '07:00', closeTime: '17:30', travelTime: '20 min', transport: 'Táxi' },
  { name: 'El Caminito',           location: 'Caminito 1000, La Boca, Buenos Aires',     openTime: '10:00', closeTime: '18:00', travelTime: '35 min', transport: 'Ônibus' },
  { name: 'Mercado de San Telmo',  location: 'Carlos Calvo 430, San Telmo, Buenos Aires',openTime: '09:00', closeTime: '21:00', travelTime: '25 min', transport: 'Metrô (Línea C)' },
  { name: 'Cataratas do Iguaçu',   location: 'Parque Nacional Iguazú, Misiones',         openTime: '08:00', closeTime: '18:00', travelTime: '2h avião', transport: 'Voo + Transfer' },
];

const ROLES = [
  { title: 'Dia no Centro Histórico',   date: '2026-07-10', notes: 'Casa Rosada, Teatro Colón e Mercado de San Telmo' },
  { title: 'Dia na Recoleta e La Boca', date: '2026-07-11', notes: 'Cemitério da Recoleta e El Caminito' },
];

// ─────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────
(async () => {
  if (!PASS) { console.error('❌ TEST_PASSWORD não definido em .env.test'); process.exit(1); }

  // ── FASE 1: Firebase SDK ─────────────────────────────
  console.log('🔥 Autenticando no Firebase SDK...');
  const app  = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db   = getFirestore(app);

  let uid;
  try {
    const cred = await signInWithEmailAndPassword(auth, EMAIL, PASS);
    uid = cred.user.uid;
    console.log(`✅ Firebase OK: ${EMAIL} (uid: ${uid.slice(0,8)}...)`);
  } catch (err) {
    console.error('❌ Login Firebase falhou:', err.message); process.exit(1);
  }

  // Limpeza
  console.log('\n🗑️  Limpando Firestore...');
  await deleteSubcol(db, `users/${uid}/trips`, 'items');
  const ct = await deleteCol(db, `users/${uid}/trips`);
  const cp = await deleteCol(db, `users/${uid}/places`);
  await deleteSubcol(db, `users/${uid}/day_plans`, 'items');
  const cd = await deleteCol(db, `users/${uid}/day_plans`);
  const cb = await deleteCol(db, `users/${uid}/buddies`);
  // Limpa buddyIndex do buddy anterior se existir
  try { await deleteCol(db, `buddyIndex/${BUDDY_EMAIL}/owners`); } catch {}
  console.log(`   ✓ ${ct} viagens | ${cp} locais | ${cd} roles | ${cb} buddies removidos\n`);

  // Cria viagem
  console.log('2️⃣  Criando viagem: Argentina 2026');
  const tripRef = await addDoc(collection(db, `users/${uid}/trips`), {
    description: 'Argentina 2026',
    country: 'Argentina',
    state: 'Buenos Aires',
    city: 'Buenos Aires',
    maxCost: 20000,
    createdAt: now(),
  });
  const tripId = tripRef.id;
  console.log(`   ✓ Trip ID: ${tripId}`);

  // Cria locais
  console.log('\n3️⃣  Criando 6 locais turísticos');
  for (const place of PLACES) {
    await addDoc(collection(db, `users/${uid}/places`), {
      ...place,
      tripId,
      createdAt: now(),
    });
    console.log(`   ✓ ${place.name}`);
  }

  // Cria day plans
  console.log('\n4️⃣  Criando 2 roles do dia');
  for (const role of ROLES) {
    await addDoc(collection(db, `users/${uid}/day_plans`), {
      ...role,
      tripId,
      itemCount: 0,
      totalSpent: 0,
      createdAt: now(),
    });
    console.log(`   ✓ ${role.title}`);
  }

  // Cria buddy
  console.log('\n5️⃣  Adicionando buddy: ' + BUDDY_EMAIL);
  await addDoc(collection(db, `users/${uid}/buddies`), {
    email: BUDDY_EMAIL,
    role: 'admin',
    tripIds: [tripId],
    addedAt: now(),
  });
  await setDoc(doc(db, `buddyIndex/${BUDDY_EMAIL}/owners/${uid}`), {
    role: 'admin',
    tripIds: [tripId],
    ownerEmail: EMAIL,
  });
  console.log(`   ✓ ${BUDDY_EMAIL} adicionada como Travel Planner`);
  console.log(`   ✓ buddyIndex atualizado com tripId: ${tripId}`);

  console.log('\n✅ Todos os dados criados no Firestore!\n');

  // ── FASE 2: Playwright — login + sync + verificação ──
  console.log('🌐 Abrindo browser para verificação visual...');
  const browser = await chromium.launch({ headless: false, slowMo: 400 });
  const ctx  = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();

  // Login
  console.log('\n1️⃣  LOGIN E SINCRONIZAÇÃO');
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await wait(3000);

  const emailEl = page.locator('input[type="email"], input[placeholder*="mail"]').first();
  if (await emailEl.isVisible().catch(() => false)) {
    await emailEl.fill(EMAIL);
    await page.locator('input[type="password"]').first().fill(PASS);
    await shot(page, 'login');
    await page.evaluate(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (node.nodeValue?.trim() === 'Entrar') {
          let el = node.parentElement;
          for (let i = 0; i < 8; i++) { el?.click(); el = el?.parentElement; }
          return;
        }
      }
    });
    try { await page.waitForURL(u => !u.includes('/auth/login'), { timeout: 20000 }); }
    catch { await wait(8000); }
  }

  if (page.url().includes('/auth/login')) {
    console.error('❌ Login falhou'); await browser.close(); process.exit(1);
  }
  console.log('   ✅ Logado — aguardando sync do Firestore...');
  await wait(4000); // pull from Firestore após login

  // Telas finais
  console.log('\n2️⃣  CAPTURAS DAS TELAS');

  await page.goto(`${BASE}/trips`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await wait(3000);
  await shot(page, 'viagens');
  console.log('   📸 Viagens');

  await page.goto(`${BASE}/places`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await wait(4000);
  await shot(page, 'locais');
  console.log('   📸 Locais');

  await page.goto(`${BASE}/dayplans`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await wait(3000);
  await shot(page, 'roles');
  console.log('   📸 Roles do dia');

  await page.goto(`${BASE}/reports`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await wait(3000);
  await shot(page, 'relatorios');
  console.log('   📸 Relatórios');

  await page.goto(`${BASE}/buddies`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await wait(3000);
  await shot(page, 'buddies');
  console.log('   📸 Trip Buddies');

  console.log(`\n✅ Concluído! ${step} screenshots em ${SHOTS}`);
  console.log('   Browser aberto por 20s para visualização...');
  await wait(20000);
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('\n❌ ERRO:', e.message); process.exit(1); });
