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

const BASE  = 'http://localhost:8081';
const EMAIL = process.env.TEST_EMAIL || 'leonardovilla.tech@gmail.com';
const PASS  = process.env.TEST_PASSWORD || '';

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function goto(page, path, label) {
  console.log(`\n📍 ${label}  ← olhe o Chromium`);
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await wait(8000); // 8s em cada tela — tempo para você ver
}

async function login(page, email, password, label) {
  console.log(`\n🔐 Login como ${label}...`);
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await wait(2000);

  const emailInput = page.locator('input[placeholder*="mail"], input[type="email"]').first();
  if (!await emailInput.isVisible().catch(() => false)) {
    console.log('  Já logado ou redirecionado');
    return;
  }

  await emailInput.fill(email);
  await page.locator('input[type="password"]').first().fill(password);

  await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeValue && node.nodeValue.trim() === 'Entrar') {
        let el = node.parentElement;
        for (let i = 0; i < 5; i++) {
          if (!el) break;
          el.click();
          el = el.parentElement;
        }
        return;
      }
    }
  });

  try {
    await page.waitForURL(url => !url.includes('/auth/login'), { timeout: 20000 });
    console.log(`  ✅ Logado!`);
  } catch {
    // Firebase às vezes demora mais — aguarda e continua mesmo assim
    await wait(5000);
    console.log(`  ➡️  Continuando (URL: ${page.url()})`);
  }
  await wait(2000);
}

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 500 });

  // ══════════════════════════════════════════════════════════════
  // JANELA 1 — conta principal (leonardovilla.tech)
  // ══════════════════════════════════════════════════════════════
  console.log('\n\n═══ CONTA PRINCIPAL ═══');
  const ctx1 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page1 = await ctx1.newPage();

  await login(page1, EMAIL, PASS, 'leonardovilla.tech');

  await goto(page1, '/trips',    '🧳 Viagens (conta principal)');
  await goto(page1, '/places',   '📍 Locais (conta principal)');
  await goto(page1, '/dayplans', '🗓️  Role do Dia (conta principal)');
  await goto(page1, '/buddies',  '👥 Trip Buddies (conta principal)');

  // ══════════════════════════════════════════════════════════════
  // JANELA 2 — conta do buddy (pede email/senha no console)
  // ══════════════════════════════════════════════════════════════
  const buddyEmail = process.env.BUDDY_EMAIL || '';
  const buddyPass  = process.env.BUDDY_PASSWORD || '';

  if (buddyEmail && buddyPass) {
    console.log('\n\n═══ CONTA BUDDY ═══');
    const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page2 = await ctx2.newPage();

    await login(page2, buddyEmail, buddyPass, buddyEmail);

    // Buddy sincroniza para puxar dados do dono
    await goto(page2, '/places', '📍 Locais (visão do buddy)');
    // Clica em sincronizar
    const syncBtn = page2.locator('[name="sync-outline"], [aria-label*="sinc"], [aria-label*="sync"]').first();
    if (!await syncBtn.isVisible().catch(() => false)) {
      // tenta pelo ícone de refresh no header
      await page2.locator('svg').first().click({ force: true }).catch(() => {});
    }
    await wait(5000);

    await goto(page2, '/dayplans', '🗓️  Role do Dia (visão do buddy)');
    await wait(5000);

    await ctx2.close();
  } else {
    console.log('\n\n💡 Para testar a visão do buddy, rode:');
    console.log('   BUDDY_EMAIL=amigo@gmail.com BUDDY_PASSWORD=senha node demo-ver-dados.mjs');
  }

  console.log('\n✅ Demonstração concluída.');
  console.log('   Chromium fica aberto — feche manualmente quando quiser.');
  // Mantém o processo vivo até o browser ser fechado pelo usuário
  await new Promise(resolve => browser.on('disconnected', resolve));
})().catch(e => { console.error('\n❌', e.message); process.exit(1); });
