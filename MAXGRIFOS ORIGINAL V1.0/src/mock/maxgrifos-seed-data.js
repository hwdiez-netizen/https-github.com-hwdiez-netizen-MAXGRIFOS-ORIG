/**
 * REGLA OFICIAL — MOCK DATA / SEED DATA
 *
 * La precarga de datos mock NO significa meter registros por meter.
 *
 * Antes de crear cualquier dato demo, el agente debe auditar el módulo correspondiente y entender:
 * 1. Qué campos son ingresados manualmente por el usuario.
 * 2. Qué campos son generados automáticamente por motores internos.
 * 3. Qué validaciones exige el formulario.
 * 4. Qué contratos usan los handlers.
 * 5. Qué campos espera la lista, detalle y edición.
 * 6. Qué datos son derivados y NO deben hardcodearse.
 *
 * La data mock debe respetar la lógica real del módulo.
 *
 * Si un módulo genera campos automáticamente, el seed debe alimentar solo los campos base necesarios y dejar que el motor oficial genere los campos derivados.
 *
 * Prohibido hardcodear campos derivados cuando existe motor oficial.
 *
 * En Productos:
 * - El seed debe proveer descripción/nombre + código proveedor.
 * - El motor oficial debe generar SKU/Code128, categoría, subcategoría y atributo.
 *
 * En Clientes:
 * - El seed debe respetar el contrato real de creación/edición.
 * - El QR/código único del cliente debe generarse según la lógica oficial del módulo.
 * - Prohibido crear clientes sin id válido o que fallen al abrir edición.
 *
 * Objetivo de la precarga:
 * Validar que el módulo funciona, no maquillar datos.
 *
 * ---
 * Reglas Técnicas Deterministas:
 * - No Date.now
 * - No Math.random
 * - No crypto.randomUUID
 * - No UUID dinámico
 * - identity_key determinística
 * - idempotency_key determinística
 * - Compatible con campos actuales de ProductForm y ClienteForm
 */

