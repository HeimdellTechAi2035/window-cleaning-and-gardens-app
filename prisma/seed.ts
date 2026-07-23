import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("password123", 12);

  const org = await prisma.organization.create({
    data: {
      name: "Bright & Clean Window Co.",
      slug: "bright-and-clean",
      users: {
        create: [
          { name: "Jordan Smith", email: "admin@roundflow.dev", passwordHash, role: "ADMIN" },
          { name: "Alex Operative", email: "worker@roundflow.dev", passwordHash, role: "OPERATIVE" },
        ],
      },
    },
    include: { users: true },
  });

  const round = await prisma.round.create({
    data: {
      organizationId: org.id,
      name: "Preston North - Week 1",
      description: "Residential, 4-weekly",
      colorCode: "#6366f1",
    },
  });

  const customerData = [
    {
      firstName: "Emily",
      lastName: "Carter",
      email: "emily.carter@example.com",
      phone: "+447700900001",
      preferredPaymentMethod: "DIRECT_DEBIT" as const,
      address: { addressLine1: "12 Orchard Road", city: "Preston", postcode: "PR1 2AB", latitude: 53.7632, longitude: -2.7031 },
      hazards: [{ label: "Aggressive Dog", severity: "HIGH" as const }],
      accessNotes: "Key safe code 4821. Enter via side gate.",
    },
    {
      firstName: "Michael",
      lastName: "Nguyen",
      email: "michael.nguyen@example.com",
      phone: "+447700900002",
      preferredPaymentMethod: "CARD" as const,
      address: { addressLine1: "45 Maple Avenue", city: "Preston", postcode: "PR2 3CD", latitude: 53.77, longitude: -2.69 },
      hazards: [{ label: "Fragile Conservatory Glass", severity: "MEDIUM" as const }],
      accessNotes: "Ring doorbell before entering rear garden.",
    },
    {
      firstName: "Sarah",
      lastName: "Whitfield",
      email: "sarah.whitfield@example.com",
      phone: "+447700900003",
      preferredPaymentMethod: "CASH" as const,
      address: { addressLine1: "8 Willow Court", city: "Preston", postcode: "PR1 5EF", latitude: 53.758, longitude: -2.715 },
      hazards: [],
      accessNotes: null,
    },
  ];

  for (const c of customerData) {
    await prisma.customer.create({
      data: {
        organizationId: org.id,
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email,
        phone: c.phone,
        preferredPaymentMethod: c.preferredPaymentMethod,
        properties: {
          create: {
            addressLine1: c.address.addressLine1,
            city: c.address.city,
            postcode: c.address.postcode,
            latitude: c.address.latitude,
            longitude: c.address.longitude,
            accessNotes: c.accessNotes,
            hazards: { create: c.hazards },
            services: {
              create: {
                title: "Standard Window Clean",
                price: 25,
                defaultIntervalWeeks: 4,
              },
            },
          },
        },
      },
    });
  }

  const properties = await prisma.property.findMany({
    where: { customer: { organizationId: org.id } },
    include: { services: true },
  });

  const today = new Date();
  today.setHours(9, 0, 0, 0);

  for (let i = 0; i < properties.length; i++) {
    const property = properties[i];
    const service = property.services[0];
    await prisma.job.create({
      data: {
        organizationId: org.id,
        roundId: round.id,
        propertyId: property.id,
        serviceId: service.id,
        scheduledDate: today,
        sequenceOrder: i,
        priceCharged: service.price,
        intervalWeeksAtCreation: service.defaultIntervalWeeks,
      },
    });
  }

  console.log("Seed complete. Admin login: admin@roundflow.dev / password123");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
