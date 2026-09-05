export type FilterType = "search" | "multi" | "enum" | "range";

export type FilterDef = {
  key: string;
  label: string;
  type: FilterType;
  /** Facet key used to load options (states, categories, brand, or a tenant dim). */
  facet?: string;
  options?: { v: string; label: string }[];
  /** When any of these change, this filter is cleared and its options reload. */
  dependsOn?: string[];
  /** Shown, but not usable until this parent has a value. */
  requires?: string;
  placeholder?: string;
  minKey?: string;
  maxKey?: string;
};

export type ColumnDef = {
  key: string;
  label: string;
  kind: "text" | "int" | "money" | "money2" | "bool";
  sort?: string;
  /** Rendered in the UI but not present on the API row. */
  virtual?: boolean;
};

export type ObjectKind = "explore" | "query" | "records" | "listings" | "licenses" | "geo" | "tenant" | "tla";

export type ObjectSpec = {
  id: string;
  name: string;
  family: "pub" | "pos" | "erp" | "crm" | "acc" | "tla";
  tagline: string;
  gated: boolean;
  kind: ObjectKind;
  exploreDim?: "retailers" | "brands" | "products" | "categories" | "subcategories" | "states";
  groupBy?: string[];
  metrics?: string[];
  tenantField?: "enterpriseResourcePlanning" | "accounting" | "customerRelationshipManagement" | "pointOfSale";
  tenantGroupBy?: string;
  filters: FilterDef[];
  columns: ColumnDef[];
  searchKey?: string;
  searchPlaceholder?: string;
  /** Explore/query sort key when the page loads (may not be a visible column). */
  defaultSort?: string;
  defaultDir?: "asc" | "desc";
  /** Public Menus records tab (menu-item page). */
  recordsTab?: string;
  /** Applied on first paint and when the object changes. Clearable. */
  defaultValues?: Record<string, string | string[]>;
  /** `publicMenus { meta }` key shown on the catalog card. */
  statKey?: string;
  statLabel?: string;
};

const PUB_FILTERS: FilterDef[] = [
  { key: "state", label: "State", type: "multi", facet: "states" },
  { key: "category", label: "Category", type: "multi", facet: "categories", dependsOn: ["state"] },
  {
    key: "subcategory",
    label: "Subcategory",
    type: "multi",
    facet: "subcategories",
    dependsOn: ["state", "category"],
    requires: "category",
  },
  { key: "genetics", label: "Genetics", type: "multi", facet: "genetics", dependsOn: ["state", "category"] },
  { key: "brand", label: "Brand", type: "multi", facet: "brand", dependsOn: ["state", "category"] },
  {
    key: "stock",
    label: "Stock",
    type: "enum",
    options: [
      { v: "", label: "Any" },
      { v: "in", label: "In stock" },
      { v: "low", label: "Low stock" },
      { v: "out", label: "Out of stock" },
      { v: "winback", label: "Win-back" },
    ],
  },
  { key: "price", label: "Price", type: "range", minKey: "price_min", maxKey: "price_max", placeholder: "0" },
];

const LISTING_TYPES = [
  "Dispensary",
  "Delivery",
  "Doctor",
  "Smoke Shop",
  "CBD / Hemp",
  "Grow Store",
  "Cultivation / Mfg",
];

function pub(
  id: string,
  name: string,
  tagline: string,
  extra: Partial<ObjectSpec> & Pick<ObjectSpec, "kind" | "columns">,
): ObjectSpec {
  return {
    id,
    name,
    family: "pub",
    tagline,
    gated: false,
    filters: PUB_FILTERS,
    searchKey: extra.searchKey ?? "q",
    ...extra,
  };
}

function tenant(
  id: string,
  name: string,
  family: "pos" | "erp" | "crm" | "acc",
  tagline: string,
  field: ObjectSpec["tenantField"],
  groupBy?: string,
): ObjectSpec {
  return {
    id,
    name,
    family,
    tagline,
    gated: true,
    kind: "tenant",
    tenantField: field,
    tenantGroupBy: groupBy,
    filters: [],
    columns: [],
    searchKey: "q",
  };
}

