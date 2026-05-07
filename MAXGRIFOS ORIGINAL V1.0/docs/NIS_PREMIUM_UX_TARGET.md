# NIS PREMIUM UX TARGET — MAXGRIFOS ERP V2

## Estado oficial

Este documento define la experiencia objetivo de navegación, interacción y estética premium para MAXGRIFOS ERP V2.

MAXGRIFOS ERP V2 debe evolucionar hacia una experiencia mobile-first real, limpia, moderna, táctil, amigable y con sensación premium tipo app nativa.

El objetivo NO es copiar arquitectura externa.

El objetivo NO es copiar lógica externa.

El objetivo NO es copiar persistencia externa.

El objetivo NO es copiar Legacy.

El objetivo es extraer principios de UX/NIS compatibles con la Constitución MAXGRIFOS ERP V2.

---

## Inspiración permitida

Se permite usar proyectos de muestra únicamente como referencia visual e interactiva para observar:

- interfaces limpias;
- pantallas sin ruido visual;
- botones grandes y tocables;
- jerarquía visual clara;
- tarjetas premium;
- feedback táctil;
- double tap como gesto de detalle rápido;
- modales o reportes contextuales;
- formularios que no quedan bloqueados por el teclado emergente;
- transiciones suaves;
- experiencia moderna tipo Apple;
- sensación de app nativa;
- reducción de fricción para el usuario.

La referencia externa sirve para entender calidad de interacción, no para copiar arquitectura.

---

## Inspiración prohibida

Está prohibido copiar desde proyectos de muestra:

- arquitectura;
- stores;
- repositorios;
- base de datos;
- persistencia;
- reglas de negocio;
- modelos de dominio;
- lógica transaccional;
- rutas completas;
- estructura interna no compatible;
- código no auditado;
- deuda técnica;
- patrones que rompan la Constitución MAXGRIFOS ERP V2.

También está prohibido copiar patrones visuales que contradigan la navegación premium oficial de MAXGRIFOS.

En particular, NO se debe introducir un bottom nav con botón central destacado si ese patrón obstruye, compite o rompe la usabilidad.

---

## Principio rector visual

MAXGRIFOS ERP V2 debe sentirse como una app móvil moderna, no como una web comprimida dentro de un celular.

La experiencia debe ser:

- limpia;
- clara;
- premium;
- mobile-first;
- táctil;
- sin ruido técnico;
- sin botones artificiales;
- sin obstrucciones;
- sin scroll horizontal;
- sin formularios bloqueados por teclado;
- sin legacy visual dominante;
- sin navegación duplicada;
- sin FAB invasivo;
- sin huecos centrales artificiales.

---

## Botones interactivos premium

Los botones de MAXGRIFOS ERP V2 deben ser:

- grandes cuando representen acciones principales;
- fáciles de tocar con el pulgar;
- visualmente claros;
- consistentes;
- con feedback táctil;
- sin bloquear contenido;
- sin competir con la navegación principal;
- sin esconder acciones críticas.

Los botones principales deben comunicar acción real, por ejemplo:

- Guardar;
- Actualizar;
- Cancelar;
- Nuevo Producto;
- Nuevo Cliente;
- Escanear;
- Ver Detalle;
- Ver Reporte.

Está prohibido crear botones decorativos que no aporten función real.

---

## Teclado emergente y formularios

Todo formulario largo debe respetar mobile-first real.

El teclado emergente NO puede tapar:

- últimos campos;
- botones Guardar;
- botones Actualizar;
- botones Cancelar;
- botones Volver;
- errores de validación;
- campos obligatorios.

Todo formulario largo debe usar una estrategia reusable de safe-area y keyboard-safe layout.

La clase global oficial para formularios largos es:

`mg-mobile-form-safe`

Los formularios nuevos deben usar esta clase o una evolución compatible aprobada.

Está prohibido resolver formularios largos con parches aislados o estilos inline repetidos.

---

## Double tap NIS

El double tap es un gesto permitido dentro de MAXGRIFOS ERP V2 solo como interacción de lectura, detalle rápido o despliegue contextual.

Double tap puede usarse para:

- abrir un resumen rápido;
- abrir un modal de detalle;
- desplegar un reporte;
- expandir información de una tarjeta;
- mostrar métricas relacionadas;
- abrir edición contextual si el usuario confirma;
- mostrar información secundaria sin cambiar de pantalla.

Double tap NO puede:

- guardar datos;
- borrar datos;
- crear registros;
- modificar registros sin confirmación;
- ejecutar handlers transaccionales directamente;
- escribir en Store;
- escribir en DB;
- romper idempotencia;
- reemplazar botones críticos visibles;
- ocultar acciones obligatorias.

