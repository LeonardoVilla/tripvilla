import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { join } from 'path';

try {
  const raw = readFileSync(join(import.meta.dirname, '.env.test'), 'utf8');
  for (const line of raw.split('\n')) {
    const [k, ...rest] = line.split('=');
    const v = rest.join('=');
    if (k && v !== undefined && !process.env[k.trim()]) process.env[k.trim()] = v.trim();
  }
} catch {}

const BASE         = 'http://localhost:8081';
const OWNER_EMAIL  = process.env.TEST_EMAIL     || 'leonardovilla.tech@gmail.com';
const OWNER_PASS   = process.env.TEST_PASSWORD  || '';
const BUDDY_EMAIL  = 'amigo@gmail.com';
const BUDDY_PASS   = '12345678';

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function goto(page, path) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await wait(3000);
}

async function login(page, email, pass) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await wait(2000);

  const emailInput = page.locator('input[placeholder*="mail"], input[type="email"]').first();
  if (!await emailInput.isVisible().catch(() => false)) return; // já logado

  await emailInput.fill(email);
  await page.locator('input[type="password"]').first().fill(pass);

  await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeValue?.trim() === 'Entrar') {
        let el = node.parentElement;
        for (let i = 0; i < 5; i++) { if (!el) break; el.click(); el = el.parentElement; }
        return;
      }
    }
  });

  await page.waitForURL(url => !url.includes('/auth/login'), { timeout: 20000 }).catch(() => wait(6000));
  await wait(1500);
}

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 400 });

  // ══════════════════════════════════════════════════════
  //  JANELA 1 — Conta do dono (leonardovilla.tech)
  // ══════════════════════════════════════════════════════
  console.log('🔐 Logando como dono...');
  const ctx1  = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page1 = await ctx1.newPage();
  await login(page1, OWNER_EMAIL, OWNER_PASS);
  console.log('✅ Dono logado. URL:', page1.url());

  // Garante que amigo@gmail.com está na lista de buddies
  await goto(page1, '/buddies');
  const jaBuddy = await page1.getByText(BUDDY_EMAIL).isVisible().catch(() => false);
  if (!jaBuddy) {
    console.log(`➕ Adicionando ${BUDDY_EMAIL} como buddy...`);
    await page1.getByText('Adicionar buddy').click({ force: true });
    await wait(1000);
    await page1.locator('input[type="email"], input[placeholder*="mail"]').first().fill(BUDDY_EMAIL);
    await wait(500);
    // Escopa para o modal (último elemento com role=dialog ou o modalBox)
    const modal = page1.locator('[role="dialog"], [aria-modal]').last();
    const hasMod = await modal.isVisible().catch(() => false);
    if (hasMod) {
      await modal.getByText('Travel Planner').click({ force: true });
    } else {
      await page1.getByText('Travel Planner').last().click({ force: true });
    }
    await wait(500);
    await page1.getByText('Adicionar', { exact: true }).click({ force: true });
    await wait(2000);
    console.log('✅ Buddy adicionado!');
  } else {
    console.log(`✅ ${BUDDY_EMAIL} já é buddy.`);
  }

  // Mostra os dados do dono
  console.log('\n📋 Dados do dono:');
  await goto(page1, '/trips');
  console.log('  👆 Viagens do dono — veja o Chromium');
  await wait(3000);

  await goto(page1, '/places');
  console.log('  👆 Locais do dono — veja o Chromium');
  await wait(3000);

  await goto(page1, '/dayplans');
  console.log('  👆 Roles do dono — veja o Chromium');
  await wait(3000);

  // ══════════════════════════════════════════════════════
  //  JANELA 2 — Conta do buddy (amigo@gmail.com)
  // ══════════════════════════════════════════════════════
  console.log('\n\n🔐 Logando como buddy (amigo@gmail.com)...');
  const ctx2  = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page2 = await ctx2.newPage();
  await login(page2, BUDDY_EMAIL, BUDDY_PASS);
  console.log('✅ Buddy logado. URL:', page2.url());

  // Buddy vai para Locais e sincroniza
  await goto(page2, '/places');
  console.log('  👆 Locais (buddy) ANTES de sincronizar — veja o Chromium');
  await wait(3000);

  // Clica no botão de sync (ícone ⟳ no header)
  console.log('  🔄 Sincronizando...');
  await page2.evaluate(() => {
    // Percorre todos os elementos clicáveis buscando o botão de sync
    const all = document.querySelectorAll('[role="button"], button, div[tabindex]');
    for (const el of all) {
      const label = el.getAttribute('aria-label') || el.textContent || '';
      if (/sync|sinc|⟳/i.test(label)) { el.click(); return; }
    }
    // Fallback: clica no primeiro SVG do header
    const svgs = document.querySelectorAll('svg');
    if (svgs.length > 0) svgs[0].closest('[role="button"], div[tabindex]')?.click();
  });
  await wait(6000); // aguarda pull do Firestore

  await page2.reload({ waitUntil: 'domcontentloaded' });
  await wait(4000);
  console.log('  👆 Locais (buddy) APÓS sincronizar — deve mostrar dados do dono');
  await wait(4000);

  await goto(page2, '/dayplans');
  console.log('  👆 Roles do Dia (buddy) — deve mostrar dados do dono');
  await wait(4000);

  await goto(page2, '/trips');
  console.log('  👆 Viagens (buddy) — deve estar VAZIA (viagens são privadas)');
  await wait(4000);

  console.log('\n✅ Teste concluído! As duas janelas ficam abertas para você comparar.');
  console.log('   Feche o Chromium manualmente quando quiser.\n');

  await new Promise(resolve => browser.on('disconnected', resolve));
})().catch(e => { console.error('\n❌ ERRO:', e.message); process.exit(1); });
