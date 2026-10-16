# Quickstart: Sedes (markets)

**Feature**: 031-markets

Este recorrido prueba la funcionalidad de punta a punta en local: API, admin y app. Supone la skill `levanta-porteros-pro-local`, que levanta el API, el admin y ngrok, y apunta la app al túnel.

## 0. Preparar datos

La base de desarrollo ya quedó en el modelo de sedes (2026-10-16, T107). El script de reset se borró después de correrlo. No hay nada que preparar: Medellín existe como sede habilitada, con 13 zonas sin traslapes, y el equipo tiene alcance de plataforma.

## 1. Crear y habilitar una sede (US1, US3)

1. En el admin, con "Todas" seleccionado, abre **Sedes → Medellín → Lista de chequeo**.
   - **Esperado:** "Lista", o los faltantes con enlace.
2. Pulsa **Habilitar**.
   - **Esperado:** la sede queda habilitada, y en Resumen aparecen la fecha y el autor.
3. Crea la sede **"Prueba"** (Colombia, `America/Bogota`) e intenta habilitarla.
   - **Esperado:** el diálogo lista "Sin zonas activas", tarifas y demás faltantes, y no deja confirmar.
4. En **Prueba**, dibuja una zona que **toque el borde** de una zona de Medellín.
   - **Esperado:** se rechaza con "Esta zona toca o se cruza con: {zona} (Medellín)".
5. Desactiva una zona de Medellín y dibuja en Prueba una zona que la cruce.
   - **Esperado:** se guarda.
   - Luego intenta reactivar la zona de Medellín. **Esperado:** se rechaza e indica la zona de Prueba.
6. Intenta cambiar el país de Prueba.
   - **Esperado:** el campo no es editable.

## 2. Herencia de configuración (US2)

1. En **Reglas del país (Colombia)**, fija una ventana de reserva de 14 días.
2. En **Reglas de la sede (Medellín)**, deja el campo vacío.
   - **Esperado:** "14 · Del país".
3. Fija 7 días en la sede.
   - **Esperado:** "7 · De la sede". La cotización en la app muestra 7 días disponibles.
4. Intenta guardar penalidades en la sede.
   - **Esperado:** el campo no existe en la sede, solo en el país.

## 3. Cotizar en la app (US4)

| Punto | Mensaje esperado |
|---|---|
| Dentro de una zona activa de Medellín | Precio y reglas de Medellín |
| En la franja entre dos zonas vecinas (sobre una calle limítrofe) | "Aún no tenemos servicio aquí" |
| En la zona desactivada del paso 1.5, fuera de la de Prueba | "Medellín está temporalmente fuera de servicio" |
| En una zona de Prueba, que está en borrador | "Aún no tenemos servicio aquí" |

## 4. Deshabilitar sin cortar lo que está en curso (US3, FR-011)

1. Crea una solicitud en Medellín y haz que un portero acepte una reserva de otra.
2. Deshabilita Medellín con un motivo.
3. **Esperado:**
   - la solicitud sigue buscando portero, y otro portero puede aceptarla;
   - la reserva aceptada sigue en la agenda;
   - una cotización nueva en Medellín muestra "temporalmente fuera de servicio";
   - confirmar una cotización hecha antes de deshabilitar también lo muestra.
4. Vuelve a habilitar Medellín.

## 5. Registro del portero con facturación (US5)

1. Con un usuario nuevo, abre el registro de portero.
   - **Esperado:** "¿Dónde quieres tapar?" lista solo Medellín (Prueba está en borrador).
2. Completa todo menos **Datos de facturación**.
   - **Esperado:** "Enviar registro" está deshabilitado e indica la sección que falta.
3. Elige el municipio "Bello, Antioquia", una dirección y un complemento, y envía.
4. Valida al portero (030), deposita y acepta un partido hasta que se cobre comisión.
   - **Esperado:** la factura en Siigo, o en el modo `log`, lleva Bello con su DANE y la dirección escrita, no Medellín.
5. Cambia la dirección desde el perfil.
   - **Esperado:** la factura anterior conserva la dirección vieja y la siguiente usa la nueva.

## 6. Cambio de sede (US6)

1. Habilita Prueba (complétala primero). Con el portero del paso 5 y una reserva aceptada sin jugar, intenta **Cambiar dónde tapo** → Prueba.
   - **Esperado:** "Tienes partidos aceptados sin jugar", con la lista.
2. Sin reservas pendientes, cámbiate a Prueba.
   - **Esperado:** pierde las zonas de Medellín y solo recibe ofertas de Prueba.
3. *(Si hay una sede en otro país)* Con saldo a favor, intenta cambiarte a ella.
   - **Esperado:** "Para cambiarte a otro país tu saldo operativo debe estar en cero".
4. En el admin, abre la ficha del portero.
   - **Esperado:** no existe la acción de cambiar de sede.

## 7. Selector y alcances (US7, US8)

1. Con "Colombia › Medellín", abre **Solicitudes**.
   - **Esperado:** solo Medellín.
   - Con "Colombia": las dos sedes, con la columna "Sede".
2. Abre **Porteros** con "Colombia › Medellín".
   - **Esperado:** el chip "Colombia · filtrado: Medellín". Al quitarlo, se ven todos los de Colombia.
3. Abre dos pestañas con sedes distintas y cambia una.
   - **Esperado:** la otra no cambia.
4. Invita a un miembro con alcance solo de **Medellín** y entra con esa cuenta.
   - **Esperado:**
     - el selector solo ofrece Medellín;
     - en Porteros solo ve los de Medellín;
     - en la ficha de Medellín no ve Habilitar, Deshabilitar ni Eliminar;
     - "Nueva sede" no aparece;
     - el enlace a una reserva de Prueba responde "No encontrado".
5. Con el portero del paso 6, que pasó de Medellín a Prueba, abre **Facturas** filtrado por Medellín.
   - **Esperado:** sus facturas anteriores al cambio siguen en Medellín.

## 8. Pasarela por sede (US9)

1. Configura en Prueba un override de pasarela (en sandbox) con montos distintos.
   - **Esperado:** el portero de Prueba ve los montos de la sede, y uno de Medellín ve los del país.
2. Pulsa **Volver al del país**.
   - **Esperado:** el portero de Prueba vuelve a ver los del país.

## 9. Pruebas automáticas

```bash
# API
npm test && npm run test:http && npm run test:architecture && npm run lint
# Admin
cd /Users/santiagomonsalve/Documents/Projects/angular/porteros-pro-admin && npm test && npm run lint
# App
cd /Users/santiagomonsalve/Documents/Projects/flutter/porteros_pro_app && flutter analyze && flutter test
```

Los pasos 1–8 también se copian a `_temp_pruebas.md` como pruebas manuales, según la costumbre del proyecto.
