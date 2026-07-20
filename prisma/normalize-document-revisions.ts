import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const revisions = await prisma.document.findMany({
    where: {
      revisionNo: { gt: 1 },
      rootDocumentId: { not: null }
    },
    select: {
      id: true,
      documentNo: true,
      revisionNo: true,
      rootDocumentId: true
    }
  });

  const rootIds = [
    ...new Set(revisions.flatMap((revision) => (revision.rootDocumentId ? [revision.rootDocumentId] : [])))
  ];
  const roots = await prisma.document.findMany({
    where: { id: { in: rootIds } },
    select: { id: true, documentNo: true }
  });
  const rootNumbers = new Map(roots.map((root) => [root.id, root.documentNo]));
  const updates = revisions.flatMap((revision) => {
    const rootDocumentNo = revision.rootDocumentId ? rootNumbers.get(revision.rootDocumentId) : undefined;
    if (!rootDocumentNo || rootDocumentNo === revision.documentNo) return [];

    return [
      prisma.document.update({
        where: { id: revision.id },
        data: { documentNo: rootDocumentNo }
      })
    ];
  });

  if (updates.length > 0) await prisma.$transaction(updates);
  console.log(`Normalized ${updates.length} document revision number${updates.length === 1 ? "" : "s"}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
