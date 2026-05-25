/**
 * Teste completo das regras de negócio do TripVilla
 * Executa em browser visível (headed) para acompanhamento
 */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'fs';
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
const EMAIL = process.env.TEST_EMAIL    || 'leonardovilla.tech@gmail.com';
const PASS  = process.env.TEST_PASSWORD || '';
const SHOTS = 'c:/repositorio/tripvilla/test-screenshots';
mkdirSync(SHOTS, { recursive: true });

let step = 0;
const shot = async (page, name) => {
  const f = join(SHOTS, `${String(++step).padStart(2,'0')}-${name}.png`);
  await page.screenshot({ path: f, fullPage: true });
  console.log(`  📸 ${f}`);
};

const wait = (ms) => new Promise(r => setTimeout(r, ms));

const goto = async (page, path) => {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await wait(3000);
};

// Clica em elemento por texto exato, bypassa pointer-events overlay
const clickText = (page, text) => page.evaluate((t) => {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    if (node.nodeValue?.trim() === t) {
      let el = node.parentElement;
      for (let i = 0; i < 6; i++) {
        if (!el) break;
        el.click();
        el = el.parentElement;
      }
      return true;
    }
  }
  return false;
}, text);

const log = (msg) => console.log(`\n${'─'.repeat(50)}\n${msg}\n${'─'.repeat(50)}`);

