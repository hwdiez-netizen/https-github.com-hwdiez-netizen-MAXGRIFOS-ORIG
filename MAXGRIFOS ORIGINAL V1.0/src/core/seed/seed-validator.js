/**
 * Seed Validator - Validador de integridad de datos semilla
 */

export class SeedValidator {
  static validate(data) {
    const findings = [];
    const entities = Object.keys(data);
    
    entities.forEach(entityName => {
      const items = data[entityName];
      if (!Array.isArray(items)) {
        findings.push(`Entity ${entityName} is not an array`);
        return;
      }

      const identities = new Set();
      const idempotencies = new Set();

      items.forEach((item, index) => {
        // 1. Requerir identity_key e idempotency_key
        if (!item.identity_key) findings.push(`${entityName}[${index}] missing identity_key`);
        if (!item.idempotency_key) findings.push(`${entityName}[${index}] missing idempotency_key`);

        // 2. Validar duplicados
        if (item.identity_key) {
          if (identities.has(item.identity_key)) findings.push(`${entityName} has duplicate identity_key: ${item.identity_key}`);
          identities.add(item.identity_key);
        }
        if (item.idempotency_key) {
          if (idempotencies.has(item.idempotency_key)) findings.push(`${entityName} has duplicate idempotency_key: ${item.idempotency_key}`);
          idempotencies.add(item.idempotency_key);
        }
      });
    });

    // Validar relaciones básicas (ejemplo)
    if (data.initialStock && data.products) {
      const productKeys = new Set(data.products.map(p => p.identity_key));
      data.initialStock.forEach(stock => {
        if (!productKeys.has(stock.product_identity_key)) {
          findings.push(`Stock references non-existent product identity_key: ${stock.product_identity_key}`);
        }
      });
    }

    return {
      valid: findings.length === 0,
      findings
    };
  }
}
