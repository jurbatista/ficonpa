import { LinksManager } from "@/components/app/links-manager";
import { PageHeader } from "@/components/app/ui";
import { listEmailLinks, listLinkRecipes } from "@/lib/links/queries";

export const dynamic = "force-dynamic";

export default async function LinksPage() {
  const [recipes, links] = await Promise.all([listLinkRecipes(), listEmailLinks()]);
  return (
    <>
      <PageHeader
        title="Links de boleto"
        description="Quando o e-mail traz um link em vez do PDF, o sistema abre o link, baixa o boleto e guarda o caminho para as próximas vezes."
      />
      <div className="px-5 pb-8 lg:px-7">
        <LinksManager recipes={recipes} links={links} />
      </div>
    </>
  );
}
