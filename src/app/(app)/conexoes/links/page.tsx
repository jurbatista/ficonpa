import Link from "next/link";
import { LinksManager } from "@/components/app/links-manager";
import { PageHeader } from "@/components/app/ui";
import { listEmailLinks, listLinkRecipes } from "@/lib/links/queries";

export const dynamic = "force-dynamic";

export default async function LinksPage() {
  const [recipes, links] = await Promise.all([listLinkRecipes(), listEmailLinks()]);
  return (
    <>
      <div className="px-5 pt-6 lg:px-7">
        <Link href="/" className="text-sm text-text-tertiary transition hover:text-text-primary">
          ← Boletos
        </Link>
      </div>
      <PageHeader title="Boletos por link" />
      <div className="px-5 pb-8 lg:px-7">
        <LinksManager recipes={recipes} links={links} />
      </div>
    </>
  );
}
