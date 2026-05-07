/**
 * Registro de End Joints - Mapeo de flujos constitucionales
 */

export const END_JOINT_REGISTRY = new Map();

/**
 * Ejemplo de registro:
 * END_JOINT_REGISTRY.set('crear_producto', {
 *   intent: 'create_product',
 *   contract: 'product_v2',
 *   handler: 'save_product',
 *   event: 'domain:product_created',
 *   store: 'products'
 * });
 */