Double tap debe sentirse natural, rápido y seguro.

---

## Reportes y detalle contextual

MAXGRIFOS ERP V2 debe permitir que ciertas tarjetas, KPIs o campos desplieguen detalle contextual de forma elegante.

Ejemplos permitidos:

- double tap en KPI Productos: mostrar resumen de productos;
- double tap en KPI Clientes: mostrar resumen de clientes;
- double tap en Stock crítico: mostrar listado o reporte filtrado;
- double tap en tarjeta de módulo: mostrar vista rápida del módulo;
- double tap en campo de valor: mostrar explicación, historial o edición controlada;
- double tap en reporte: expandir detalle.

Estos despliegues deben ser:

- no destructivos;
- reversibles;
- claros;
- táctiles;
- compatibles con scroll vertical;
- compatibles con teclado;
- compatibles con navegación premium;
- compatibles con NIS.

---

## Estilo Apple-like permitido

La referencia Apple-like se entiende como:

- limpieza visual;
- espaciado generoso;
- jerarquía clara;
- botones cómodos;
- estados visuales suaves;
- cards modernas;
- sombras discretas;
- bordes redondeados;
- interacción fluida;
- ausencia de ruido técnico;
- sensación de producto terminado.

Apple-like NO significa copiar marcas, íconos propietarios, componentes cerrados ni patrones que contradigan MAXGRIFOS.

---

## Relación con Legacy

Legacy está congelado por `docs/LEGACY_FREEZE_POLICY.md`.

Legacy NO gobierna UI/UX.

Legacy NO gobierna NIS.

Legacy NO gobierna navegación.

Legacy NO gobierna frontend.

Legacy NO define la experiencia visual objetivo.

La experiencia objetivo está gobernada por:

1. Constitución MAXGRIFOS ERP V2;
2. NIS;
3. navegación premium;
4. mobile-first real;
5. este documento NIS PREMIUM UX TARGET.

---

## Regla de conflicto

Si una referencia externa entra en conflicto con la Constitución, domina la Constitución.

Si una referencia externa entra en conflicto con NIS, domina NIS.

Si una referencia externa entra en conflicto con mobile-first real, domina mobile-first real.

Si una referencia externa entra en conflicto con navegación premium, domina navegación premium.

Si una referencia externa introduce deuda técnica, se bloquea.

Si una referencia externa mejora UX sin romper arquitectura, puede adaptarse selectivamente.

---

## REGLA OFICIAL NIS — GLOBAL USER ASSISTANCE LAYERS

NIS debe operar como capa transversal invisible de ayuda al usuario.

A partir de esta regla, todo módulo nuevo o migrado debe incluir desde su primer commit:

### 1. DOUBLE TAP EDIT REVEAL

- Toda entidad editable debe permitir double tap sobre su card/list item.
- El double tap no debe editar directamente.
- Debe revelar una opción clara: "Editar".
- Esa opción debe reutilizar el evento/ruta/handler oficial existente.
- Prohibido crear rutas paralelas.
- Prohibido bypass de handlers, stores, contracts o DB.
- El single tap, scroll, swipe y botones existentes no deben romperse.

### 2. GLOBAL FEEDBACK / HEATMAP MESSAGES

Todo proceso bloqueado, validado, exitoso o roto debe emitir feedback visible.

#### A. AMBER / WARNING

- Para dato obligatorio faltante.
- Para validación bloqueante.
- Para acción impedida por regla de negocio.
- Debe emerger desde status bar / parte superior.
- Ejemplo: "Falta Código Proveedor para generar SKU."

#### B. GREEN / SUCCESS

- Para proceso cerrado correctamente.
- Para creación, actualización, guardado o cancelación exitosa.
- Debe emerger desde el centro de la pantalla.
- Ejemplo: "Producto actualizado correctamente."

#### C. RED / CRITICAL ERROR

- Para error real de app, contrato, handler, runtime o proceso roto.
- Debe emerger desde la mitad derecha de la pantalla.
- Ejemplo: "No se pudo actualizar el producto. Verifique el flujo."

### 3. IMPLEMENTATION STANDARD

- No implementar mensajes sueltos por módulo.
- Debe existir o respetarse un sistema global de feedback.
- Los módulos deben emitir intención/estado; la capa global decide presentación visual.
- NIS debe ser invisible cuando no se necesita y visible cuando el usuario necesita guía.
- Ningún módulo futuro se considera completo si no integra estas capas.
