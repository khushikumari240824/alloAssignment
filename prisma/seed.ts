import "dotenv/config";
import { prisma } from "../src/lib/db";

async function main() {
  console.log("Cleaning up database...");
  await prisma.idempotencyRequest.deleteMany({});
  await prisma.reservation.deleteMany({});
  await prisma.stockLevel.deleteMany({});
  await prisma.warehouse.deleteMany({});
  await prisma.product.deleteMany({});

  console.log("Seeding warehouses...");
  const whEast = await prisma.warehouse.create({
    data: {
      name: "Warehouse East",
      location: "Bangalore, Karnataka",
    },
  });

  const whWest = await prisma.warehouse.create({
    data: {
      name: "Warehouse West",
      location: "Whitefield, Karnataka",
    },
  });

  const whCentral = await prisma.warehouse.create({
    data: {
      name: "Warehouse Central",
      location: "Bangalore, Karnataka",
    },
  });

  console.log("Seeding products...");
  const productsData = [
    {
      name: "Ergonomic Mechanical Keyboard",
      sku: "KBD-ERG-01",
      description: "Split layout mechanical keyboard with hot-swappable tactile switches and RGB backlighting.",
      price: 189.99,
      imageUrl: "https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&q=80&w=400",
    },
    {
      name: "Ultra-Wide Curved Monitor 34\"",
      sku: "MON-UW-34",
      description: "34-inch curved gaming and productivity monitor with 144Hz refresh rate and HDR400.",
      price: 449.99,
      imageUrl: "https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?auto=format&fit=crop&q=80&w=400",
    },
    {
      name: "Active Noise Cancelling Headphones",
      sku: "AUD-ANC-90",
      description: "Premium wireless over-ear headphones with hybrid active noise cancellation and 40h battery life.",
      price: 299.99,
      imageUrl: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&q=80&w=400",
    },
    {
      name: "Minimalist Leather Desk Pad",
      sku: "DESK-PAD-LTH",
      description: "Premium full-grain leather desk mat designed to protect your desk and improve mouse tracking.",
      price: 59.99,
      imageUrl: "https://images.unsplash.com/photo-1632292224971-0d45778bd364?auto=format&fit=crop&q=80&w=400",
    },
    {
      name: "Smart LED Ambient Lightbar",
      sku: "LIGHT-RGB-LED",
      description: "Wi-Fi enabled smart LED light bars that sync with your monitor audio and screen colors.",
      price: 79.99,
      imageUrl: "https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&q=80&w=400",
    },
  ];

  const products = [];
  for (const item of productsData) {
    const p = await prisma.product.create({ data: item });
    products.push(p);
  }

  console.log("Seeding stock levels...");
  // Let's seed different stock levels to make it interesting
  // Product 0 (Keyboard): 5 units in East, 2 in West, 0 in Central (Total 7)
  await prisma.stockLevel.create({
    data: { productId: products[0].id, warehouseId: whEast.id, totalUnits: 5 },
  });
  await prisma.stockLevel.create({
    data: { productId: products[0].id, warehouseId: whWest.id, totalUnits: 2 },
  });

  // Product 1 (Monitor): 1 unit in East, 0 in West, 1 in Central (Total 2) -- very scarce
  await prisma.stockLevel.create({
    data: { productId: products[1].id, warehouseId: whEast.id, totalUnits: 1 },
  });
  await prisma.stockLevel.create({
    data: { productId: products[1].id, warehouseId: whCentral.id, totalUnits: 1 },
  });

  // Product 2 (Headphones): 10 units in East, 10 in West, 10 in Central (Total 30) -- abundant
  await prisma.stockLevel.create({
    data: { productId: products[2].id, warehouseId: whEast.id, totalUnits: 10 },
  });
  await prisma.stockLevel.create({
    data: { productId: products[2].id, warehouseId: whWest.id, totalUnits: 10 },
  });
  await prisma.stockLevel.create({
    data: { productId: products[2].id, warehouseId: whCentral.id, totalUnits: 10 },
  });

  // Product 3 (Desk Pad): 0 units in East, 4 in West, 4 in Central (Total 8)
  await prisma.stockLevel.create({
    data: { productId: products[3].id, warehouseId: whWest.id, totalUnits: 4 },
  });
  await prisma.stockLevel.create({
    data: { productId: products[3].id, warehouseId: whCentral.id, totalUnits: 4 },
  });

  // Product 4 (Lightbar): 3 units in East, 3 in West, 0 in Central (Total 6)
  await prisma.stockLevel.create({
    data: { productId: products[4].id, warehouseId: whEast.id, totalUnits: 3 },
  });
  await prisma.stockLevel.create({
    data: { productId: products[4].id, warehouseId: whWest.id, totalUnits: 3 },
  });

  console.log("Seeding complete successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
