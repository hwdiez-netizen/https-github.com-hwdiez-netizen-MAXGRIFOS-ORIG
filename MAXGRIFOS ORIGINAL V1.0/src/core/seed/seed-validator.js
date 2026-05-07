/**
 * Seed Validator - Validador de integridad de datos semilla
 *
 * PROTOCOLO MOCK DATA:
 * Ver REGLA OFICIAL en src/mock/maxgrifos-seed-data.js
 */

export class SeedValidator {
  static validate(data) {
    const findings = [];
    const entities = Object.keys(data);
    
    // Auxiliar para recolectar IDs (simple para validacion de relaciones)
    const identityMap = {
      products: new Set(),
      clients: new Set(),
      suppliers: new Set()
    };

    entities.forEach(entityName => {
      const items = data[entityName];
      if (!Array.isArray(items)) {
        findings.push(`Entity ${entityName} is not an array`);
        return;
      }

      const identities = new Set();
      const idempotencies = new Set();

      items.forEach((item, index) => {
        // En validacion basica no necesitamos reconstruir el motor oficial, 
        // solo validar que si vienen definidos no esten rotos.
        const isDeterministicCompliant = ['products', 'clients'].includes(entityName);
        
        // Si el seed no trae identity_key (nuevo protocolo v1.0), confiamos en el motor
        // Pero para validar relaciones (ej: initialStock -> products), el stock si traera una llave.
        // Por ahora, si skipamos ids en products, no podemos validar relaciones de forma trivial 
        // sin duplicar el motor aqui. 
        if (item.identity_key) {
          if (identityMap[entityName]) identityMap[entityName].add(item.identity_key);
          if (identities.has(item.identity_key)) findings.push(`${entityName} has duplicate identity_key: ${item.identity_key}`);
          identities.add(item.identity_key);
        }

        if (!item.identity_key && !isDeterministicCompliant) findings.push(`${entityName}[${index}] missing identity_key`);
        if (!item.idempotency_key && !isDeterministicCompliant) findings.push(`${entityName}[${index}] missing idempotency_key`);

        if (item.idempotency_key) {
          if (idempotencies.has(item.idempotency_key)) findings.push(`${entityName} has duplicate idempotency_key: ${item.idempotency_key}`);
          idempotencies.add(item.idempotency_key);
        }
      });
    });

    return {
      valid: findings.length === 0,
      findings
    };
  }
}
