import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { join } from 'path';

// Carrega .env.test
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

if (!PASS) {
  console.error('❌ TEST_PASSWORD não definido em .env.test');
  process.exit(1);
}

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function goto(page, path) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await wait(2000);
}

(async () => {
  const browser = await chromium.launch({
    headless: false,
    slowMo: 600,            // cada ação tem 600ms de pausa para você acompanhar
    args: ['--start-maximized'],
  });

  const ctx  = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();

  // ── LOGIN ──────────────────────────────────────────
  console.log('\n🔐 Fazendo login...');
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await wait(1500);

  await page.locator('input[placeholder*="mail"], input[type="email"]').first().fill(EMAIL);
  await page.locator('input[type="password"]').first().fill(PASS);

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
    await page.waitForURL(url => !url.includes('/auth/login'), { timeout: 12000 });
    console.log('✅ Login realizado!');
  } catch {
    console.log('⚠️  Login pode ter demorado — continuando...');
  }
  await wait(2000);

  // ── 1. CADASTRO DE VIAGEM ──────────────────────────
  console.log('\n✈️  Criando viagem...');
  await goto(page, '/trips');
  await wait(1000);

  // Clica no FAB (+) por coordenadas
  await page.mouse.click(342, 720);
  await wait(1500);

  const inputs = page.locator('input');
  if (await page.getByText('Nova Viagem').isVisible().catch(() => false)) {
    await inputs.nth(0).fill('Europa 2026');       // Descrição
    await wait(400);
    await inputs.nth(1).fill('França');             // País
    await wait(400);
    await inputs.nth(2).fill('Île-de-France');      // Estado
    await wait(400);
    await inputs.nth(3).fill('Paris');              // Cidade
    await wait(400);
    await inputs.nth(4).clear();
    await inputs.nth(4).fill('15000');              // Orçamento
    await wait(600);

    await page.getByText('Salvar').click();
    await wait(3000);
    console.log('✅ Viagem "Europa 2026" salva!');
  }

  // ── 2. CADASTRO DE LOCAL ──────────────────────────
  console.log('\n📍 Criando local...');
  await goto(page, '/places');
  await wait(1000);

  const btnNovoLocal = page.getByText('Novo local');
  if (await btnNovoLocal.isVisible().catch(() => false)) {
    await btnNovoLocal.click({ force: true });
    await wait(1500);

    const inp2 = page.locator('input');
    await inp2.nth(0).fill('Torre Eiffel');                     // Nome
    await wait(400);
    await inp2.nth(1).fill('Champ de Mars, Paris, França');     // Endereço
    await wait(600);

    await page.getByText('Salvar local').click({ force: true });
    await wait(3000);
    console.log('✅ Local "Torre Eiffel" salvo!');
  }

  // ── 3. CADASTRO DE ROLE DO DIA ────────────────────
  console.log('\n🗓️  Criando role do dia...');
  await goto(page, '/dayplans');
  await wait(1000);

  const btnNovoRole = page.getByText('Novo role');
  if (await btnNovoRole.isVisible().catch(() => false)) {
    await btnNovoRole.click({ force: true });
    await wait(1500);

    const inp3 = page.locator('input');
    await inp3.nth(0).fill('Dia na Torre Eiffel');   // Título
    await wait(600);

    // Observações (TextInput multilinha — pode ser textarea)
    const obs = page.locator('textarea, input[placeholder*="bserv"]');
    if (await obs.first().isVisible().catch(() => false)) {
      await obs.first().fill('Subir a Torre Eiffel ao amanhecer e almoçar no Café de l\'Homme.');
      await wait(600);
    }

    await page.getByText('Salvar role').click({ force: true });
    await wait(3000);
    console.log('✅ Role "Dia na Torre Eiffel" salvo!');
  }

  // ── 4. CADASTRO DE BUDDY ──────────────────────────
  console.log('\n👥 Adicionando trip buddy...');
  await goto(page, '/buddies');
  await wait(1000);

  const btnBuddy = page.getByText('Adicionar buddy');
  if (await btnBuddy.isVisible().catch(() => false)) {
    await btnBuddy.click({ force: true });
    await wait(1500);

    const inp4 = page.locator('input[type="email"], input[placeholder*="mail"]').first();
    await inp4.fill('amigo@exemplo.com');
    await wait(600);

    // Seleciona nível "Travel Planner" (já deve estar selecionado por padrão)
    await page.getByText('Travel Planner').click({ force: true });
    await wait(400);

    await page.getByText('Adicionar', { exact: true }).click({ force: true });
    await wait(3000);
    console.log('✅ Buddy adicionado!');
  }

  // ── RESULTADO ─────────────────────────────────────
  console.log('\n🎉 Cadastros concluídos! Verifique a lista em cada aba.');
  await goto(page, '/trips');
  await wait(5000); // mantém janela aberta por 5s para você ver

  await browser.close();
})().catch(e => { console.error('\n❌ ERRO:', e.message); process.exit(1); });
