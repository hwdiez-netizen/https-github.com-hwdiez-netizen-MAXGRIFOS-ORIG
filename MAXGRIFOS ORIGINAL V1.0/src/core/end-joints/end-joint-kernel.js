/**
 * End Joint Kernel - Validador de flujos constitucionales
 */
import { END_JOINT_REGISTRY } from './end-joint-registry.js';

export class EndJointKernel {
  validate(flowName) {
    const config = END_JOINT_REGISTRY.get(flowName);
    if (!config) return false;
    
    // Verifica que el flujo tenga los componentes obligatorios
    const required = ['intent', 'contract', 'handler', 'event'];
    return required.every(key => config[key] !== undefined);
  }
}

export const endJointKernel = new EndJointKernel();
export default endJointKernel;
