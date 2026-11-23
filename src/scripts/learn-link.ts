import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { getSettings } from "@/lib/settings";
import { closeSharedBrowser, resolveUrl } from "@/lib/links/resolve";

/**
 * Testa/aprende um link na hora, sem passar pela fila:
 *   npm run link:learn -- "https://..." [--out boleto.pdf] [--model provedor/modelo]
 */
async function main() {
  const args = process.argv.slice(2);
  const url = args.find((arg) => /^https?:\/\//.test(arg));
  if (!url) {
    console.error('Uso: npm run link:learn -- "https://..." [--out arquivo.pdf] [--model modelo]');
    process.exit(2);
  }
  const option = (name: string) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const settings = await getSettings();
  const started = Date.now();
  try {
    const result = await resolveUrl(url, {
      model: option("--model") ?? settings.linkAgentModel,
      maxAttempts: settings.linkLearningAttempts,
      onProgress: (line) => console.log(`· ${line}`),
    });
    console.log(`\nOK (${result.method}) em ${((Date.now() - started) / 1000).toFixed(1)}s — PDF de ${result.pdf.buffer.length} bytes`);
    const out = option("--out");
    if (out) {
      await writeFile(out, result.pdf.buffer);
      console.log(`PDF salvo em ${out}`);
    }
  } catch (error) {
    console.error(`\nFALHOU (${error instanceof Error ? error.constructor.name : "Erro"}): ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  } finally {
    await closeSharedBrowser();
    process.exit();
  }
}

main();
