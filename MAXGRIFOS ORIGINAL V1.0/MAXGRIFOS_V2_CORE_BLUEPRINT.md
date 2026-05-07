# MAXGRIFOS V2 CORE BLUEPRINT

## Arquitectura Central
Este documento define los componentes vitales que deben existir antes de la implementación de módulos funcionales.

1. **App Shell**: Contenedor maestro con diseño Neon Flex Minimalista.
2. **Router**: Gestión de estados de vista y navegación controlada.
3. **NIS 2.0**: Capa de gestos invisible (Swipes, Taps) coordinada con el contexto.
4. **Event Bus**: Bus de comunicaciones asíncronas para desacoplar componentes.
5. **Contracts Kernel**: Validadores de integridad de datos y reglas de negocio.
6. **Handlers Kernel**: Ejecutores de lógica transaccional.
7. **End Joints Kernel**: Puntos de conexión final para efectos secundarios.
8. **Store Local**: IndexedDB optimizado para acceso local-first.
9. **Outbox**: Cola de mensajes pendientes de sincronización.
10. **Sync Kernel**: Motor de sincronización idempotente con el backend bridge.
11. **Seed Data Loader**: Cargador determinístico de datos maestros para desarrollo.
12. **Audit Ledger**: Registro inmutable de transacciones locales.
13. **Module Registry**: Inventario dinámico de módulos disponibles.
14. **Backend Bridge**: Interfaz de comunicación con Railway + PocketBase.

> **Sin este CORE, ningún módulo puede considerarse productivo.**
