# Tripvilla (Expo + Firebase)

Projeto React Native Expo com abas, integração com Firebase (Auth, Firestore) e estrutura pronta para sincronização offline/online.

## Instalação

```sh
npm install
```

## Rodando o projeto

```sh
npm run android # ou npm run ios / npm run web
```

## Dependências principais

- expo
- firebase

## Configuração do Firebase

1. Crie um projeto no [Firebase Console](https://console.firebase.google.com/)
2. Copie as credenciais do app web para o arquivo `firebaseConfig.js`
3. Ative Authentication (Email/Password) e Firestore Database

## Estrutura de Pastas

- `/app/(tabs)` — Telas principais (Locais, Rolês, Relatórios)
- `/app/auth` — Telas de autenticação (login/cadastro)
- `/app/services` — Serviços de integração com Firestore

## Sincronização Firestore

A sincronização segue a estrutura:
- `users/{uid}/places/{id}`
- `users/{uid}/day_plans/{id}`
- `users/{uid}/day_plans/{id}/items/{id}`

Veja o repositório original para detalhes de regras e estrutura.

---

Documente aqui qualquer nova dependência instalada:

- `npm install firebase` - SDK Web do Firebase para Auth e Firestore no Expo managed.
- `npm install react-native-toast-message` - Exibir mensagens de validacao e erro no login/cadastro.
- `npx expo install @react-native-community/netinfo` - Detectar conectividade de rede para disparar sincronização offline→online automaticamente.
- `npx expo install expo-sqlite` - Banco SQLite local para armazenamento offline de locais, roles e itens; sincroniza com Firestore quando há conexão.

## PWA (Progressive Web App)

O app suporta instalação como PWA quando acessado pelo navegador. Funcionalidades habilitadas:

- **Instalação** — O navegador exibe o prompt "Adicionar à tela inicial" automaticamente quando os critérios PWA são atendidos (HTTPS + service worker + manifest).
- **Offline** — O service worker (`public/sw.js`) usa estratégia network-first com fallback para cache, permitindo uso básico sem internet.
- **Manifest** — Gerado automaticamente pelo Expo a partir dos campos `web` do `app.json` (nome, tema, ícone, etc.).

Para testar a PWA localmente:
```sh
npm run build   # gera o build estático em dist/
npx serve dist  # serve os arquivos estáticos
```
Acesse `http://localhost:3000` e o Chrome exibirá o ícone de instalação na barra de endereços.