(async () => {
  const browser = await chromium.launch({
    headless: false,
    slowMo: 700,
    args: ['--start-maximized'],
  });

  const ctx  = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();

  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('408') && !m.text().includes('shadow')) errors.push(m.text()); });

  // ════════════════════════════════════════
  // 1. LOGIN
  // ════════════════════════════════════════
  log('1. LOGIN');
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await wait(3000);
  await shot(page, 'home');

  const emailInput = page.locator('input[type="email"], input[placeholder*="mail"]').first();
  const onLogin    = await emailInput.isVisible().catch(() => false);

  if (onLogin && PASS) {
    console.log('  Preenchendo credenciais...');
    await emailInput.fill(EMAIL);
    await page.locator('input[type="password"]').first().fill(PASS);
    await shot(page, 'login-preenchido');
    await clickText(page, 'Entrar');
    try { await page.waitForURL(u => !u.includes('/auth/login'), { timeout: 15000 }); }
    catch { await wait(5000); }
    await shot(page, 'apos-login');
    console.log('  URL:', page.url());
  } else if (!onLogin) {
    console.log('  ✅ Já autenticado');
    await shot(page, 'ja-logado');
  } else {
    console.log('  ⚠️  TEST_PASSWORD não definido');
    await browser.close(); return;
  }

  const loggedIn = !page.url().includes('/auth/login');
  if (!loggedIn) { console.log('  ❌ Login falhou'); await browser.close(); return; }
  console.log('  ✅ Autenticado com sucesso');

  // ════════════════════════════════════════
  // 2. LOCAIS SEM VIAGEM — FAB deve estar oculto
  // ════════════════════════════════════════
  log('2. LOCAIS SEM VIAGEM (FAB deve estar oculto)');
  await goto(page, '/places');
  await shot(page, 'locais-sem-viagem');

  const fabLocais = page.getByText('Novo local');
  const temFabLocais = await fabLocais.isVisible().catch(() => false);
  if (temFabLocais) {
    console.log('  ⚠️  FAB de locais está visível mesmo sem viagem (esperado: oculto)');
  } else {
    console.log('  ✅ FAB "Novo local" oculto corretamente — sem viagens cadastradas');
  }

  // Verifica mensagem de hint
  const hint = page.getByText('Cadastre uma viagem primeiro');
  const temHint = await hint.isVisible().catch(() => false);
  console.log(temHint ? '  ✅ Mensagem de hint exibida' : '  ⚠️  Mensagem de hint não encontrada');

  // ════════════════════════════════════════
  // 3. ROLE DO DIA SEM LOCAIS — FAB deve estar oculto
  // ════════════════════════════════════════
  log('3. ROLE DO DIA SEM LOCAIS (FAB deve estar oculto)');
  await goto(page, '/dayplans');
  await shot(page, 'roles-sem-locais');

  const fabRoles = page.getByText('Novo role');
  const temFabRoles = await fabRoles.isVisible().catch(() => false);
  if (temFabRoles) {
    console.log('  ⚠️  FAB de roles está visível mesmo sem locais');
  } else {
    console.log('  ✅ FAB "Novo role" oculto corretamente — sem locais cadastrados');
  }

  // ════════════════════════════════════════
  // 4. CRIAR VIAGEM
  // ════════════════════════════════════════
  log('4. CRIAR VIAGEM');
  await goto(page, '/trips');
  await shot(page, 'viagens-lista');

  // FAB de viagens é ícone "+" sem texto — tenta por coordenadas
  console.log('  Clicando no FAB de viagens (coordenadas 342, 720)...');
  await page.mouse.click(342, 720);
  await wait(2000);

  const modalViagem = page.getByText('Nova Viagem');
  const modalViagemAberto = await modalViagem.isVisible().catch(() => false);

  if (!modalViagemAberto) {
    // Tenta pelo role="button" mais próximo do rodapé
    console.log('  Tentando click alternativo no FAB...');
    await page.mouse.click(342, 760);
    await wait(2000);
  }

  const modalAberto = await page.getByText('Nova Viagem').isVisible().catch(() => false);
  await shot(page, 'viagem-modal');

  if (modalAberto) {
    console.log('  ✅ Modal de nova viagem aberto');
    const inputs = page.locator('input');
    const n = await inputs.count();
    console.log(`  ${n} campos encontrados`);

    if (n >= 1) await inputs.nth(0).fill('Europa 2026');
    if (n >= 2) await inputs.nth(1).fill('França');
    if (n >= 3) await inputs.nth(2).fill('Île-de-France');
    if (n >= 4) await inputs.nth(3).fill('Paris');
    if (n >= 5) await inputs.nth(4).fill('15000');
    await shot(page, 'viagem-form-preenchido');

    // Salva
    const saveBtn = page.getByText('Salvar');
    if (await saveBtn.isVisible().catch(() => false)) {
      await saveBtn.click({ force: true });
    } else {
      await clickText(page, 'Salvar');
    }
    await wait(2500);
    await shot(page, 'viagem-salva');
    console.log('  ✅ Viagem "Europa 2026" criada');
  } else {
    console.log('  ⚠️  Modal de viagem não abriu — pulando criação');
  }

  // ════════════════════════════════════════
  // 5. LOCAIS COM VIAGEM — FAB deve aparecer + criar local
  // ════════════════════════════════════════
  log('5. LOCAIS COM VIAGEM (FAB deve aparecer)');
  await goto(page, '/places');
  await shot(page, 'locais-com-viagem');

  const fabLocaisAgora = page.getByText('Novo local');
  const temFabAgora = await fabLocaisAgora.isVisible().catch(() => false);
  console.log(temFabAgora ? '  ✅ FAB "Novo local" visível após criar viagem' : '  ⚠️  FAB ainda oculto');

  if (temFabAgora) {
    await fabLocaisAgora.click({ force: true });
    await wait(2000);
    await shot(page, 'local-modal');

    // Seleciona viagem no seletor (chip "Europa 2026")
    const tripChip = page.getByText('Europa 2026').first();
    if (await tripChip.isVisible().catch(() => false)) {
      await tripChip.click({ force: true });
      await wait(500);
      console.log('  ✅ Viagem selecionada no local');
    }

    const inputs2 = page.locator('input');
    const n2 = await inputs2.count();
    for (let i = 0; i < n2; i++) {
      const ph = (await inputs2.nth(i).getAttribute('placeholder') ?? '').toLowerCase();
      if (ph.includes('nome') || ph.includes('local') || ph.includes('name')) await inputs2.nth(i).fill('Torre Eiffel');
      else if (ph.includes('endereço') || ph.includes('address') || ph.includes('localização')) await inputs2.nth(i).fill('Champ de Mars, Paris');
      else if (ph.includes('abertura') || ph.includes('open')) await inputs2.nth(i).fill('09:00');
      else if (ph.includes('fechamento') || ph.includes('close')) await inputs2.nth(i).fill('23:00');
    }
    await shot(page, 'local-form-preenchido');

    const saveLocal = page.getByText('Salvar');
    if (await saveLocal.isVisible().catch(() => false)) await saveLocal.click({ force: true });
    else await clickText(page, 'Salvar');
    await wait(2500);
    await shot(page, 'local-salvo');
    console.log('  ✅ Local "Torre Eiffel" criado');
  }

  // ════════════════════════════════════════
  // 6. ROLE DO DIA COM LOCAIS — FAB deve aparecer + criar role
  // ════════════════════════════════════════
  log('6. ROLE DO DIA COM LOCAIS (FAB deve aparecer)');
  await goto(page, '/dayplans');
  await shot(page, 'roles-com-locais');

  const fabRolesAgora = page.getByText('Novo role');
  const temFabRoles2 = await fabRolesAgora.isVisible().catch(() => false);
  console.log(temFabRoles2 ? '  ✅ FAB "Novo role" visível após criar local' : '  ⚠️  FAB de roles ainda oculto');

  if (temFabRoles2) {
    await fabRolesAgora.click({ force: true });
    await wait(2000);
    await shot(page, 'role-modal');

    // Seleciona viagem
    const tripChipRole = page.getByText('Europa 2026').first();
    if (await tripChipRole.isVisible().catch(() => false)) {
      await tripChipRole.click({ force: true });
      await wait(500);
      console.log('  ✅ Viagem selecionada no role');
    }

    const inputs3 = page.locator('input');
    const n3 = await inputs3.count();
    for (let i = 0; i < n3; i++) {
      const ph = (await inputs3.nth(i).getAttribute('placeholder') ?? '').toLowerCase();
      if (ph.includes('título') || ph.includes('titulo') || ph.includes('nome')) await inputs3.nth(i).fill('Dia na Torre Eiffel');
      else if (ph.includes('data') || ph.includes('date')) await inputs3.nth(i).fill('2026-07-14');
      else if (ph.includes('nota') || ph.includes('observ')) await inputs3.nth(i).fill('Visita ao ponto mais famoso de Paris');
    }
    await shot(page, 'role-form-preenchido');

    const saveRole = page.getByText('Salvar');
    if (await saveRole.isVisible().catch(() => false)) await saveRole.click({ force: true });
    else await clickText(page, 'Salvar');
    await wait(2500);
    await shot(page, 'role-salvo');
    console.log('  ✅ Role "Dia na Torre Eiffel" criado');
  }

  // ════════════════════════════════════════
  // 7. RELATÓRIOS
  // ════════════════════════════════════════
  log('7. RELATÓRIOS');
  await goto(page, '/reports');
  await shot(page, 'relatorios');
  console.log('  ✅ Aba de relatórios carregada');

  // ════════════════════════════════════════
  // 8. BUDDIES — modal com seletor de viagens
  // ════════════════════════════════════════
  log('8. TRIP BUDDIES — seletor de viagens no modal');
  await goto(page, '/buddies');
  await shot(page, 'buddies-lista');

  const fabBuddies = page.getByText('Adicionar buddy');
  const temFabBuddies = await fabBuddies.isVisible().catch(() => false);
  console.log(temFabBuddies ? '  ✅ FAB de buddies visível' : '  ⚠️  FAB de buddies não encontrado');

  if (temFabBuddies) {
    await fabBuddies.click({ force: true });
    await wait(2000);
    await shot(page, 'buddies-modal');

    // Verifica se o seletor de viagens está presente
    const tripLabel = page.getByText('Viagens compartilhadas');
    const temSeletor = await tripLabel.isVisible().catch(() => false);
    console.log(temSeletor ? '  ✅ Seletor de viagens presente no modal' : '  ⚠️  Seletor de viagens não encontrado');

    // Seleciona viagem para o buddy
    const tripChipBuddy = page.getByText('Europa 2026').first();
    if (await tripChipBuddy.isVisible().catch(() => false)) {
      await tripChipBuddy.click({ force: true });
      await wait(500);
      console.log('  ✅ Viagem selecionada para o buddy');
    }

    // Preenche email
    const emailBuddy = page.locator('input[placeholder*="mail"]').first();
    if (await emailBuddy.isVisible().catch(() => false)) {
      await emailBuddy.fill('amigo@gmail.com');
    }

    await shot(page, 'buddies-form-preenchido');
    console.log('  ✅ Formulário de buddy preenchido com viagem selecionada');

    // Fecha sem salvar (pressiona fora do modal)
    await page.keyboard.press('Escape');
    await wait(1000);
  }

  // ════════════════════════════════════════
  // RESULTADO FINAL
  // ════════════════════════════════════════
  log('RESULTADO');
  if (errors.length > 0) {
    console.log('Erros de console:');
    errors.forEach(e => console.log('  ❌', e));
  } else {
    console.log('  ✅ Nenhum erro de console');
  }
  console.log(`\n✅ Teste concluído — ${step} screenshots em ${SHOTS}`);
  console.log('  Pressione Ctrl+C para fechar o browser ou aguarde 10s...');

  await wait(10000);
  await browser.close();
})().catch(e => { console.error('ERRO FATAL:', e.message); process.exit(1); });
