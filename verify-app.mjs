import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'fs';
import { join } from 'path';

// Carrega .env.test se existir
try {
  const raw = readFileSync(join(import.meta.dirname, '.env.test'), 'utf8');
  for (const line of raw.split('\n')) {
    const [k, ...rest] = line.split('=');
    const v = rest.join('=');
    if (k && v !== undefined && !process.env[k.trim()]) process.env[k.trim()] = v.trim();
  }
} catch {}

const BASE   = 'http://localhost:8081';
const SHOTS  = 'c:/repositorio/tripvilla/verify-screenshots';
const EMAIL  = process.env.TEST_EMAIL || 'leonardovilla.tech@gmail.com';
const PASS   = process.env.TEST_PASSWORD || '';

mkdirSync(SHOTS, { recursive: true });

let step = 0;
async function shot(page, name) {
  const file = join(SHOTS, `${String(++step).padStart(2,'0')}-${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`📸 ${file}`);
  return file;
}

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

// Navega por URL e aguarda estabilização
// Usa 'domcontentloaded' porque Firebase mantém conexões abertas (impede networkidle)
async function goto(page, path) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await wait(2500); // aguarda render dos componentes React
}

// Clica por texto usando evaluate (bypassa pointer-events de overlays)
async function clickText(page, text) {
  return page.evaluate((t) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeValue && node.nodeValue.trim() === t) {
        let el = node.parentElement;
        while (el && !el.onclick && el.getAttribute('role') !== 'button' && el.tagName !== 'A') {
          el = el.parentElement;
        }
        if (el) { el.click(); return true; }
      }
    }
    return false;
  }, text);
}

const errors = [];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx  = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();

  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  // ── 1. PÁGINA INICIAL ──────────────────────────────
  console.log('\n=== 1. PÁGINA INICIAL ===');
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
await wait(2000);
  await shot(page, 'home');
  console.log('URL:', page.url());

  // ── 2. LOGIN ───────────────────────────────────────
  console.log('\n=== 2. LOGIN ===');
  const emailInput = page.locator('input[placeholder*="mail"], input[type="email"]').first();
  const hasLogin   = await emailInput.isVisible().catch(() => false);

  if (!hasLogin) {
    console.log('⚠️  Tela de login não encontrada — usuário pode já estar logado');
    await shot(page, 'already-logged-in');
  } else if (!PASS) {
    console.log('⚠️  TEST_PASSWORD não definido — pulando login com credenciais reais');
    await shot(page, 'login-screen');
  } else {
    await emailInput.fill(EMAIL);
    await page.locator('input[type="password"]').first().fill(PASS);
    await shot(page, 'login-preenchido');

    // Clica no botão Entrar via evaluate (bypassa overlays)
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

    // Aguarda navegação pós-login (guard reage ao onAuthStateChanged)
    try {
      await page.waitForURL(url => !url.includes('/auth/login'), { timeout: 12000 });
      console.log('✅ Login realizado');
    } catch {
      await wait(5000);
    }
    await shot(page, 'after-login');
    console.log('URL pós-login:', page.url());
  }

  const isLoggedIn = !page.url().includes('/auth/login');
  if (!isLoggedIn) {
    console.log('\n❌ Não foi possível autenticar. Encerrando testes de CRUD.');
    await browser.close();
    return;
  }

  // ── 3. ABA VIAGENS ────────────────────────────────
  console.log('\n=== 3. ABA VIAGENS ===');
  await goto(page, '/trips');
  await shot(page, 'viagens-lista');
  console.log('✅ Aba Viagens carregada');

  // O FAB de Viagens é um ícone "+" sem texto — clica por coordenadas (bottom-right)
  // Viewport 390×844: FAB center ≈ (342, 720) acima da tab bar
  await page.mouse.click(342, 720);
  await wait(1500);
  const modalTitle = page.getByText('Nova Viagem');
  const modalAberto = await modalTitle.isVisible().catch(() => false);
  if (modalAberto) {
    await shot(page, 'viagens-modal-aberto');

    // Placeholders: "Ex: Argentina 2026" | "Ex: Argentina" | "Ex: Buenos Aires" | "Ex: Buenos Aires" | "0,00"
    const inputs = page.locator('input');
    const count  = await inputs.count();
    console.log(`  Inputs no modal de viagens: ${count}`);
    if (count >= 5) {
      await inputs.nth(0).fill('Viagem Teste QA');   // Descrição
      await inputs.nth(1).fill('Brasil');              // País
      await inputs.nth(2).fill('SP');                 // Estado
      await inputs.nth(3).fill('São Paulo');           // Cidade
      await inputs.nth(4).fill('5000');               // Orçamento
      await shot(page, 'viagens-form-preenchido');
      console.log('✅ Formulário de viagem preenchido');
    }

    // Cancela (não persistir dado de teste)
    const cancelBtn = page.getByText('Cancelar');
    if (await cancelBtn.isVisible().catch(() => false)) {
      await cancelBtn.click();
      await wait(500);
    }
  } else {
    console.log('⚠️  Modal de viagem não abriu — FAB não encontrado nas coordenadas esperadas');
    await shot(page, 'viagens-fab-miss');
  }

  // ── 4. ABA LOCAIS ─────────────────────────────────
  console.log('\n=== 4. ABA LOCAIS ===');
  await goto(page, '/places');
  await shot(page, 'locais-lista');
  console.log('✅ Aba Locais carregada');

  // Abre modal de novo local — botão "Novo local"
  const fabLocais = page.getByText('Novo local');
  const hasFabL = await fabLocais.isVisible().catch(() => false);
  if (hasFabL) {
    await fabLocais.click({ force: true });
    await wait(1500);
    await shot(page, 'locais-modal-aberto');

    const inputs2 = page.locator('input');
    const count2  = await inputs2.count();
    if (count2 > 0) {
      const phs = [];
      for (let i = 0; i < count2; i++) phs.push(await inputs2.nth(i).getAttribute('placeholder') ?? '');
      console.log('  Placeholders locais:', phs.join(' | '));
      for (let i = 0; i < count2; i++) {
        const ph = phs[i].toLowerCase();
        if (ph.includes('nome') || ph.includes('local') || ph.includes('name'))
          await inputs2.nth(i).fill('Local Teste QA');
        else if (ph.includes('endereço') || ph.includes('endereco') || ph.includes('address'))
          await inputs2.nth(i).fill('Rua Teste, 100');
        else if (ph.includes('categoria') || ph.includes('tipo') || ph.includes('category'))
          await inputs2.nth(i).fill('Restaurante');
        else if (ph.includes('nota') || ph.includes('observ') || ph.includes('note'))
          await inputs2.nth(i).fill('Local para teste automatizado');
      }
      await shot(page, 'locais-form-preenchido');
      console.log('✅ Formulário de local preenchido');
    }
    const cancelBtn2 = page.getByText('Cancelar');
    if (await cancelBtn2.isVisible().catch(() => false)) {
      await cancelBtn2.click();
      await wait(500);
    }
  }

  // ── 5. ABA ROLE DO DIA ────────────────────────────
  console.log('\n=== 5. ABA ROLE DO DIA ===');
  await goto(page, '/dayplans');
  await shot(page, 'dayplans-lista');
  console.log('✅ Aba Role do Dia carregada');

  // Botão "Novo role"
  const fabDay = page.getByText('Novo role');
  const hasFabD = await fabDay.isVisible().catch(() => false);
  if (hasFabD) {
    await fabDay.click({ force: true });
    await wait(1500);
    await shot(page, 'dayplans-modal-aberto');

    const inputs3 = page.locator('input');
    const count3  = await inputs3.count();
    if (count3 > 0) {
      const phs3 = [];
      for (let i = 0; i < count3; i++) phs3.push(await inputs3.nth(i).getAttribute('placeholder') ?? '');
      console.log('  Placeholders dayplan:', phs3.join(' | '));
      for (let i = 0; i < count3; i++) {
        const ph = phs3[i].toLowerCase();
        if (ph.includes('título') || ph.includes('titulo') || ph.includes('nome') || ph.includes('role'))
          await inputs3.nth(i).fill('Role do Dia Teste QA');
        else if (ph.includes('data') || ph.includes('date'))
          await inputs3.nth(i).fill('2026-12-01');
        else if (ph.includes('local') || ph.includes('lugar'))
          await inputs3.nth(i).fill('Parque Ibirapuera');
        else if (ph.includes('nota') || ph.includes('observ'))
          await inputs3.nth(i).fill('Passeio de teste');
      }
      await shot(page, 'dayplans-form-preenchido');
      console.log('✅ Formulário de role do dia preenchido');
    }
    const cancelBtn3 = page.getByText('Cancelar');
    if (await cancelBtn3.isVisible().catch(() => false)) {
      await cancelBtn3.click();
      await wait(500);
    }
  }

  // ── 6. ABA RELATÓRIOS ─────────────────────────────
  console.log('\n=== 6. ABA RELATÓRIOS ===');
  await goto(page, '/reports');
  await shot(page, 'relatorios');
  console.log('✅ Aba Relatórios carregada');

  // ── 7. ABA TRIP BUDDIES ───────────────────────────
  console.log('\n=== 7. ABA TRIP BUDDIES ===');
  await goto(page, '/buddies');
  await shot(page, 'buddies-lista');
  console.log('✅ Aba Trip Buddies carregada');

  // Botão "Adicionar buddy"
  const fabBuddies = page.getByText('Adicionar buddy');
  const hasFabB = await fabBuddies.isVisible().catch(() => false);
  if (hasFabB) {
    await fabBuddies.click({ force: true });
    await wait(1500);
    await shot(page, 'buddies-modal-aberto');

    const inputs4 = page.locator('input');
    const count4  = await inputs4.count();
    if (count4 > 0) {
      const phs4 = [];
      for (let i = 0; i < count4; i++) phs4.push(await inputs4.nth(i).getAttribute('placeholder') ?? '');
      console.log('  Placeholders buddies:', phs4.join(' | '));
      for (let i = 0; i < count4; i++) {
        const ph = phs4[i].toLowerCase();
        if (ph.includes('nome') || ph.includes('name') || ph.includes('amigo') || ph.includes('buddy'))
          await inputs4.nth(i).fill('Buddy Teste QA');
        else if (ph.includes('email'))
          await inputs4.nth(i).fill('buddy_teste@example.com');
        else if (ph.includes('papel') || ph.includes('role') || ph.includes('função'))
          await inputs4.nth(i).fill('Acompanhante');
      }
      await shot(page, 'buddies-form-preenchido');
      console.log('✅ Formulário de buddy preenchido');
    }
    const cancelBtn4 = page.getByText('Cancelar');
    if (await cancelBtn4.isVisible().catch(() => false)) {
      await cancelBtn4.click();
      await wait(500);
    }
  }

  // ── ERROS DE CONSOLE ──────────────────────────────
  console.log('\n=== ERROS DE CONSOLE ===');
  const filteredErrors = errors.filter(e =>
    !e.includes('favicon') &&
    !e.includes('Could not establish connection') &&
    !e.includes('Extension context')
  );
  if (filteredErrors.length === 0) {
    console.log('✅ Nenhum erro de console detectado');
  } else {
    filteredErrors.forEach(e => console.log('❌', e));
  }

  await browser.close();
  console.log(`\n✅ Verificação concluída — ${step} screenshots em ${SHOTS}`);
})().catch(e => { console.error('ERRO FATAL:', e.message); process.exit(1); });
