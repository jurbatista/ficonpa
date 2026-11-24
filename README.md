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

## Boletos que chegam por link

Muitos e-mails não trazem o PDF anexado, só um link (Asaas, Gerencianet/Efí, Iugu…). Para esses:

1. O corpo do e-mail é lido **só em memória** e os links com cara de cobrança são escolhidos
   (texto "boleto/fatura/2ª via", domínios de cobrança conhecidos, assunto do e-mail).
2. Se já existe um **caminho aprendido** para aquele site + formato de link, ele é executado sem IA.
3. Se não existe (ou parou de funcionar), um **agente com navegador headless + LLM** abre o link e vai
   clicando até baixar o PDF do boleto. Cada clique é gravado como um passo declarativo (nunca código).
4. O caminho gravado é **repetido do zero, sem a LLM**, para validar. Quando a URL do PDF pode ser
   montada a partir do link (ex.: `asaas.com/i/{id}` → `asaas.com/b/pdf/{id}`), vira um download
   direto, sem navegador. Só depois de validado ele é salvo.
5. Se a validação falhar, o agente tenta de novo com o erro como contexto (padrão: 3 tentativas).
   **Link expirado e site fora do ar interrompem na hora**; fora do ar é re-tentado mais tarde.
6. **Captcha**: com `TWOCAPTCHA_API_KEY` definida (no `worker`), o desafio é enviado ao
   [2Captcha](https://2captcha.com), a resposta é entregue à página e a busca continua; o ponto do
   captcha fica gravado no caminho aprendido e é resolvido de novo a cada boleto. Atende reCAPTCHA v2
   (inclusive invisível e Enterprise) e Cloudflare Turnstile. Só a origem do site (`https://dominio/`)
   e a chave pública do captcha vão para o serviço — o link da cobrança não. Sem a chave, com outro
   tipo de captcha, ou se o serviço falhar (sem saldo, chave recusada), o link fica esperando uma pessoa.
7. O PDF obtido entra no mesmo fluxo dos anexos (triagem, fornecedor, lançamento).

Tela **Boletos por link** (aberta pelo aviso na página inicial ou por Configurações): links que não
baixaram, teste de um link na hora e sites conhecidos. Pela linha de comando:

```bash
npm run link:learn -- "https://www.asaas.com/i/abc123" --out boleto.pdf
```

Segurança: só `https`, bloqueio de IPs internos/loopback/metadados (SSRF) em toda requisição do navegador,
limite de tamanho e tempo, e o conteúdo das páginas é tratado como dado não confiável pelo agente.
Localmente é preciso `npx playwright install chromium`; no Docker a imagem já inclui o Chromium.

## Stack

- Next.js 16 (App Router) + React 19 + Tailwind 4, com o tema free **NextAdmin**.
- PostgreSQL + Drizzle ORM.
- Redis + BullMQ (sincronização de e-mail, processamento de documentos, lançamento e retenção).
- IMAP (`imapflow` + `mailparser`), PDF (`unpdf`).
- OpenRouter para extração complementar dos dados.
- Auth simples por senha única + JWT em cookie httpOnly (`jose`).
- Credenciais sensíveis criptografadas com AES-256-GCM.

## Telas

- **Boletos** (página inicial) — tudo o que chegou por e-mail, em três abas: “Para revisar”, “Lançados” e
  “Descartados”. No primeiro acesso mostra só os dois passos para começar (Conta Azul e caixa de e-mail).
- **Detalhe do boleto** — campos do lançamento ao lado do PDF; “Lançar no Conta Azul”, “Salvar”, “Descartar”.
- **E-mails** — digite o e-mail; o provedor é detectado e a tela pede só a senha (ou o login da Microsoft).
- **Conta Azul** — conectar/desconectar e atualizar os cadastros (isso também acontece sozinho, de hora em hora).
- **Configurações** — lançamento automático, boletos por link, prazo de guarda, senha e, recolhida,
  a configuração técnica (credenciais da Conta Azul e da Microsoft).
- **Boletos por link** — aberta a partir do aviso na página inicial ou de Configurações: links que não
  puderam ser baixados, teste de um link e sites conhecidos.

## Marca

`src/app/icon.svg` é a fonte da logo. O favicon, os ícones de app e a imagem de compartilhamento
saem dele com `npm run brand:build`. A mesma geometria está em `src/components/common/brand.tsx`.

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
| `TWOCAPTCHA_API_KEY` | Opcional. Chave do 2Captcha para resolver captcha nos links de boleto (usada pelo `worker`) |

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
  - nenhuma cobrança igual ou parecida já lançada (ver abaixo);
  - nenhuma regra da empresa pedindo conferência.
- Qualquer falha, recusa ou baixa confiança da análise automática → revisão humana (**fail closed**).

### Cobrança que já existe

Vale sempre o **primeiro lançamento**. Cada boleto é comparado com as cobranças do mesmo fornecedor
que já passaram por aqui e, com **Conferir no Conta Azul** ligado, com as contas a pagar que já
estão lá (`GET /v1/financeiro/eventos-financeiros/contas-a-pagar/buscar`, lançadas por aqui ou à mão).

| Situação | O que acontece |
| --- | --- |
| Mesma linha digitável, ou mesmo valor e vencimento | Descartado como “Repetido” |
| Mesmo título no banco com outro vencimento ou valor (boleto reemitido) | Descartado como “Repetido” |
| Boleto com juros/multa cujo valor original (ou vencimento original) bate com uma cobrança anterior em aberto | Descartado como “Repetido” |
| Parecido, sem prova (valor maior dentro do limite de juros sobre cobrança vencida e em aberto; mesmo valor com vencimento a até 5 dias; anterior já paga) | Fica em revisão com o aviso; não é lançado sozinho |
| Não foi possível consultar o Conta Azul | Fica em revisão com o aviso; não é lançado sozinho |

As linhas de boleto reemitido e de juros só valem com **Boleto atrasado com juros** ligado; desligado,
o reenvio entra como cobrança nova. O limite de juros (padrão 20%) e o prazo para procurar o primeiro
lançamento (padrão 90 dias) ficam em Configurações → Configuração técnica → Ajustes finos.

O que foi descartado continua visível em **Descartados**, com o motivo, e pode ser restaurado. A mesma
conferência roda de novo na hora de lançar: se a cobrança já existir, a tela pergunta antes de lançar
mesmo assim. Boletos que chegam ao mesmo tempo do mesmo fornecedor são conferidos um de cada vez.

### Regras da empresa

Em **Configurações → Regras** há um campo de texto livre. As regras entram na conferência de cada
documento (nas instruções, nunca misturadas ao conteúdo do documento) e respondem três perguntas:

- **Descartar?** (“Ignorar boletos da Empresa X”) → vai para Descartados com “Descartado por regra”.
- **Exige conferência?** (“Boletos acima de R$ 5.000 passam por conferência”) → não é lançado sozinho.
- **Pode lançar de novo?** (“Boletos da Escola Y com juros podem ser lançados de novo”) → única forma
  de um reenvio com juros não ser tratado como repetido. Uma cobrança idêntica (mesmo boleto, ou mesmo
  valor e vencimento) continua sendo descartada mesmo com essa regra.

Se houver regras e a conferência falhar, nada é lançado sozinho.

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
