# ERP CONSTITUTION V2 - CONCISE

## Principios Operativos
1. **Local-First Authority**: La UI y el Store Local (IndexedDB) son la autoridad inmediata. El backend es un servidor de persistencia subordinado.
2. **Architecture Hierarchy**: UI/UX > Frontend > Contracts > Handlers > End Joints > Event Bus > Store Local > Sync.
3. **Event-Driven**: Todo cambio de estado debe ser el resultado de un evento procesado por un Handler y validado por un Contrato.
4. **NIS 2.0 (Invisible)**: La navegación inteligente por gestos es una capa de ayuda, no un panel de control.
5. **Auditoría Total**: Cada transacción genera un registro en el Ledger.

## Reglas de Oro
- Sin contrato, no hay handler.
- Sin handler, no hay cambio de estado.
- Sin evento, no hay auditoría.
- La UI es Neon Flex Minimalista (Blanco/Azul Electrico).
