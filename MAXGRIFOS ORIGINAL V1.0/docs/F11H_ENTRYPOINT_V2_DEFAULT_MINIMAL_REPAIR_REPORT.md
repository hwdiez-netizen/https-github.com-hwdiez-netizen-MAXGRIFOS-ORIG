# F11H_ENTRYPOINT_V2_DEFAULT_MINIMAL_REPAIR_REPORT

Fase: F11H_ENTRYPOINT_V2_DEFAULT_MINIMAL_REPAIR

## Problema corregido
La aplicación requería query parameters para cargar la interfaz moderna (V2 AppShell) e iniciaba por defecto la aplicación legacy, lo cual resultaba en que la página principal montase componentes antiguos que ya no corresponden a la nueva arquitectura. Además el index.html base contenía marcas hardcodificadas de la UI legacy.

## Archivos tocados
- `MAXGRIFOS ORIGINAL V1.0/src/main.js`
- `MAXGRIFOS ORIGINAL V1.0/index.html`
- `MAXGRIFOS ORIGINAL V1.0/AUDIT_LEDGER.md`
- `MAXGRIFOS ORIGINAL V1.0/docs/F11H_ENTRYPOINT_V2_DEFAULT_MINIMAL_REPAIR_REPORT.md`

## Detalle de Correcciones
- **main.js V2 default**: Se eliminó la obligación de `?v=core-f1` o `?v=home-f4` y se quitó el fallback a `initApp()`. El `main.js` ahora invoca siempre a `appShell.init()` como comportamiento por defecto.
- **index.html limpio**: Se removió el shell hardcodeado (header, nav-bar estilo legacy, elementos textuales), reduciéndose el `body` a `<div id="app"></div>` junto a su import de módulos correspondiente.
- **src/app.js no tocado**: Intacto.
- **módulos no tocados**: Intactos. No se intervinieron las lógicas de negocio, almacenes, handlers, ni subcarpetas del núcleo u operaciones.
- **build pendiente local**: Sí. (No se hizo build).
- **deploy**: NO.

[RESULTADO]: PASS_ESTATICO.
