# MAXGRIFOS V2 BACKEND BRIDGE STRATEGY

## Arquitectura de Sincronización
El backend (Railway + PocketBase) actúa como un espejo reflectivo de la autoridad local.

## Reglas de Bridge
1. **Frontend Authority**: La validación de negocio ocurre en los Contratos del frontend. El backend solo refuerza.
2. **Asynchronous Sync**: Los cambios se encolan en el Outbox y se sincronizan cuando hay conectividad.
3. **Idempotencia**: Todas las escrituras en el bridge deben soportar reintentos sin duplicar datos.
4. **Subordinación**: El backend no puede imponer cambios de estado que no hayan pasado por un Contrato.
