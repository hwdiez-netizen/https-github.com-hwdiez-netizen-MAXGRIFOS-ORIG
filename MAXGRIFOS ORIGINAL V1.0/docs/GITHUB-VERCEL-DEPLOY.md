# GITHUB-VERCEL-DEPLOY

**Regla principal:**
DEPLOY != TERMINADO
DEPLOY = BUILD PASS + LOCALHOST PASS + LAN SMARTPHONE PASS + DATOS PRESERVADOS + RUNTIME VALIDADO

## PRE-DEPLOY:
- [ ] npm install ejecutado localmente por usuario.
- [ ] npm run build PASS.
- [ ] dist/index.html generado.
- [ ] dist/sw.js generado si aplica.
- [ ] public/maxgrifos-flags.js revisado si existe.
- [ ] DB fail-safe activo.
- [ ] Prohibido deleteDB automático en catch de initDB.
- [ ] Precarga smartphone preservada.
- [ ] IndexedDB no se limpia.
- [ ] Outbox no se limpia.
- [ ] Home Premium validado en localhost.
- [ ] Home Premium validado en smartphone LAN.

## LOCALHOST:
- [ ] npm run dev -- --host 0.0.0.0
- [ ] validar http://localhost:5173/
- [ ] validar URL LAN mostrada por Vite
- [ ] confirmar visual premium:
  - Bienvenido, VDEV
  - Todo tu negocio, en un solo lugar.
  - KPIs
  - Módulos principales
  - bottom nav
  - botón +

## SMARTPHONE:
- [ ] abrir URL Network de Vite en celular.
- [ ] confirmar que la app carga.
- [ ] confirmar que la precarga/test data funciona.
- [ ] confirmar que no se pierden datos al refrescar.
- [ ] confirmar que IndexedDB persiste.

## GITHUB:
- [ ] verificar git remote -v.
- [ ] repo esperado:
  https://github.com/hwdiez-netizen/MAXGRIFOS-ORIG
- [ ] git add .
- [ ] git commit -m "deploy: maxgrifos validated release"
- [ ] git push origin main

## VERCEL:
- [ ] esperar deployment automático si Vercel está conectado.
- [ ] abrir URL producción.
- [ ] validar HTTP 200.
- [ ] validar manifest.
- [ ] validar sw.js si aplica.
- [ ] validar build_id si existe.
- [ ] validar runtime visual premium.
- [ ] validar datos preservados.

## POST-DEPLOY:
- [ ] abrir producción.
- [ ] validar IndexedDB no wipe.
- [ ] validar outbox no wipe.
- [ ] validar RBAC si aplica.
- [ ] validar observabilidad window.__MAXGRIFOS_OBSERVABILITY__ si aplica.
- [ ] validar runtime guard getViolations si aplica.
- [ ] validar export CSV/JSON si aplica.

## FORMATO DE SALIDA OBLIGATORIO:
HECHO | NO_HECHO
BUILD: PASS | FAIL
LOCALHOST: PASS | FAIL
LAN_SMARTPHONE: PASS | FAIL
PRELOAD_SMARTPHONE_TEST_DATA: PASS | FAIL | PRESERVADO
PERSISTENCIA_DATOS: PASS | FAIL
DEPLOY: PASS | FAIL | NO_EJECUTADO
RUNTIME_UI: PASS | FAIL
EVIDENCIA:
- commit:
- build_id:
- URL localhost:
- URL LAN:
- URL producción:
- endpoints verificados:
- conteos antes:
- conteos después:
- IndexedDB:
- outbox:
- errores consola:

## CRITERIO FINAL:
Solo PASS_FINAL_RUNTIME si:
1. build pasa.
2. localhost pasa.
3. smartphone LAN pasa.
4. Home Premium se ve correcto.
5. precarga/test data funciona o está preservada.
6. no se pierde IndexedDB.
7. no se pierde outbox.
8. producción Vercel valida runtime real.
