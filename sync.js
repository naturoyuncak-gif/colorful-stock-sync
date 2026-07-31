const axios = require("axios");
const { XMLParser } = require("fast-xml-parser");
const { createClient } = require("@supabase/supabase-js");

const XML_URL =
  "https://e-convert.stockmount.com/xml/publish/96320/public";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  throw new Error("SUPABASE_URL bulunamadı.");
}

if (!SUPABASE_KEY) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY bulunamadı.");
}

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  cdataPropName: "cdata",
  parseTagValue: false,
  trimValues: true
});

async function downloadXML() {
  console.log("XML indiriliyor...");

  const response = await axios.get(XML_URL, {
    timeout: 60000
  });

  console.log("XML indirildi.");

  return response.data;
}

function parseProducts(xml) {
  console.log("XML parse ediliyor...");

  const json = parser.parse(xml);

  let products = json.Products?.Product;

  if (!products) {
    throw new Error("Product bulunamadı.");
  }

  if (!Array.isArray(products)) {
    products = [products];
  }

  console.log(`${products.length} ürün bulundu.`);

  return products;
}

function mapProduct(product) {

  const clean = (v) => {
    if (v === undefined) return null;
    if (v === null) return null;
    if (v === "") return null;

    if (typeof v === "object") {
      if (v.cdata) return String(v.cdata).trim();
      return JSON.stringify(v);
    }

    return String(v).trim();
  };

  return {

     supplier: "stockmount",

  sm_product_id: Number(product.SmProductId),

  product_code: clean(product.ProductCode),

  barcode: clean(product.Barcode),

  product_name: clean(product.ProductName),

  brand: clean(product.Brand),

  category: clean(product.Category),

  quantity: Number(product.Quantity || 0),

  purchase_price: Number(product.Price || 0),

  currency: clean(product.Currency),

  tax_rate: Number(product.TaxRate || 0),

  image1: clean(product.Image1),

  description: clean(product.Description)
};

  };
}
async function upsertProducts(products) {

  console.log("Supabase senkronizasyonu başlıyor...");

  let inserted = 0;
  let updated = 0;

  for (const product of products) {

    const row = mapProduct(product);

    const { data: existing, error: selectError } = await supabase
      .from("products")
      .select("id,quantity,purchase_price")
      .eq("product_code", row.product_code)
      .maybeSingle();

    if (selectError) {
      console.error(selectError);
      continue;
    }

    if (!existing) {

      const { error } = await supabase
        .from("products")
        .insert(row);

      if (error) {
        console.error("INSERT:", error.message);
      } else {
        inserted++;
      }

    } else {

      const { error } = await supabase
        .from("products")
        .update({
          quantity: row.quantity,
          purchase_price: row.purchase_price,
          currency: row.currency,
          tax_rate: row.tax_rate,
          image1: row.image1,
          description: row.description,
          product_name: row.product_name,
          barcode: row.barcode,
          category: row.category,
          brand: row.brand,
          updated_at: new Date()
        })
        .eq("id", existing.id);

      if (error) {
        console.error("UPDATE:", error.message);
      } else {
        updated++;
      }

    }

  }

  console.log("--------------------------------");
  console.log("Yeni ürün :", inserted);
  console.log("Güncellenen :", updated);
  console.log("--------------------------------");

}
async function main() {

  try {

    const xml = await downloadXML();

    const products = parseProducts(xml);

    await upsertProducts(products);

    console.log("İşlem tamamlandı.");

  } catch (err) {

    console.error(err);

    process.exit(1);

  }

}

main();
