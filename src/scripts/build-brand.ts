import { readFileSync, writeFileSync } from "node:fs";
import { chromium, type Page } from "playwright";

/**
 * Gera os arquivos de marca a partir de src/app/icon.svg, que é a fonte única:
 *   npm run brand:build
 * Saída: favicon.ico, apple-icon.png, ícones de app (public/icons) e a imagem
 * que aparece quando o link é compartilhado (opengraph-image.png).
 */

const master = readFileSync("src/app/icon.svg", "utf8");
const mark = master.slice(master.indexOf("<g "), master.lastIndexOf("</svg>"));
const tile = master.match(/<rect[^>]*fill="(#[0-9a-f]{6})"/i)?.[1] ?? "#5750f1";

/** Fundo inteiro (o sistema recorta os cantos), com a marca reduzida a partir do centro. */
function fullBleed(scale: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${tile}"/><g transform="translate(32 32) scale(${scale}) translate(-32 -32)">${mark}</g></svg>`;
}

async function png(page: Page, svg: string, size: number): Promise<Buffer> {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<body style="margin:0;background:transparent">${svg.replace("<svg", `<svg id="s" width="${size}" height="${size}" style="display:block"`)}</body>`,
  );
  return page.locator("#s").screenshot({ omitBackground: true });
}

/** ICO com PNGs embutidos, aceito por todos os navegadores atuais. */
function ico(images: { size: number; data: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const entries = images.map(({ size, data }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size, 0);
    entry.writeUInt8(size, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images.map((image) => image.data)]);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });

  // Uma captura por vez: a página é a mesma para todos os tamanhos.
  const favicon: { size: number; data: Buffer }[] = [];
  for (const size of [16, 32, 48]) favicon.push({ size, data: await png(page, master, size) });
  writeFileSync("src/app/favicon.ico", ico(favicon));

  writeFileSync("src/app/apple-icon.png", await png(page, fullBleed(1), 180));
  writeFileSync("public/icons/icon-192.png", await png(page, master, 192));
  writeFileSync("public/icons/icon-512.png", await png(page, master, 512));
  // Android recorta em círculo: a marca precisa caber nos 80% centrais.
  writeFileSync("public/icons/icon-maskable-512.png", await png(page, fullBleed(0.78), 512));

  await page.setViewportSize({ width: 1200, height: 630 });
  await page.setContent(
    `<!doctype html><html><head><meta charset="utf-8">
     <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap" rel="stylesheet">
     <style>
       body{margin:0;width:1200px;height:630px;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#f4f4f5;font-family:Inter,system-ui,sans-serif}
       .lockup{display:flex;align-items:center;gap:34px}
       .word{font-size:124px;font-weight:600;letter-spacing:-0.035em;color:#18181b;line-height:1}
       .tag{margin-top:44px;font-size:36px;color:#52525b;letter-spacing:-0.01em}
     </style></head><body>
     <div class="lockup">${master.replace("<svg", '<svg width="148" height="148"')}<span class="word">ficonpa</span></div>
     <div class="tag">Boletos do e-mail direto para o Conta Azul.</div>
     </body></html>`,
    { waitUntil: "networkidle" },
  );
  await page.evaluate(() => document.fonts.ready);
  writeFileSync("src/app/opengraph-image.png", await page.screenshot({ type: "png" }));

  await browser.close();
  console.log("Marca gerada a partir de src/app/icon.svg.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
