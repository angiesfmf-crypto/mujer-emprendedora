# Mujer Emprendedora — aplicación integrada

Aplicación PWA académica con interfaz web, API REST y PostgreSQL. La misma aplicación Node sirve el frontend y la API en el puerto 3000.

## Qué está integrado
- Registro de cuenta e inicio de sesión con contraseñas cifradas (bcrypt) y tokens JWT de 8 horas.
- Perfil de emprendedora conectado a PostgreSQL.
- Crear, listar y eliminar productos desde la API; las ventas se registran en transacción y descuentan existencias en el servidor.
- Progreso de módulos de capacitación guardado en el servidor.
- Reportes calculados desde la información de la cuenta.
- Endpoint administrativo protegido por rol para consultar cuentas de emprendedoras.
- Interfaz PWA con service worker; se ofrece un modo local de demostración que explícitamente no sincroniza.

## Ejecutar localmente con Docker
1. Instala Docker Desktop.
2. En esta carpeta, crea un archivo `.env` a partir de `.env.example`.
3. Cambia `POSTGRES_PASSWORD` y `JWT_SECRET` por secretos propios. `JWT_SECRET` debe tener al menos 32 caracteres.
4. Ejecuta `docker compose up --build`.
5. Abre `http://localhost:3000` en el navegador y crea una cuenta.
6. Para detener: `docker compose down`. Los datos persisten en el volumen `postgres_data`.

Si cambias el esquema después de crear el volumen, PostgreSQL no vuelve a ejecutar automáticamente los scripts iniciales. Para reiniciar una base de datos local de pruebas (esto borra esos datos), usa `docker compose down -v` y luego `docker compose up --build`.

## Crear una cuenta administrativa
Por seguridad, el registro público siempre crea cuentas `entrepreneur`. Para promover una cuenta existente, primero regístrala y después ejecuta en la base de datos:

```sql
UPDATE users SET role = 'admin' WHERE email = 'correo-administrador@ejemplo.com';
```

Cierra sesión e inicia sesión de nuevo para recibir un token con el rol actualizado. El endpoint administrativo está protegido por el rol en el servidor, no solo por la interfaz.

## Configuración sin Docker
- Requiere Node.js 20+ y PostgreSQL.
- Ejecuta `psql "$DATABASE_URL" -f schema.sql` para crear tablas.
- Copia `.env.example` a `.env`, configura `DATABASE_URL`, `JWT_SECRET` y `DATABASE_SSL`.
- Ejecuta `npm install` y `npm start`.

## Importante antes de una publicación pública
Este es un prototipo funcional integrado, no una auditoría de seguridad ni una plataforma lista para manejar datos sensibles a escala. Antes de usarlo con participantes reales, añade y prueba recuperación/verificación de correo, política de privacidad y consentimiento, copias de seguridad, monitoreo, límites de retención, pruebas automatizadas, revisión de dependencias y configuración HTTPS del proveedor. Los tokens se guardan en el almacenamiento local del navegador; una versión de producción con mayor exigencia de seguridad debería migrar a cookies `HttpOnly`, `Secure` y `SameSite` y reforzar protección CSRF. El modo offline permite trabajar localmente, pero todavía no tiene una cola completa de sincronización de cambios offline para productos y ventas.
