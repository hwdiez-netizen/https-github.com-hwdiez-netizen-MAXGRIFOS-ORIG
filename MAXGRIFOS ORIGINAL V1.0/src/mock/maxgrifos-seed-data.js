/**
 * Seed Data Determinista V2
 */

export const SEED_DATA = {
  products: [
    {
      id: "prod-001",
      identity_key: "PROD_GRIFO_01",
      idempotency_key: "SEED_P_001_V1",
      sku: "GRIFO-CH-01",
      name: "Grifo Cromado High",
      category: "Grifería",
      subcategory: "Lavamanos",
      attributes: { color: "Cromo", material: "Latón", pressure: "High" },
      unit: "UND",
      status: "ACTIVE",
      code128: "MAXGRIFOS001",
      qr_payload: "MG:PROD:001",
      cost: 45000,
      price_reference: 89900
    },
    {
      id: "prod-002",
      identity_key: "PROD_GRIFO_02",
      idempotency_key: "SEED_P_002_V1",
      sku: "GRIFO-NM-02",
      name: "Grifo Negro Mate Luxury",
      category: "Grifería",
      subcategory: "Lavamanos",
      attributes: { color: "Negro", material: "Acero", pressure: "Medium" },
      unit: "UND",
      status: "ACTIVE",
      code128: "MAXGRIFOS002",
      qr_payload: "MG:PROD:002",
      cost: 110000,
      price_reference: 225000
    },
    {
      id: "prod-003",
      identity_key: "PROD_DUCHA_01",
      idempotency_key: "SEED_P_003_V1",
      sku: "DUCHA-SQ-01",
      name: "Ducha Cuadrada Lluvia",
      category: "Grifería",
      subcategory: "Duchas",
      attributes: { size: "20x20", material: "Acero" },
      unit: "UND",
      status: "ACTIVE",
      code128: "MAXGRIFOS003",
      qr_payload: "MG:PROD:003",
      cost: 32000,
      price_reference: 65000
    },
    {
      id: "prod-004",
      identity_key: "PROD_VALVULA_01",
      idempotency_key: "SEED_P_004_V1",
      sku: "VALV-12-01",
      name: "Válvula 1/2 Regulación",
      category: "Accesorios",
      subcategory: "Válvulas",
      attributes: { size: "1/2" },
      unit: "UND",
      status: "ACTIVE",
      code128: "MAXGRIFOS004",
      qr_payload: "MG:PROD:004",
      cost: 8500,
      price_reference: 18000
    },
    {
      id: "prod-005",
      identity_key: "PROD_TUBO_01",
      idempotency_key: "SEED_P_005_V1",
      sku: "TUBO-AB-01",
      name: "Tubo Abasto Flexible 40cm",
      category: "Accesorios",
      subcategory: "Abastos",
      attributes: { length: "40cm" },
      unit: "UND",
      status: "ACTIVE",
      code128: "MAXGRIFOS005",
      qr_payload: "MG:PROD:005",
      cost: 5000,
      price_reference: 12000
    },
    {
      id: "prod-006",
      identity_key: "PROD_GRIFO_KIT_01",
      idempotency_key: "SEED_P_006_V1",
      sku: "KIT-GRIFO-DUCHA",
      name: "Combo Grifo + Ducha Promo",
      category: "Combos",
      subcategory: "Promos",
      attributes: { contents: "prod-001, prod-003" },
      unit: "KIT",
      status: "ACTIVE",
      code128: "MAXGRIFOS006",
      qr_payload: "MG:PROD:006",
      cost: 70000,
      price_reference: 145000
    },
    {
      id: "prod-007",
      identity_key: "PROD_LLAVE_JARDIN_01",
      idempotency_key: "SEED_P_007_V1",
      sku: "LLAVE-JAR-01",
      name: "Llave Jardín 1/2 Bronce",
      category: "Accesorios",
      subcategory: "Llaves",
      attributes: {},
      unit: "UND",
      status: "ACTIVE",
      code128: "MAXGRIFOS007",
      qr_payload: "MG:PROD:007",
      cost: 15000,
      price_reference: 28000
    },
    {
      id: "prod-008",
      identity_key: "PROD_SIFON_01",
      idempotency_key: "SEED_P_008_V1",
      sku: "SIFON-P-01",
      name: "Sifón Plástico Flexible",
      category: "Accesorios",
      subcategory: "Desagües",
      attributes: {},
      unit: "UND",
      status: "ACTIVE",
      code128: "MAXGRIFOS008",
      qr_payload: "MG:PROD:008",
      cost: 4000,
      price_reference: 9500
    },
    {
      id: "prod-009",
      identity_key: "PROD_VALVULA_SEG_01",
      idempotency_key: "SEED_P_009_V1",
      sku: "VALV-SEG-01",
      name: "Válvula Seguridad Calentador",
      category: "Accesorios",
      subcategory: "Válvulas",
      attributes: {},
      unit: "UND",
      status: "ACTIVE",
      code128: "MAXGRIFOS009",
      qr_payload: "MG:PROD:009",
      cost: 25000,
      price_reference: 48000
    },
    {
      id: "prod-010",
      identity_key: "PROD_MEZCLADOR_01",
      idempotency_key: "SEED_P_010_V1",
      sku: "MEZCL-KIT-01",
      name: "Mezclador Cocina Profesional",
      category: "Grifería",
      subcategory: "Cocina",
      attributes: { pressure: "High" },
      unit: "UND",
      status: "ACTIVE",
      code128: "MAXGRIFOS010",
      qr_payload: "MG:PROD:010",
      cost: 180000,
      price_reference: 360000
    }
  ],
  clients: [
    {
      id: "cli-001",
      identity_key: "CLI_JUAN_PEREZ",
      idempotency_key: "SEED_C_001_V1",
      name: "Juan Pérez",
      document_type: "CC",
      document_number: "10203040",
      city: "Bogotá",
      phone: "3001234567",
      email: "juan.perez@example.com",
      status: "ACTIVE"
    },
    {
      id: "cli-002",
      identity_key: "CLI_FERRETERIA_EL_CLAVO",
      idempotency_key: "SEED_C_002_V1",
      name: "Ferretería El Clavo",
      document_type: "NIT",
      document_number: "900111222-1",
      city: "Medellín",
      phone: "6041234567",
      email: "ventas@elclavo.com",
      status: "ACTIVE"
    },
    {
      id: "cli-003",
      identity_key: "CLI_MARIA_GARCIA",
      idempotency_key: "SEED_C_003_V1",
      name: "María García",
      document_type: "CC",
      document_number: "52000111",
      city: "Cali",
      phone: "3109876543",
      email: "mgarcia@example.com",
      status: "ACTIVE"
    },
    {
      id: "cli-004",
      identity_key: "CLI_CONSTRUCTORA_ABC",
      idempotency_key: "SEED_C_004_V1",
      name: "Constructora ABC SAS",
      document_type: "NIT",
      document_number: "800999888-2",
      city: "Barranquilla",
      phone: "6054445566",
      email: "compras@constructoraabc.com",
      status: "ACTIVE"
    },
    {
      id: "cli-005",
      identity_key: "CLI_PEDRO_PABLO",
      idempotency_key: "SEED_C_005_V1",
      name: "Pedro Pablo",
      document_type: "CC",
      document_number: "79123456",
      city: "Bogotá",
      phone: "3201112233",
      email: "ppablo@example.com",
      status: "ACTIVE"
    }
  ],
  suppliers: [
    {
      id: "sup-001",
      identity_key: "SUP_GRIFOS_CHINA_PRO",
      idempotency_key: "SEED_S_001_V1",
      business_name: "Grifos China Pro Ltd",
      nit: "CN-12345678",
      city: "Guangzhou",
      contact: "Li Wei",
      phone: "+86123456789",
      payment_terms: "NET-30",
      status: "ACTIVE"
    },
    {
      id: "sup-002",
      identity_key: "SUP_TUBERIAS_LOCALES_SAS",
      idempotency_key: "SEED_S_002_V1",
      business_name: "Tuberías Locales SAS",
      nit: "830000111-9",
      city: "Bogotá",
      contact: "Andrés Pipe",
      phone: "6015556677",
      payment_terms: "CONTADO",
      status: "ACTIVE"
    },
    {
      id: "sup-003",
      identity_key: "SUP_ACCESORIOS_PREMIUM",
      idempotency_key: "SEED_S_003_V1",
      business_name: "Accesorios Premium Europe",
      nit: "EU-98765432",
      city: "Madrid",
      contact: "Elena Sanz",
      phone: "+34912345678",
      payment_terms: "NET-60",
      status: "ACTIVE"
    },
    {
      id: "sup-004",
      identity_key: "SUP_IMPORTACIONES_CALI",
      idempotency_key: "SEED_S_004_V1",
      business_name: "Importaciones Cali SAS",
      nit: "900555333-1",
      city: "Cali",
      contact: "Oscar Toro",
      phone: "6021112222",
      payment_terms: "NET-15",
      status: "ACTIVE"
    },
    {
      id: "sup-005",
      identity_key: "SUP_METALURGICA_NORTE",
      idempotency_key: "SEED_S_005_V1",
      business_name: "Metalúrgica del Norte",
      nit: "800222444-5",
      city: "Bucaramanga",
      contact: "Rosa Alba",
      phone: "6073334444",
      payment_terms: "NET-30",
      status: "ACTIVE"
    }
  ],
  priceLists: [
    {
      id: "pl-001",
      identity_key: "PL_NORMAL_PESO",
      idempotency_key: "SEED_PL_001_V1",
      name: "Lista General COP",
      status: "ACTIVE",
      currency: "COP",
      items: [
        { product_identity_key: "PROD_GRIFO_01", price: 89900 },
        { product_identity_key: "PROD_GRIFO_02", price: 225000 }
      ]
    },
    {
      id: "pl-002",
      identity_key: "PL_DISTRIBUIDOR",
      idempotency_key: "SEED_PL_002_V1",
      name: "Lista Mayorista",
      status: "ACTIVE",
      currency: "COP",
      items: [
        { product_identity_key: "PROD_GRIFO_01", price: 75000 },
        { product_identity_key: "PROD_GRIFO_02", price: 180000 }
      ]
    }
  ],
  costs: [
    { identity_key: "COST_GRIFO_01", product_identity_key: "PROD_GRIFO_01", cost: 45000, currency: "COP", source: "Importación Directa", idempotency_key: "COST_P1_V1" },
    { identity_key: "COST_GRIFO_02", product_identity_key: "PROD_GRIFO_02", cost: 110000, currency: "COP", source: "Proveedor Nacional", idempotency_key: "COST_P2_V1" }
  ],
  initialStock: [
    { identity_key: "STOCK_GRIFO_01_WH1", product_identity_key: "PROD_GRIFO_01", warehouse_identity_key: "WH_BOG_CEDIS", quantity: 50, idempotency_key: "STOCK_P1_WH1_V1" },
    { identity_key: "STOCK_GRIFO_02_WH1", product_identity_key: "PROD_GRIFO_02", warehouse_identity_key: "WH_BOG_CEDIS", quantity: 20, idempotency_key: "STOCK_P2_WH1_V1" },
    { identity_key: "STOCK_DUCHA_01_WH1", product_identity_key: "PROD_DUCHA_01", warehouse_identity_key: "WH_BOG_CEDIS", quantity: 100, idempotency_key: "STOCK_P3_WH1_V1" }
  ],
  kardexInitial: [
    {
      id: "k-001",
      identity_key: "K_001_INITIAL_P1",
      idempotency_key: "K_SEED_001_V1",
      product_identity_key: "PROD_GRIFO_01",
      type: "INITIAL_LOAD",
      quantity: 50,
      reference: "CARGA_INICIAL_V2",
      status: "POSTED"
    }
  ],
  commercialPolicies: [
    {
      id: "pol-001",
      identity_key: "POL_DESC_VOLUMEN",
      idempotency_key: "SEED_POL_001_V1",
      name: "Descuento por Volumen",
      type: "DISCOUNT",
      rules: { min_quantity: 12, discount_percent: 5 },
      status: "ACTIVE"
    }
  ],
  sampleOrders: [
    {
      id: "ord-001",
      identity_key: "ORD_SAMPLE_01",
      idempotency_key: "SEED_ORD_001_V1",
      client_identity_key: "CLI_JUAN_PEREZ",
      items: [
        { product_identity_key: "PROD_GRIFO_01", quantity: 1, price: 89900 }
      ],
      status: "PENDING"
    }
  ]
};