export const OBJECTS: ObjectSpec[] = [
  pub("retailer", "Retailer", "Canonical dispensary across every menu source. Menu is this grain.", {
    kind: "explore",
    exploreDim: "retailers",
    statKey: "stores",
    statLabel: "stores",
    searchKey: "q",
    defaultSort: "skus",
    columns: [
      { key: "name", label: "Name", kind: "text", sort: "name" },
      { key: "city", label: "City", kind: "text" },
      { key: "sub_state", label: "State", kind: "text" },
      { key: "skus", label: "SKUs", kind: "int", sort: "skus" },
      { key: "in_stock", label: "In stock", kind: "int", sort: "in_stock" },
      { key: "avg_price", label: "Avg price", kind: "money2", sort: "avg_price" },
      { key: "revenue", label: "Est. daily $", kind: "money", sort: "revenue" },
    ],
  }),
  pub("menu", "Menu", "Alias of Retailer — one store menu on the latest snapshot.", {
    kind: "explore",
    exploreDim: "retailers",
    searchKey: "q",
    searchPlaceholder: "Store name…",
    defaultSort: "skus",
    columns: [
      { key: "name", label: "Store", kind: "text", sort: "name" },
      { key: "city", label: "City", kind: "text" },
      { key: "sub_state", label: "State", kind: "text" },
      { key: "skus", label: "Items", kind: "int", sort: "skus" },
      { key: "in_stock", label: "In stock", kind: "int", sort: "in_stock" },
      { key: "listings", label: "Lines", kind: "int", sort: "listings" },
      { key: "avg_price", label: "Avg price", kind: "money2", sort: "avg_price" },
      { key: "revenue", label: "Est. daily $", kind: "money", sort: "revenue" },
    ],
  }),
  pub("menu-item", "Menu Item", "One priced line on one store menu — the atomic fact. Offer is this grain.", {
    kind: "records",
    statKey: "rows",
    statLabel: "lines",
    searchKey: "q",
    searchPlaceholder: "Retailer, item, or brand…",
    recordsTab: "menu_item",
    defaultSort: "imputed_daily_revenue",
    columns: [
      { key: "listing_name", label: "Store", kind: "text", sort: "listing_name" },
      { key: "item_name", label: "Item", kind: "text", sort: "item_name" },
      { key: "brand_name", label: "Brand", kind: "text", sort: "brand_name" },
      { key: "category", label: "Category", kind: "text", sort: "category" },
      { key: "subcategory", label: "Subcategory", kind: "text", sort: "subcategory" },
      { key: "genetics", label: "Genetics", kind: "text", sort: "genetics" },
      { key: "state", label: "State", kind: "text", sort: "state" },
      { key: "price", label: "Price", kind: "money2", sort: "price" },
      { key: "is_in_stock", label: "In stock", kind: "bool", sort: "is_in_stock" },
      { key: "thc_value", label: "THC", kind: "int", sort: "thc_value" },
      { key: "imputed_daily_revenue", label: "Est. daily $", kind: "money", sort: "imputed_daily_revenue" },
    ],
  }),
  pub("brand", "Brand", "Canonical brand rolled up across stores and spellings.", {
    kind: "explore",
    exploreDim: "brands",
    statKey: "brands",
    statLabel: "brands",
    searchKey: "q",
    defaultSort: "revenue",
    filters: PUB_FILTERS.filter((f) => f.key !== "stock" && f.key !== "price" && f.key !== "brand"),
    columns: [
      { key: "name", label: "Brand", kind: "text", sort: "name" },
      { key: "aliases", label: "Aliases", kind: "text", virtual: true },
      { key: "skus", label: "Products", kind: "int", sort: "skus" },
      { key: "listings", label: "Menu items", kind: "int", sort: "listings" },
    ],
  }),
  pub("product", "Product", "Brand + name-core, collapsed across stores.", {
    kind: "explore",
    exploreDim: "products",
    statKey: "products",
    statLabel: "products",
    searchKey: "item",
    defaultValues: { state: ["CA"] },
    defaultSort: "revenue",
    columns: [
      { key: "name", label: "Product", kind: "text", sort: "name" },
      { key: "brand", label: "Brand", kind: "text" },
      { key: "cat", label: "Category", kind: "text" },
      { key: "stores", label: "Retailers", kind: "int", sort: "stores" },
      { key: "in_stock", label: "In stock", kind: "int", sort: "in_stock" },
      { key: "avg_price", label: "Avg price", kind: "money2", sort: "avg_price" },
      { key: "revenue", label: "Est. daily $", kind: "money", sort: "revenue" },
    ],
  }),
  pub("offer", "Offer", "Alias of Menu Item — one priced menu line on one day.", {
    kind: "records",
    searchKey: "q",
    searchPlaceholder: "Retailer, item, or brand…",
    recordsTab: "menu_item",
    defaultSort: "imputed_daily_revenue",
    columns: [
      { key: "listing_name", label: "Store", kind: "text", sort: "listing_name" },
      { key: "item_name", label: "Item", kind: "text", sort: "item_name" },
      { key: "brand_name", label: "Brand", kind: "text", sort: "brand_name" },
      { key: "category", label: "Category", kind: "text", sort: "category" },
      { key: "subcategory", label: "Subcategory", kind: "text", sort: "subcategory" },
      { key: "genetics", label: "Genetics", kind: "text", sort: "genetics" },
      { key: "state", label: "State", kind: "text", sort: "state" },
      { key: "price", label: "Price", kind: "money2", sort: "price" },
      { key: "is_in_stock", label: "In stock", kind: "bool", sort: "is_in_stock" },
      { key: "thc_value", label: "THC", kind: "int", sort: "thc_value" },
      { key: "imputed_daily_revenue", label: "Est. daily $", kind: "money", sort: "imputed_daily_revenue" },
    ],
  }),
  pub("category", "Category", "Canonical top-level product category.", {
    kind: "explore",
    exploreDim: "categories",
    statKey: "categories",
    statLabel: "categories",
    searchKey: "q",
    defaultSort: "skus",
    columns: [
      { key: "name", label: "Category", kind: "text", sort: "name" },
      { key: "skus", label: "SKUs", kind: "int", sort: "skus" },
      { key: "brands", label: "Brands", kind: "int", sort: "brands" },
      { key: "stores", label: "Retailers", kind: "int", sort: "stores" },
      { key: "revenue", label: "Est. daily $", kind: "money", sort: "revenue" },
    ],
  }),
  pub("subcategory", "Subcategory", "Second-tier category inside a parent.", {
    kind: "explore",
    exploreDim: "subcategories",
    statKey: "subcategories",
    statLabel: "subcategories",
    searchKey: "q",
    defaultSort: "skus",
    columns: [
      { key: "name", label: "Subcategory", kind: "text", sort: "name" },
      { key: "skus", label: "SKUs", kind: "int", sort: "skus" },
      { key: "brands", label: "Brands", kind: "int", sort: "brands" },
      { key: "stores", label: "Retailers", kind: "int", sort: "stores" },
      { key: "revenue", label: "Est. daily $", kind: "money", sort: "revenue" },
    ],
  }),
  pub("genetics", "Genetics", "Indica, sativa, or hybrid.", {
    kind: "query",
    statKey: "genetics",
    statLabel: "classes",
    groupBy: ["genetics"],
    metrics: ["products", "avg_thc", "avg_price", "stores"],
    columns: [
      { key: "genetics", label: "Genetics", kind: "text" },
      { key: "products", label: "SKUs", kind: "int", sort: "products" },
      { key: "stores", label: "Retailers", kind: "int", sort: "stores" },
      { key: "avg_thc", label: "Avg THC", kind: "int" },
      { key: "avg_price", label: "Avg price", kind: "money2", sort: "avg_price" },
    ],
  }),
  pub("state", "Market (State)", "U.S. state market roll-up.", {
    kind: "explore",
    exploreDim: "states",
    statKey: "states",
    statLabel: "states",
    searchKey: "q",
    defaultSort: "stores",
    columns: [
      { key: "name", label: "State", kind: "text", sort: "name" },
      { key: "stores", label: "Retailers", kind: "int", sort: "stores" },
      { key: "skus", label: "SKUs", kind: "int", sort: "skus" },
      { key: "brands", label: "Brands", kind: "int", sort: "brands" },
      { key: "revenue", label: "Est. daily $", kind: "money", sort: "revenue" },
    ],
  }),
  {
    id: "geo",
    name: "Geo Enrichment",
    family: "pub",
    tagline: "Point or ZIP → Census, demographics, and nearby dispensaries.",
    gated: false,
    kind: "geo",
    statKey: "zips",
    statLabel: "ZIPs",
    searchKey: "zip",
    filters: [
      { key: "zip", label: "ZIP", type: "search", placeholder: "90210" },
      { key: "radius_mi", label: "Radius (mi)", type: "search", placeholder: "10" },
    ],
    columns: [
      { key: "label", label: "Field", kind: "text" },
      { key: "value", label: "Value", kind: "text" },
    ],
  },
  {
    id: "listing",
    name: "Listing",
    family: "pub",
    tagline: "Directory of cannabis-adjacent storefronts, with or without a menu.",
    gated: false,
    kind: "listings",
    statKey: "listings",
    statLabel: "listings",
    searchKey: "q",
    defaultSort: "products",
    filters: [
      { key: "state", label: "State", type: "multi", facet: "states" },
      {
        key: "types",
        label: "Type",
        type: "multi",
        options: LISTING_TYPES.map((t) => ({ v: t, label: t })),
      },
      {
        key: "has_menu",
        label: "Menu",
        type: "enum",
        options: [
          { v: "", label: "Any" },
          { v: "1", label: "Has menu" },
          { v: "0", label: "No menu" },
        ],
      },
    ],
    columns: [
      { key: "name", label: "Name", kind: "text" },
      { key: "listing_type", label: "Type", kind: "text" },
      { key: "city", label: "City", kind: "text" },
      { key: "state", label: "State", kind: "text" },
      { key: "products", label: "SKUs", kind: "int" },
      { key: "brands", label: "Brands", kind: "int" },
      { key: "revenue", label: "Est. daily $", kind: "money" },
    ],
  },
  {
    id: "license",
    name: "License",
    family: "pub",
    tagline: "State-issued cannabis license — number, type, status, and premise. GraphQL: licenses.",
    gated: false,
    kind: "licenses",
    statKey: "licenses",
    statLabel: "licenses",
    searchKey: "q",
    searchPlaceholder: "License #, DBA, or city…",
    defaultSort: "state_code",
    defaultDir: "asc",
    filters: [
      { key: "state", label: "State", type: "multi", facet: "states" },
      { key: "type", label: "Type", type: "multi", facet: "types" },
      { key: "status", label: "Status", type: "multi", facet: "statuses" },
    ],
    columns: [
      { key: "license_number", label: "License #", kind: "text", sort: "license_number" },
      { key: "business_dba_name", label: "DBA", kind: "text", sort: "business_dba_name" },
      { key: "license_type", label: "Type", kind: "text", sort: "license_type" },
      { key: "license_status", label: "Status", kind: "text", sort: "license_status" },
      { key: "premise_city", label: "City", kind: "text", sort: "premise_city" },
      { key: "state_code", label: "State", kind: "text", sort: "state_code" },
      { key: "premise_zip_code", label: "ZIP", kind: "text", sort: "premise_zip_code" },
    ],
  },
  tenant("pos-order", "Ticket", "pos", "Completed retail transaction.", "pointOfSale", "date"),
  tenant("pos-line", "Retail Transaction Item", "pos", "One sold line in a ticket.", "pointOfSale"),
  tenant("pos-customer", "Customer", "pos", "Retail customer profile.", "pointOfSale", "customer"),
  tenant("pos-budtender", "Budtender", "pos", "Sales associate performance.", "pointOfSale"),
  tenant("pos-location", "Register / Location", "pos", "Selling location inside a store.", "pointOfSale", "store"),
  tenant("pos-discount", "Discount", "pos", "Promotion applied at the register.", "pointOfSale"),
  tenant("erp-sku", "SKU / Item", "erp", "Item master in the ERP.", "enterpriseResourcePlanning", "sku"),
  tenant("erp-lot", "Inventory Lot", "erp", "Tracked inventory lot.", "enterpriseResourcePlanning"),
  tenant("erp-po", "Purchase Order", "erp", "Inbound purchase order.", "enterpriseResourcePlanning", "orders"),
  tenant("erp-batch", "Production Batch", "erp", "Manufacturing run.", "enterpriseResourcePlanning"),
  tenant("erp-vendor", "Vendor", "erp", "Supplier the operator buys from.", "enterpriseResourcePlanning"),
  tenant("erp-forecast", "Forecast", "erp", "Demand / production forecast.", "enterpriseResourcePlanning"),
  tenant("erp-order-line", "Order Item", "erp", "One line on a wholesale order.", "enterpriseResourcePlanning"),
  tenant("crm-account", "Wholesale Account", "crm", "Buyer the operator sells into.", "customerRelationshipManagement", "account"),
  tenant("crm-order", "Wholesale Order", "crm", "Wholesale sales order.", "customerRelationshipManagement"),
  tenant("crm-rep", "Sales Rep", "crm", "Wholesale representative.", "customerRelationshipManagement", "owner"),
  tenant("crm-contact", "Contact", "crm", "Person at a wholesale account.", "customerRelationshipManagement"),
  tenant("crm-deal", "Deal", "crm", "Open pipeline opportunity.", "customerRelationshipManagement"),
  tenant("crm-shipment", "Shipment", "crm", "Wholesale fulfillment.", "customerRelationshipManagement"),
  tenant("crm-task", "Task", "crm", "CRM activity against an account.", "customerRelationshipManagement"),
  tenant("acc-invoice", "Invoice", "acc", "Billing document.", "accounting", "invoices"),
  tenant("acc-line", "Invoice Line Item", "acc", "One billed line.", "accounting"),
  tenant("acc-payment", "Payment", "acc", "Payment received.", "accounting"),
  tenant("acc-ledger", "Ledger Account", "acc", "Chart-of-accounts node.", "accounting"),
  tenant("acc-credit", "Credit Memo", "acc", "Credit against a balance.", "accounting"),
  tenant("acc-tax", "Tax", "acc", "Tax component on billed lines.", "accounting"),
  {
    id: "tla-account",
    name: "Top-Level Account",
    family: "tla",
    tagline: "Active only when a CRM, ACC, or ERP connection is live.",
    gated: true,
    kind: "tla",
    searchKey: "search",
    filters: [
      { key: "state_codes", label: "State", type: "multi", facet: "states" },
      {
        key: "pillars_must_have",
        label: "Connection",
        type: "multi",
        options: [
          { v: "crm", label: "CRM" },
          { v: "acc", label: "ACC" },
          { v: "erp", label: "ERP" },
        ],
      },
    ],
    columns: [
      { key: "account_name", label: "Account", kind: "text" },
      { key: "market_name", label: "Market", kind: "text" },
      { key: "address_state_code", label: "State", kind: "text" },
      { key: "instance_count", label: "Instances", kind: "int" },
      { key: "sum_total_revenue", label: "ERP revenue", kind: "money" },
      { key: "sum_balance_due", label: "Balance due", kind: "money" },
      { key: "sum_total_tasks", label: "CRM tasks", kind: "int" },
    ],
  },
];

