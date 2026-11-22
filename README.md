# ficonpa

Leitor de boletos por e-mail que lança contas a pagar no Conta Azul, com triagem automática e revisão humana opcional.

## O que ele faz

1. Conecta uma ou mais caixas de e-mail via IMAP (senha de aplicativo).
2. Varre **apenas anexos PDF** — o corpo do e-mail não é armazenado.
3. Passa cada PDF por uma triagem determinística (linha digitável, código de barras, valor e vencimento) e por uma etapa de extração complementar dos campos.
4. Identifica o fornecedor em **qualquer pessoa cadastrada** no Conta Azul (match exato por CNPJ ou por nome).
5. Classifica categoria, conta financeira e centro de custo por regras.
6. Cria a conta a pagar no Conta Azul via `POST /v1/financeiro/contas-a-pagar`, com `referencia_externa` para idempotência.
7. Se o **lançamento automático** estiver ligado e todas as travas passarem, lança sem revisão. O item continua aparecendo na lista com origem “Automático”.
8. Caso contrário, o item fica em revisão na tela de contas a pagar.
9. PDFs que não são boleto são descartados e não aparecem na tela principal.
10. Tudo (banco + arquivos em disco) é apagado após **90 dias** contados da entrada no sistema ou do lançamento.

## Stack

- Next.js 16 (App Router) + React 19 + Tailwind 4, com o tema free **NextAdmin**.
- PostgreSQL + Drizzle ORM.
- Redis + BullMQ (sincronização de e-mail, processamento de documentos, lançamento e retenção).
- IMAP (`imapflow` + `mailparser`), PDF (`unpdf`).
- OpenRouter para extração complementar dos dados.
- Auth simples por senha única + JWT em cookie httpOnly (`jose`).
- Credenciais sensíveis criptografadas com AES-256-GCM.

## Telas

- **Painel** — visão geral, toggle global de lançamento automático e atividade recente.
- **Contas a pagar** — abas “Todos”, “Na fila”, “Lançados”, “Rejeitados” e “Precisa de atenção”.
- **Detalhe** — revisão dos campos, pré-visualização do PDF, análise do documento, aprovar/rejeitar/reprocessar.
- **E-mails** — cadastro, teste de conexão, sincronização manual e exclusão de caixas IMAP.
- **Conta Azul** — OAuth, status do token e sincronização de pessoas, categorias, contas e centros de custo.
- **Configurações** — integrações (OpenRouter e Conta Azul), senha de acesso, limiares, retenção e limpeza manual.

## Rodando localmente

Pré-requisitos: Node 20.9+ e Docker (para Postgres/Redis).

```bash
cp .env.example .env
# edite .env com AUTH_SECRET, APP_ENCRYPTION_KEY, OPENROUTER_API_KEY etc.

docker compose up -d postgres redis

npm install
npm run db:push     # cria as tabelas
npm run dev         # http://localhost:3000

# em outro terminal
npm run worker
```

A senha inicial é `APP_PASSWORD` (padrão `ficonpa`). Troque antes de expor o app — também é
possível alterá-la em **Configurações → Senha de acesso**.

Para não guardar a senha em texto puro, gere um hash e use `APP_PASSWORD_HASH`:

```bash
npm run password:hash -- 'sua-senha-forte'
```

### Variáveis de ambiente

As credenciais de integração e a senha podem ser preenchidas em **Configurações** e ficam
criptografadas no banco.

| Variável | Onde configurar |
| --- | --- |
| `APP_PASSWORD` ou `APP_PASSWORD_HASH` | Configurações → Senha de acesso (ou `.env` como fallback) |
| `CONTA_AZUL_CLIENT_ID` / `CONTA_AZUL_CLIENT_SECRET` | Configurações → Conta Azul (ou `.env`) |
| `CONTA_AZUL_REDIRECT_URI` | Configurações → Conta Azul (ou `.env`) |
| `OPENROUTER_API_KEY` | Configurações → OpenRouter (ou `.env`) |

Estas variáveis são de infraestrutura e devem ser definidas no `.env`. Alterações exigem reiniciar
os serviços:

| Variável | Para que serve |
| --- | --- |
| `DATABASE_URL` | Conexão PostgreSQL |
| `REDIS_URL` | Conexão Redis (BullMQ) |
| `AUTH_SECRET` | Assinatura do JWT de sessão |
| `APP_ENCRYPTION_KEY` | Criptografia de tokens e senhas IMAP |
| `APP_URL` | URL pública usada em redirecionamentos |
| `ATTACHMENT_DIR` | Pasta dos PDFs (no Docker: `/app/data/attachments`) |

## Conta Azul

1. Crie um aplicativo no Portal do Desenvolvedor do Conta Azul.
2. Cadastre a URL de redirecionamento: `https://SEU_DOMINIO/api/conta-azul/callback`.
3. Preencha Client ID, Client Secret e URL de redirecionamento em **Configurações → Conta Azul**.
4. No painel, abra **Conta Azul → Conectar Conta Azul** e autorize.
5. Clique em **Sincronizar cadastros**.

Uma instalação atende **uma empresa** do Conta Azul.

## Regras de decisão

- Entrada na triagem: `is_boleto ≥ 0,80` (configurável em Configurações).
- Abaixo disso: descartado como “não é boleto”.
- Sem fornecedor identificado: vai para “Precisa de atenção”.
- Lançamento automático exige **todas** as condições:
  - toggle ligado;
  - `auto_post_safe ≥ 0,95`;
  - match de fornecedor por **CNPJ exato**;
  - qualidade da extração ≥ 2;
  - categoria e conta financeira resolvidas;
  - nenhuma duplicidade (fornecedor + valor + vencimento).
- Qualquer falha, recusa ou baixa confiança da análise automática → revisão humana (**fail closed**).

## Produção (Docker)

```bash
cp .env.example .env
# ajuste as variáveis; em produção use APP_URL e redirect URI HTTPS

docker compose up -d --build
docker compose logs -f web worker
```

O serviço `migrate` roda as migrations do Drizzle antes de subir `web` e `worker`.
Os anexos ficam no volume `attachments_data`; Postgres e Redis têm volumes próprios.

## Manutenção

- **Sincronização de e-mail:** a cada 15 minutos (worker).
- **Retenção:** verificação horária; apaga registros e arquivos mais antigos que `retentionDays` (90 por padrão).
- **Limpeza manual:** Configurações → “Executar limpeza agora”.
- **Reprocessar um documento:** na tela de atenção ou no detalhe do lançamento.

## Estrutura

```
src/
  app/(app)/            telas com layout do tema
  app/api/              rotas HTTP
  app/login/            login
  components/app/       componentes funcionais do ficonpa
  components/common/    layout do tema (sidebar, header)
  components/tailgrids/ UI kit do tema
  db/schema.ts          modelo Drizzle
  lib/                  auth, cripto, filas, IMAP, boleto, regras, pipeline
  workers/index.ts      workers BullMQ
drizzle/                migrations SQL
```

## Segurança

- O app não guarda o conteúdo dos e-mails, apenas metadados mínimos e anexos PDF.
- Senhas IMAP e tokens OAuth são criptografados em repouso (AES-256-GCM).
- Sessão em cookie httpOnly, SameSite=Lax, com expiração de 7 dias.
- Rotas de API exigem sessão, exceto login, health e callback OAuth.
- O estado do OAuth é validado por cookie de curta duração.
- Toda ação sensível é registrada em `audit_log`.
