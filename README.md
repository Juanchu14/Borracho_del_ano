# 🍻 Borracho del año

Ranking competitivo entre amigos para llevar la cuenta de lo consumido en
las quedadas, con consumo siempre responsable. Backend en **Node.js +
Express**, base de datos **PostgreSQL**, y frontend **mobile-first** en
HTML/CSS/JS sin frameworks ni paso de compilación, servido por el propio
backend. Un único proceso, fácil de mantener en un servidor casero.

---

## 1. Qué incluye

```
borracho-del-ano/
├── backend/              API en Express + conexión a PostgreSQL
│   ├── server.js         Punto de entrada
│   ├── schema.sql         Esquema de la base de datos
│   ├── routes/            auth, users, leagues, scoring, entries
│   ├── middleware/        autenticación JWT y permisos de liga
│   └── .env.example       Plantilla de configuración
├── frontend/              SPA mobile-first (HTML/CSS/JS vanilla)
└── deploy/
    ├── borracho-del-ano.service     Unidad systemd
    └── nginx-borracho-del-ano.conf  Proxy inverso opcional
```

### Funcionalidades

- Registro (nombre completo, usuario, contraseña) e inicio de sesión.
- Cambio de nombre de usuario desde el panel principal.
- Crear liga (nombre + descripción opcional) → genera un código de
  invitación tipo `XXXX-XXXX`, visible en la pantalla de la liga.
- Unirse a una liga solo con el código.
- Sistema de puntuación personalizable por liga (nombre, emoji, puntos),
  gestionable únicamente por quien creó la liga.
- Clasificación ordenada por puntos, con una columna por cada elemento del
  sistema de puntuación; cualquier columna es clicable para reordenar.
- Historial completo de la liga (quién, qué, cuánto, cuándo), editable o
  borrable por el propio autor del registro o por el creador de la liga.
- Vista de historial filtrada por un integrante concreto.
- Añadir una puntuación seleccionando elemento y cantidad (1 por defecto).

### Un par de decisiones que he tomado por mi cuenta

- **Quién puede editar/borrar un registro del historial**: el propio autor,
  o el creador de la liga (como administrador). Si lo prefieres de otra
  forma, es un cambio pequeño en `backend/routes/entries.js`.
- **Quién puede ver el sistema de puntuación**: todos los miembros pueden
  verlo (lo necesitan para saber qué vale cada cosa al puntuar), pero solo
  el creador de la liga puede añadir, editar o borrar elementos.
- Las contraseñas se guardan con hash `bcryptjs` (nunca en texto plano).

---

## 2. Preparar el servidor Ubuntu

Esto asume Ubuntu Server (22.04/24.04) en tu casa, con acceso por SSH o
directamente desde el teclado.

### 2.1. Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v   # debería mostrar v22.x
```

### 2.2. PostgreSQL

```bash
sudo apt-get update
sudo apt-get install -y postgresql postgresql-contrib
sudo systemctl enable --now postgresql
```

Crea el usuario y la base de datos de la app:

```bash
sudo -u postgres psql -c "CREATE USER borracho_app WITH PASSWORD 'PON_AQUI_UNA_CONTRASENA_FUERTE';"
sudo -u postgres psql -c "CREATE DATABASE borracho_del_ano OWNER borracho_app;"
```

---

## 3. Copiar y configurar la aplicación

Copia la carpeta `borracho-del-ano` a tu servidor (por `scp`, `git`, una
memoria USB, lo que te resulte más cómodo), por ejemplo a
`/opt/borracho-del-ano`.

```bash
cd /opt/borracho-del-ano/backend
cp .env.example .env
nano .env     # rellena DB_PASSWORD y genera un JWT_SECRET
```

Para generar un secreto fuerte:

```bash
openssl rand -hex 64
```

Pégalo como valor de `JWT_SECRET` en `.env`.

Instala las dependencias (solo producción) y crea las tablas:

```bash
npm install --omit=dev
npm run init-db
```

Prueba que arranca:

```bash
npm start
# 🍻 Borracho del año escuchando en el puerto 3000
```

Visita `http://IP-DE-TU-SERVIDOR:3000` desde el móvil (conectado a la
misma red) y deberías ver la pantalla de login. Para detener la prueba,
`Ctrl+C`.

---

## 4. Dejarlo funcionando siempre (systemd)

Para que la app arranque sola al encender el servidor y se reinicie si
falla:

```bash
sudo cp /opt/borracho-del-ano/deploy/borracho-del-ano.service /etc/systemd/system/
sudo nano /etc/systemd/system/borracho-del-ano.service
# Ajusta "User=" y las rutas "WorkingDirectory=" / "EnvironmentFile=" a tu caso

sudo systemctl daemon-reload
sudo systemctl enable --now borracho-del-ano
sudo systemctl status borracho-del-ano
```

Ver los logs en directo:

```bash
journalctl -u borracho-del-ano -f
```

---

## 5. Acceso desde el móvil

- **En casa (misma WiFi)**: abre `http://IP-DE-TU-SERVIDOR:3000` en el
  navegador del móvil. Puedes "Añadir a pantalla de inicio" para que se
  abra como una app.
- **Fuera de casa**: lo más simple y seguro es instalar
  [Tailscale](https://tailscale.com/) (o WireGuard) tanto en el servidor
  como en el móvil; así accedes como si estuvieras en tu red local sin
  abrir puertos en el router. Abrir el puerto 3000 directamente a
  internet también funciona, pero entonces te recomiendo poner Nginx
  delante con HTTPS (ver `deploy/nginx-borracho-del-ano.conf` y
  [Certbot](https://certbot.eff.org/)) y revisar el firewall:

  ```bash
  sudo ufw allow 80,443/tcp   # si usas Nginx
  # o, si accedes directo al puerto de la app:
  sudo ufw allow 3000/tcp
  ```

---

## 6. Mantenimiento

**Backups de la base de datos** (cron diario, por ejemplo):

```bash
pg_dump -U borracho_app borracho_del_ano > /opt/backups/borracho_$(date +%F).sql
```

**Actualizar la app** tras copiar cambios nuevos al servidor:

```bash
cd /opt/borracho-del-ano/backend
npm install --omit=dev
sudo systemctl restart borracho-del-ano
```

---

## 7. Ideas para más adelante (no incluidas, por si te interesan)

- Mover el token de sesión de `localStorage` a una cookie `httpOnly` si en
  algún momento te preocupa que un script de terceros pueda leerlo.
- Política de Content-Security-Policy más estricta (ahora está
  deshabilitada en `server.js` para no pelearse con la fuente de Google
  Fonts y los estilos en línea de algunos formularios).
- Notificaciones push cuando alguien añade una puntuación.
- Exportar el historial a CSV/Excel.
- Endpoint para "regenerar" el código de invitación de una liga.

---

¡Que disfrutéis la liga, con cabeza! 🍻