/** Catalog section order. TLA is last — it is the spine, not the front door. */
export const CATALOG_FAMILIES: {
  id: ObjectSpec["family"];
  code: string;
  name: string;
  tagline: string;
  color: string;
}[] = [
  { id: "pub", code: "PUB", name: "Public Menus", tagline: "Every cannabis menu line-item, canonicalized. GraphQL: publicMenus.", color: "#42AA9C" },
  { id: "pos", code: "POS", name: "Point of Sale", tagline: "Retail ticket & line-item data. GraphQL: pointOfSale.", color: "#FF5D57" },
  { id: "erp", code: "ERP", name: "Enterprise Resource Planning", tagline: "Wholesale supply, orders & inventory. GraphQL: enterpriseResourcePlanning.", color: "#27665e" },
  { id: "crm", code: "CRM", name: "Customer Relationship Management", tagline: "Wholesale relationships & tasks. GraphQL: customerRelationshipManagement.", color: "#4a5a67" },
  { id: "acc", code: "ACC", name: "Accounting", tagline: "Invoice & line-item financial data. GraphQL: accounting.", color: "#d60700" },
  { id: "tla", code: "TLA", name: "Top-Level Account", tagline: "Identity spine for CRM, ACC, and ERP — active only when one of those connections is live.", color: "#626A7D" },
];