export const SEED_DATA = {
  products: [
    {
      nombre: "GRIFO CROMADO HIGH LAVAMANOS",
      ref_proveedor: "P-GC-001",
      uom: "UND",
      status: "ACTIVE",
      costo: 45000,
      costo_vigente_real: 45000,
      price_reference: 89900,
      stock_disponible_real: 50,
      cantidad: 50
    },
    {
      nombre: "GRIFO NEGRO MATE LUXURY",
      ref_proveedor: "P-GN-002",
      uom: "UND",
      status: "ACTIVE",
      costo: 110000,
      costo_vigente_real: 110000,
      price_reference: 225000,
      stock_disponible_real: 20,
      cantidad: 20
    },
    {
      nombre: "DUCHA CUADRADA LLUVIA 20X20",
      ref_proveedor: "P-DQ-001",
      uom: "PAR",
      status: "ACTIVE",
      costo: 32000,
      costo_vigente_real: 32000,
      price_reference: 65000,
      stock_disponible_real: 100,
      cantidad: 100
    },
    {
      nombre: "VALVULA REGULACION 1/2 CAJA X20",
      ref_proveedor: "P-V-001",
      uom: "CAJ",
      status: "ACTIVE",
      costo: 8500,
      costo_vigente_real: 8500,
      price_reference: 18000,
      stock_disponible_real: 80,
      cantidad: 80
    },
    {
      nombre: "TUBO ABASTO FLEXIBLE 40CM",
      ref_proveedor: "P-T-001",
      uom: "MTR",
      status: "ACTIVE",
      costo: 5000,
      costo_vigente_real: 5000,
      price_reference: 12000,
      stock_disponible_real: 120,
      cantidad: 120
    },
    {
      nombre: "KIT GRIFO MAS DUCHA PROMO",
      ref_proveedor: "P-K-001",
      uom: "KIT",
      status: "ACTIVE",
      costo: 70000,
      costo_vigente_real: 70000,
      price_reference: 145000,
      stock_disponible_real: 15,
      cantidad: 15
    },
    {
      nombre: "LLAVE JARDIN BOLSA X10",
      ref_proveedor: "P-LJ-001",
      uom: "BLS",
      status: "ACTIVE",
      costo: 15000,
      costo_vigente_real: 15000,
      price_reference: 28000,
      stock_disponible_real: 35,
      cantidad: 35
    },
    {
      nombre: "SIFON PLASTICO FLEXIBLE",
      ref_proveedor: "P-S-001",
      uom: "UND",
      status: "ACTIVE",
      costo: 4000,
      costo_vigente_real: 4000,
      price_reference: 9500,
      stock_disponible_real: 200,
      cantidad: 200
    },
    {
      nombre: "VALVULA SEGURIDAD CALENTADOR",
      ref_proveedor: "P-VS-001",
      uom: "UND",
      status: "ACTIVE",
      costo: 25000,
      costo_vigente_real: 25000,
      price_reference: 48000,
      stock_disponible_real: 45,
      cantidad: 45
    },
    {
      nombre: "MEZCLADOR COCINA PROFESIONAL",
      ref_proveedor: "P-M-001",
      uom: "UND",
      status: "ACTIVE",
      costo: 180000,
      costo_vigente_real: 180000,
      price_reference: 360000,
      stock_disponible_real: 12,
      cantidad: 12
    }
  ],

  clients: [
    {
      razon_social: "FERRETERIA EL TORNILLO S.A.S",
      nit: "900123456-1",
      cedula: "",
      document_type: "NIT",
      document_number: "900123456-1",
      celular: "3001234567",
      correo: "compras@eltornillo.com",
      direccion: "CALLE 45 # 12-34 LOCAL 101",
      barrio: "BOSTON",
      ciudad: "MEDELLIN",
      fecha_cumpleanos: "2000-01-15",
      contacto: "CARLOS PEREZ",
      forma_pago: "CONTADO_B2B",
      cupo_credito: 0,
      compra_minima: 50000,
      horarios_atencion: "L-V 8AM-6PM",
      status: "ACTIVE"
    },
    {
      razon_social: "DISTRIBUIDORA NORTE S.A.S",
      nit: "900777666-8",
      cedula: "",
      document_type: "NIT",
      document_number: "900777666-8",
      celular: "3102223344",
      correo: "compras@distribuidoranorte.com",
      direccion: "CARRERA 80 # 45-20 BODEGA 3",
      barrio: "CENTRO",
      ciudad: "BUCARAMANGA",
      fecha_cumpleanos: "1995-05-20",
      contacto: "ROBERTO ALVAREZ",
      forma_pago: "CREDITO_15",
      cupo_credito: 3000000,
      compra_minima: 200000,
      horarios_atencion: "L-V 7AM-5PM",
      status: "ACTIVE"
    },
    {
      razon_social: "CONSTRUCTORA ABC S.A.S",
      nit: "800999888-2",
      cedula: "",
      document_type: "NIT",
      document_number: "800999888-2",
      celular: "3203334455",
      correo: "compras@constructoraabc.com",
      direccion: "AVENIDA 72 # 48-15 OFICINA 402",
      barrio: "ALTO PRADO",
      ciudad: "BARRANQUILLA",
      fecha_cumpleanos: "2010-08-30",
      contacto: "ANA MARTINEZ",
      forma_pago: "CREDITO_30",
      cupo_credito: 10000000,
      compra_minima: 500000,
      horarios_atencion: "L-V 8AM-4PM",
      status: "ACTIVE"
    },
    {
      razon_social: "PROYECTOS DEL SUR LTDA",
      nit: "901222444-9",
      cedula: "",
      document_type: "NIT",
      document_number: "901222444-9",
      celular: "3114445566",
      correo: "proyectos@delsur.com",
      direccion: "DIAGONAL 18 # 22-10 TORRE B",
      barrio: "PINARES",
      ciudad: "PEREIRA",
      fecha_cumpleanos: "1980-12-10",
      contacto: "JUANA ARIAS",
      forma_pago: "CREDITO_45",
      cupo_credito: 8000000,
      compra_minima: 400000,
      horarios_atencion: "L-V 9AM-4PM",
      status: "ACTIVE"
    },
    {
      razon_social: "JOSE INSTAGRAM",
      nit: "",
      cedula: "11223344",
      document_type: "CC",
      document_number: "11223344",
      celular: "3154445555",
      correo: "jose.insta@example.com",
      direccion: "CALLE 100 # 15-20 APTO 501",
      barrio: "CHICO",
      ciudad: "BOGOTA",
      fecha_cumpleanos: "1992-03-25",
      contacto: "JOSE RAMIREZ",
      forma_pago: "B2C_REDES",
      cupo_credito: 0,
      compra_minima: 10000,
      horarios_atencion: "24/7",
      status: "ACTIVE"
    },
    {
      razon_social: "MARIA CONSTRUCTORA INDEPENDIENTE",
      nit: "",
      cedula: "52000111",
      document_type: "CC",
      document_number: "52000111",
      celular: "3109876543",
      correo: "maria.constructora@example.com",
      direccion: "TRANSVERSAL 93 # 12-44 CASA 2",
      barrio: "MODELIA",
      ciudad: "BOGOTA",
      fecha_cumpleanos: "1985-07-07",
      contacto: "MARIA GARCIA",
      forma_pago: "B2C_CONSTRUCTOR",
      cupo_credito: 500000,
      compra_minima: 50000,
      horarios_atencion: "L-S 8AM-2PM",
      status: "ACTIVE"
    },
    {
      razon_social: "LUIS PLOMERIA Y MAS",
      nit: "",
      cedula: "88997766",
      document_type: "CC",
      document_number: "88997766",
      celular: "3189990000",
      correo: "luisplomero@example.com",
      direccion: "AVENIDA 3 # 10-15 LOCAL 2",
      barrio: "CENTRO",
      ciudad: "CARTAGENA",
      fecha_cumpleanos: "1990-11-11",
      contacto: "LUIS GOMEZ",
      forma_pago: "CONTADO_B2B",
      cupo_credito: 0,
      compra_minima: 50000,
      horarios_atencion: "L-D 7AM-7PM",
      status: "ACTIVE"
    },
    {
      razon_social: "FERRETERIA EL CLAVO",
      nit: "900111222-1",
      cedula: "",
      document_type: "NIT",
      document_number: "900111222-1",
      celular: "6041234567",
      correo: "ventas@elclavo.com",
      direccion: "CARRERA 45 # 20-10 LOCAL 5",
      barrio: "SAN JUAN",
      ciudad: "MEDELLIN",
      fecha_cumpleanos: "1988-02-14",
      contacto: "CARLOS HENAO",
      forma_pago: "CREDITO_15",
      cupo_credito: 2000000,
      compra_minima: 100000,
      horarios_atencion: "L-V 7AM-5PM",
      status: "ACTIVE"
    },
    {
      razon_social: "DISTRIBUIDORA SUR",
      nit: "900333222-1",
      cedula: "",
      document_type: "NIT",
      document_number: "900333222-1",
      celular: "6045558888",
      correo: "sur@distri.com",
      direccion: "CARRERA 80 # 30-40 BODEGA 1",
      barrio: "BELEN",
      ciudad: "MEDELLIN",
      fecha_cumpleanos: "1994-09-05",
      contacto: "MARTA LOPEZ",
      forma_pago: "CREDITO_30",
      cupo_credito: 5000000,
      compra_minima: 300000,
      horarios_atencion: "L-V 8AM-5PM",
      status: "ACTIVE"
    },
    {
      razon_social: "OBRAS PREMIUM S.A.S",
      nit: "901888777-6",
      cedula: "",
      document_type: "NIT",
      document_number: "901888777-6",
      celular: "3167778899",
      correo: "compras@obraspremium.com",
      direccion: "AUTOPISTA 10 # 55-60 OFICINA 301",
      barrio: "INDUSTRIAL",
      ciudad: "CALI",
      fecha_cumpleanos: "1982-10-31",
      contacto: "ANDRES TORO",
      forma_pago: "CREDITO_45",
      cupo_credito: 12000000,
      compra_minima: 600000,
      horarios_atencion: "L-V 8AM-6PM",
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
        { product_identity_key: "PROD_GRIFO_CROMADO_HIGH_001", price: 89900 },
        { product_identity_key: "PROD_GRIFO_NEGRO_MATE_002", price: 225000 },
        { product_identity_key: "PROD_DUCHA_CUADRADA_LLUVIA_003", price: 65000 },
        { product_identity_key: "PROD_VALVULA_REGULACION_004", price: 18000 },
        { product_identity_key: "PROD_TUBO_ABASTO_FLEXIBLE_005", price: 12000 },
        { product_identity_key: "PROD_KIT_GRIFO_DUCHA_006", price: 145000 },
        { product_identity_key: "PROD_LLAVE_JARDIN_BOLSA_007", price: 28000 },
        { product_identity_key: "PROD_SIFON_PLASTICO_FLEXIBLE_008", price: 9500 },
        { product_identity_key: "PROD_VALVULA_SEGURIDAD_009", price: 48000 },
        { product_identity_key: "PROD_MEZCLADOR_COCINA_PRO_010", price: 360000 }
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
        { product_identity_key: "PROD_GRIFO_CROMADO_HIGH_001", price: 75000 },
        { product_identity_key: "PROD_GRIFO_NEGRO_MATE_002", price: 180000 },
        { product_identity_key: "PROD_DUCHA_CUADRADA_LLUVIA_003", price: 54000 },
        { product_identity_key: "PROD_VALVULA_REGULACION_004", price: 15000 },
        { product_identity_key: "PROD_TUBO_ABASTO_FLEXIBLE_005", price: 10000 }
      ]
    }
  ],

  costs: [
    {
      identity_key: "COST_GRIFO_CROMADO_HIGH_001",
      product_identity_key: "PROD_GRIFO_CROMADO_HIGH_001",
      cost: 45000,
      currency: "COP",
      source: "Importación Directa",
      idempotency_key: "COST_P1_V1"
    },
    {
      identity_key: "COST_GRIFO_NEGRO_MATE_002",
      product_identity_key: "PROD_GRIFO_NEGRO_MATE_002",
      cost: 110000,
      currency: "COP",
      source: "Proveedor Nacional",
      idempotency_key: "COST_P2_V1"
    }
  ],

  initialStock: [
    {
      identity_key: "STOCK_GRIFO_CROMADO_HIGH_001_WH1",
      product_identity_key: "PROD_GRIFO_CROMADO_HIGH_001",
      warehouse_identity_key: "WH_BOG_CEDIS",
      quantity: 50,
      idempotency_key: "STOCK_P1_WH1_V1"
    },
    {
      identity_key: "STOCK_GRIFO_NEGRO_MATE_002_WH1",
      product_identity_key: "PROD_GRIFO_NEGRO_MATE_002",
      warehouse_identity_key: "WH_BOG_CEDIS",
      quantity: 20,
      idempotency_key: "STOCK_P2_WH1_V1"
    },
    {
      identity_key: "STOCK_DUCHA_CUADRADA_LLUVIA_003_WH1",
      product_identity_key: "PROD_DUCHA_CUADRADA_LLUVIA_003",
      warehouse_identity_key: "WH_BOG_CEDIS",
      quantity: 100,
      idempotency_key: "STOCK_P3_WH1_V1"
    }
  ],

  kardexInitial: [
    {
      id: "k-001",
      identity_key: "K_001_INITIAL_GRIFO_CROMADO_HIGH",
      idempotency_key: "K_SEED_001_V1",
      product_identity_key: "PROD_GRIFO_CROMADO_HIGH_001",
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
      client_identity_key: "CLI_FERRETERIA_EL_TORNILLO_001",
      items: [
        {
          product_identity_key: "PROD_GRIFO_CROMADO_HIGH_001",
          quantity: 1,
          price: 89900
        }
      ],
      status: "PENDING"
    }
  ]
};