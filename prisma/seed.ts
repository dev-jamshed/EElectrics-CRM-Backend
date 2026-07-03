import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const client = await prisma.client.upsert({
    where: { id: "seed-client" },
    update: {},
    create: {
      id: "seed-client",
      firstName: "Sample",
      lastName: "Client",
      email: "client@example.com",
      phone: "+44 7000 000000",
      notes: "Demo client for first run."
    }
  });

  const caseFile = await prisma.caseFile.upsert({
    where: { serialNo: 1000 },
    update: {},
    create: {
      serialNo: 1000,
      title: "Initial electrical work",
      clientId: client.id
    }
  });

  await prisma.document.upsert({
    where: { documentNo: "BKG-1000-001" },
    update: {},
    create: {
      type: "BOOKING",
      status: "CONFIRMED",
      documentNo: "BKG-1000-001",
      caseFileId: caseFile.id,
      clientId: client.id,
      jobTitle: "Consumer unit inspection",
      description: "Inspect and prepare quotation.",
      addressLine: "10 High Street, London",
      bookingDate: new Date(),
      subtotal: 0,
      total: 0
    }
  });
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  });

