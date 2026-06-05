import { prisma } from "@/lib/db";
import CatalogClient, { type ProductView } from "./catalog-client";

export default async function CatalogPage() {
  const products = await prisma.product.findMany({
    include: {
      stockLevels: {
        include: {
          warehouse: true,
        },
      },
    },
    orderBy: {
      name: "asc",
    },
  });

  const initialProducts: ProductView[] = products.map((product) => ({
    id: product.id,
    name: product.name,
    sku: product.sku,
    description: product.description,
    price: product.price,
    imageUrl: product.imageUrl,
    stockLevels: product.stockLevels.map((stockLevel) => ({
      warehouseId: stockLevel.warehouseId,
      warehouseName: stockLevel.warehouse.name,
      location: stockLevel.warehouse.location,
      totalUnits: stockLevel.totalUnits,
      reservedUnits: stockLevel.reservedUnits,
      availableUnits: Math.max(0, stockLevel.totalUnits - stockLevel.reservedUnits),
    })),
  }));

  return <CatalogClient initialProducts={initialProducts} />;
}