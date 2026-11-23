import Link from "next/link";
import { notFound } from "next/navigation";
import { PayableDetail, type PayableDetailData } from "@/components/app/payable-detail";
import { PageHeader, StatusBadge } from "@/components/app/ui";
import { LAUNCH_FAILED, plainReason } from "@/lib/boletos";
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
  const { payable, document, attachment, message } = row;

  const data: PayableDetailData = {
    id: payable.id,
    documentId: document.id,
    attachmentId: attachment.id,
    status: payable.status,
    auto: payable.origin === "auto",
    supplierId: payable.supplierId,
    categoryId: payable.categoryId,
    financialAccountId: payable.financialAccountId,
    costCenterId: payable.costCenterId,
    description: payable.description,
    value: payable.value,
    dueDate: payable.dueDate,
    competenceDate: payable.competenceDate,
    postedAt: payable.postedAt ? payable.postedAt.toISOString() : null,
    note:
      payable.status === "FAILED"
        ? plainReason(payable.error, LAUNCH_FAILED)
        : document.needsAttention
          ? plainReason(document.attentionReason)
          : null,
    emailSubject: message.subject,
    emailFrom: message.fromAddress,
    emailReceivedAt: (message.receivedAt ?? message.createdAt).toISOString(),
  };

  return (
    <>
      <div className="px-5 pt-6 lg:px-7">
        <Link href="/" className="text-sm text-text-tertiary transition hover:text-text-primary">
          ← Boletos
        </Link>
      </div>
      <PageHeader
        title={payable.supplierName ?? "Boleto sem fornecedor"}
        actions={<StatusBadge status={payable.status} />}
      />
      <PayableDetail
        key={`${payable.status}-${payable.updatedAt.getTime()}`}
        data={data}
        catalogs={catalogs}
      />
    </>
  );
}
