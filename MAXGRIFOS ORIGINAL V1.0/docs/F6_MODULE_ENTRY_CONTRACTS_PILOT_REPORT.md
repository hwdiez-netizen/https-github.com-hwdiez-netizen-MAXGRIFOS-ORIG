# F6 Module Entry Contracts Pilot Report

## 1. Objective
Establish the official architecture for module entry in MAXGRIFOS V2. Ensure that UI components do not call logic or Store directly, but through a deterministic contract-handler pattern.

## 2. Patterns Implemented
- **Contract**: `module-entry-contract.js`. Validates the intent (moduleId, route, idempotency).
- **Handler**: `module-entry-handler.js`. Executes the contract and emits events to the system bus.
- **Joint**: `module-entry-end-joint.js`. Provides the public API for the UI.
- **Pilot View**: `module-entry-pilot.js`. A visual demonstrator of the pattern.

## 3. Integration
- The Pilot is integrated into `route-registry.js` under `/module-entry-pilot`.
- `module-placeholder.js` renders the pilot if the route matches.
- **Production Implementation**: The `Compras` and `Proveedores` modules have been hardened using the F6 pattern.
- **Store Hardening**: Direct access to `compra-store.js` and `proveedor-store.js` is now blocked via `__fromHandler` guards.
- **UI Decoupling**: `CompraForm` has been completely decoupled from Business Logic, using Handlers as orchestrated entry points.

## 4. Verification
- **Test**: `module-entry.test.js`.
- **Status**: Structural validation PASS.
- **Audit**: All writes in Compras/Proveedores now use deterministic `idempotency_key` and follow the Contract-Handler flow.

## 5. Next Steps
Prepare F7: Core Product Migration using the established pilot pattern.
