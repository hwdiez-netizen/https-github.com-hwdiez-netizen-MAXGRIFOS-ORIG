export const SKU_V5_REGEX = /^[A-Z]{2}-[A-Z]{2}-[A-Z0-9]{2}-[A-Z0-9]{4}$/;

export function isSkuV5Format(code) {
  return SKU_V5_REGEX.test(code);
}

const CAT_DICT = [
  { cod: 'DE', desc: 'Desagues', palabras: ['desague', 'sifon', 'canas', 'canastilla'] },
  { cod: 'DU', desc: 'Duchas', palabras: ['ducha', 'regadera', 'teleducha'] },
  { cod: 'CO', desc: 'Cocina', palabras: ['cocina', 'lavaplatos', 'mezclador lavaplatos'] },
  { cod: 'BA', desc: 'Bano', palabras: ['bano', 'lavamanos', 'sanitario', 'orinal'] },
  { cod: 'RE', desc: 'Rejillas', palabras: ['rejilla'] },
  { cod: 'AC', desc: 'Accesorios', palabras: ['silicona', 'lubricante', 'cinta metrica', 'cinta aislante'] },
  { cod: 'SW', desc: 'Electricos', palabras: ['toma', 'interrup', 'switch', 'placa'] },
  { cod: 'JA', desc: 'Jardin', palabras: ['jardin', 'pistola'] },
  { cod: 'RP', desc: 'Repuestos', palabras: ['limpiador', 'valvula', 'cartucho', 'repuesto'] },
  { cod: 'IL', desc: 'Iluminacion', palabras: ['plafon', 'panel', 'bombillo', 'cinta led'] },
];

const SUB_DICT = [
  { cod: 'LM', desc: 'Lavamanos', palabras: ['desague lavamanos', 'sif lavamanos'] },
  { cod: 'LV', desc: 'Lavaplatos', palabras: ['desague lavaplatos', 'sif lavaplatos'] },
  { cod: 'IN', desc: 'Interruptores', palabras: ['toma interruptor', 'interruptor'] },
  { cod: 'ME', desc: 'Meson', palabras: ['meson'] },
  { cod: 'PA', desc: 'Pared', palabras: ['pared'] },
  { cod: 'MC', desc: 'Monocontrol', palabras: ['monocontrol'] },
  { cod: 'AL', desc: 'Alta', palabras: ['alta', 'alto'] },
  { cod: 'BJ', desc: 'Baja', palabras: ['baja', 'bajo'] },
  { cod: 'EX', desc: 'Extraible', palabras: ['extraible'] },
  { cod: 'LL', desc: 'Lluvia', palabras: ['lluvia'] },
  { cod: 'AO', desc: 'Antiolores', palabras: ['antiolor', 'antiolores'] },
  { cod: 'TO', desc: 'Tomas', palabras: ['toma'] },
  { cod: 'MG', desc: 'Manguera', palabras: ['manguera'] },
  { cod: 'CA', desc: 'Cartucho', palabras: ['cartucho'] },
  { cod: 'BO', desc: 'Bombillo', palabras: ['bombillo'] },
  { cod: 'CI', desc: 'Cinta', palabras: ['cinta'] },
  { cod: 'LU', desc: 'Lubricante', palabras: ['lubricante'] },
  { cod: 'GR', desc: 'Griferia', palabras: ['grifo', 'llave lavamanos', 'llave lavaplatos', 'mezclador'] },
  { cod: 'GE', desc: 'General', palabras: ['sencillo', 'sencilla', 'multiusos', 'general'] },
  { cod: 'ST', desc: 'Estandar', palabras: ['estandar', 'invisible', 'habana', 'cuadrada', 'redonda'] },
];

const ATR_DICT = [
  { cod: 'CR', desc: 'Cromado', palabras: ['cromo', 'cromada', 'cromado'] },
  { cod: 'PL', desc: 'Plastico', palabras: ['plastico', 'plastica', 'abs'] },
  { cod: 'PO', desc: 'Policarbonato', palabras: ['policarbonato'] },
  { cod: 'NE', desc: 'Negro', palabras: ['negro', 'negra', 'black', 'mate'] },
  { cod: 'BL', desc: 'Blanco', palabras: ['blanco', 'blanca'] },
  { cod: 'SA', desc: 'Satinado', palabras: ['satinado', 'satinada'] },
  { cod: 'AI', desc: 'Acero Inox', palabras: ['acero', 'inox', '304'] },
  { cod: 'DO', desc: 'Dorado', palabras: ['dorado', 'oro', 'gold'] },
  { cod: 'BR', desc: 'Bronce', palabras: ['bronce', 'cobre'] },
  { cod: 'LD', desc: 'LED', palabras: ['led'] },
  { cod: '12', desc: '1/2 Pulgada', palabras: ['1/2'] },
  { cod: '04', desc: '4 Pulgadas', palabras: ['4"', '4 pulgadas'] },
  { cod: '06', desc: '6 Pulgadas', palabras: ['6"', '6 pulgadas'] },
  { cod: '08', desc: '8 Pulgadas', palabras: ['8"', '8 pulgadas'] },
];

function normalize(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function matchDict(name, dict) {
  for (const entry of dict) {
    for (const kw of entry.palabras) {
      if (name.includes(kw)) return entry;
    }
  }
  return null;
}

export function generateSKU(nombre, refProveedor) {
  const name = normalize(nombre);

  const cat = matchDict(name, CAT_DICT) || { cod: 'VA', desc: 'Varios' };

  let sub;
  if (cat.cod === 'VA') {
    sub = { cod: 'XX', desc: 'Generico' };
  } else {
    sub = matchDict(name, SUB_DICT);
    if (!sub) {
      if (cat.cod === 'DU' || cat.cod === 'RE') sub = { cod: 'ST', desc: 'Estandar' };
      else if (cat.cod === 'DE') sub = { cod: 'GE', desc: 'General' };
      else sub = { cod: 'XX', desc: 'Generico' };
    }
  }

  const atr = matchDict(name, ATR_DICT) || { cod: 'GE', desc: 'General' };

  const ref = String(refProveedor).trim();
  const id4 = ref.length > 4 ? ref.slice(-4) : ref.padStart(4, '0');

  return {
    sku: `${cat.cod}-${sub.cod}-${atr.cod}-${id4}`,
    cat: cat.desc,
    sub: sub.desc,
    atr: atr.desc,
  };
}

export function decodeSkuV5(sku) {
  if (!isSkuV5Format(sku)) return null;
  const [catCod, subCod, atrCod, id4] = sku.split('-');
  const cat = CAT_DICT.find((e) => e.cod === catCod);
  const sub = SUB_DICT.find((e) => e.cod === subCod);
  const atr = ATR_DICT.find((e) => e.cod === atrCod);
  return {
    cat: cat?.desc ?? catCod,
    sub: sub?.desc ?? subCod,
    atr: atr?.desc ?? atrCod,
    id4,
  };
}
