# F11K_B_SMARTPHONE_PRELOAD_LOCAL_ONLY_PREPARE_REPORT

## 1. Activación Inteligente
La precarga en smartphone ha sido configurada aplicando una validación segura en `seed-flags.js`. Se han habilitado dos métodos exclusivos para facilitar las pruebas LAN sin comprometer entornos de producción, especialmente si se despliega en Vercel.

**Métodos de Activación:**
- **URL Query Param:** Añadiendo `?seed=smartphone` o `?preload=smartphone` a la URL (útil para pasar la URL por código QR o mensaje).
- **LocalStorage:** Ejecutando `localStorage.setItem('MAXGRIFOS_ENABLE_SMARTPHONE_SEED', 'true')` en la consola. Esto permite una activación persistente sólo en el dispositivo de prueba.

## 2. Desactivación
- Se elimina automáticamente si se quita el query param de la URL.
- O mediante el devtools: `localStorage.removeItem('MAXGRIFOS_ENABLE_SMARTPHONE_SEED')`.

## 3. Protección de Producción
En un ambiente estándar de producción (Vercel, GitHub Pages) sin estos flags locales explícitos, la variable `SEED_CONFIG.ENABLED` se comportará estrictamente como `false`. Ningún dato semillla será insertado de forma automática o inadvertida. Esto bloquea inyecciones de prueba sobre bases de datos de clientes reales o durante demostraciones comerciales que usen la URL limpia.

## 4. Archivos Modificados e Impacto
**Tocados:**
- `src/core/seed/seed-flags.js`: Añadido el parser de URL y LocalStorage.
- `src/core/seed/seed-loader.js`: Se implementaron por documentacion estricta las reglas de validación en tiempo estático (restricciones de no llamar a `clearTestData`, no limpiar `IndexedDB`, y prohibir truncar `sync_queue`).

**Preservados Intactos (Requisitos):**
- `src/mock/maxgrifos-seed-data.js`
- `src/db/local-db.js`
- Todos los módulos de negocio en `src/modules` y core en `src/core` (a excepción del target).
- Archivos de bootstrapping (`src/main.js`, `index.html`).

## 5. Riesgos Restantes
- Si en alguna fase posterior la rutina de inyección se construye sin respetar las llaves de idempotencia (`idempotency_key`, `identity_key`), los registros de SeedData se duplicarían. Las instrucciones explícitas en `seed-loader.js` advierten no cometer este fallo.
- Es posible que el motor IDB rechace grandes escrituras síncronas en dispositivos de gama baja sin chunking, el `LocalStoreKernel` debe prever paginar el commit.

## 6. Siguientes Pasos (Pendiente Local)
- **Local:** Verificar Build (`npm run build`).
- Navegar a `localhost:5173/?seed=smartphone` a confirmar si responde habilitando log traces de la semilla.
- Compartir en Smartphone Local Area Network y validar `SEED_CONFIG.ENABLED = true` desde consola remota.