/** Aliases of another object — not shown as their own catalog cards. */
const CATALOG_ALIASES = new Set(["menu", "offer"]);

export function catalogObjects(): ObjectSpec[] {
  return OBJECTS.filter((o) => !CATALOG_ALIASES.has(o.id));
}

const BY_ID = new Map(OBJECTS.map((o) => [o.id, o]));

export function getObject(id: string): ObjectSpec | undefined {
  if (id === "licenses") return BY_ID.get("license");
  if (id === "menu" || id === "menus") return BY_ID.get("retailer");
  if (id === "offer" || id === "offers") return BY_ID.get("menu-item");
  return BY_ID.get(id);
}

export function formatCell(kind: ColumnDef["kind"], value: unknown): string {
  if (value == null || value === "") return "—";
  const n = Number(value);
  if (kind === "bool") {
    if (value === true || value === 1 || value === "1") return "Yes";
    if (value === false || value === 0 || value === "0") return "No";
    return "—";
  }
  if (kind === "int") return Number.isFinite(n) ? Math.round(n).toLocaleString("en-US") : String(value);
  if (kind === "money") return Number.isFinite(n) ? `$${Math.round(n).toLocaleString("en-US")}` : String(value);
  if (kind === "money2") {
    return Number.isFinite(n) && n > 0 ? `$${n.toFixed(2)}` : "—";
  }
  return String(value);
}
