import Link from "next/link";
import { notFound } from "next/navigation";
import { PayableDetail, type PayableDetailData } from "@/components/app/payable-detail";
import { getCatalogs } from "@/lib/catalogs";
import { getPayableDetail } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function PayableDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const row = await getPayableDetail(id);
  if (!row) notFound();

  const catalogs = await getCatalogs();

  const data: PayableDetailData = {
    id: row.payable.id,
    documentId: row.document.id,
    attachmentId: row.attachment.id,
    filename: row.attachment.filename,
    status: row.payable.status,
    origin: row.payable.origin,
    supplierId: row.payable.supplierId,
    supplierName: row.payable.supplierName,
    supplierDocument: row.payable.supplierDocument,
    categoryId: row.payable.categoryId,
    financialAccountId: row.payable.financialAccountId,
    costCenterId: row.payable.costCenterId,
    description: row.payable.description,
    value: row.payable.value,
    dueDate: row.payable.dueDate,
    competenceDate: row.payable.competenceDate,
    error: row.payable.error,
    postedAt: row.payable.postedAt ? row.payable.postedAt.toISOString() : null,
    contaAzulEventId: row.payable.contaAzulEventId,
    createdAt: row.payable.createdAt.toISOString(),
    documentStatus: row.document.status,
    confidence: row.document.confidence,
    needsAttention: row.document.needsAttention,
    attentionReason: row.document.attentionReason,
    jev: row.document.jev,
    extraction: row.document.extraction,
    emailSubject: row.message.subject,
    emailFrom: row.message.fromAddress,
    emailReceivedAt: row.message.receivedAt ? row.message.receivedAt.toISOString() : null,
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-6 pb-5 lg:px-7">
        <div>
          <Link
            href="/contas-a-pagar"
            className="text-xs font-medium text-text-tertiary transition hover:text-text-primary"
          >
            ← Voltar para contas a pagar
          </Link>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-text-primary">
            {row.payable.supplierName ?? "Lançamento"}
          </h2>
          <p className="text-sm text-text-secondary">
            {row.payable.description ?? row.attachment.filename}
          </p>
        </div>
      </div>

      <PayableDetail data={data} catalogs={catalogs} />
    </>
  );
}
