/**
 * Kernel de Contratos - Validador de integridad V2
 */
import { ContractResult } from './contract-result.js';

export class ContractKernel {
  constructor() {
    this.contracts = new Map();
  }

  /**
   * Registrar un contrato
   */
  register(name, validationFn) {
    this.contracts.set(name, validationFn);
  }

  /**
   * Validar datos contra un contrato
   */
  async validate(contractName, data) {
    const validator = this.contracts.get(contractName);
    if (!validator) {
      return ContractResult.Fail('CONTRACT_NOT_FOUND', `Contract ${contractName} not found`);
    }

    try {
      return await validator(data);
    } catch (error) {
      return ContractResult.Fail('EXCEPTION', error.message);
    }
  }
}

export const contractKernel = new ContractKernel();
export default contractKernel;
