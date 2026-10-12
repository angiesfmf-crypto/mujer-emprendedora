require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const { z } = require('zod');
const path = require('path');

const app = express();
const port = Number(process.env.PORT || 3000);
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  console.error('Configura JWT_SECRET con al menos 32 caracteres en .env');
  process.exit(1);
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : undefined });
app.use(helmet());
app.use(cors({ origin: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map(s => s.trim()), credentials: false }));
app.use(express.json({ limit: '200kb' }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 40, standardHeaders: true, legacyHeaders: false }));

const emailSchema = z.string().email().max(254).transform(v => v.toLowerCase().trim());
const passwordSchema = z.string().min(10).max(72);
const signupSchema = z.object({
  name: z.string().trim().min(2).max(120), email: emailSchema, password: passwordSchema,
  business: z.string().trim().min(2).max(160), phone: z.string().trim().max(40).optional().default(''),
  location: z.string().trim().max(160).optional().default(''), activity: z.string().trim().max(100).optional().default(''),
  digitalLevel: z.string().trim().max(60).optional().default('Inicial')
});
const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(72) });
const productSchema = z.object({ name: z.string().trim().min(1).max(160), category: z.string().trim().max(100).optional().default('General'), price: z.number().finite().min(0).max(1e9), stock: z.number().int().min(0).max(1e7) });
const saleSchema = z.object({ productId: z.string().uuid(), quantity: z.number().int().min(1).max(1e6), clientMutationId: z.string().uuid() });

function auth(req, res, next) {
  const token = (req.headers.authorization || '').match(/^Bearer (.+)$/)?.[1];
  if (!token) return res.status(401).json({ error: 'Inicia sesión para continuar.' });
  try { req.user = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] }); next(); }
  catch { return res.status(401).json({ error: 'Sesión no válida o vencida.' }); }
}
function validate(schema, source = 'body') {
  return (req, res, next) => { const parsed = schema.safeParse(req[source]); if (!parsed.success) return res.status(400).json({ error: 'Revisa los datos enviados.', details: parsed.error.issues.map(i => ({ field: i.path.join('.'), message: i.message })) }); req[source] = parsed.data; next(); };
}
const tokenFor = user => jwt.sign({ sub: user.id, email: user.email, role: user.role }, jwtSecret, { algorithm: 'HS256', expiresIn: '8h', issuer: 'mujer-emprendedora-api', audience: 'mujer-emprendedora-web' });

app.get('/api/health', async (_req, res) => {
  try { await pool.query('SELECT 1'); res.json({ status: 'ok', database: 'connected' }); }
  catch { res.status(503).json({ status: 'degraded', database: 'unavailable' }); }
});

app.post('/api/auth/register', validate(signupSchema), async (req, res, next) => {
  try {
    const { name, email, password, business, phone, location, activity, digitalLevel } = req.body;
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO users(name,email,password_hash,business,phone,location,activity,digital_level)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id,name,email,business,phone,location,activity,digital_level,role,created_at`,
      [name,email,passwordHash,business,phone,location,activity,digitalLevel]);
    const user = result.rows[0]; res.status(201).json({ token: tokenFor(user), user });
  } catch (e) { if (e.code === '23505') return res.status(409).json({ error: 'Ya existe una cuenta con ese correo.' }); next(e); }
});
app.post('/api/auth/login', validate(loginSchema), async (req, res, next) => {
  try {
    const r = await pool.query('SELECT id,name,email,password_hash,business,phone,location,activity,digital_level,role,created_at FROM users WHERE email=$1', [req.body.email]);
    if (!r.rowCount || !(await bcrypt.compare(req.body.password, r.rows[0].password_hash))) return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
    const user = r.rows[0]; delete user.password_hash; res.json({ token: tokenFor(user), user });
  } catch (e) { next(e); }
});
app.get('/api/me', auth, async (req, res, next) => {
  try { const r = await pool.query('SELECT id,name,email,business,phone,location,activity,digital_level,role,created_at FROM users WHERE id=$1', [req.user.sub]); if (!r.rowCount) return res.status(404).json({ error: 'Cuenta no encontrada.' }); res.json({ user: r.rows[0] }); }
  catch (e) { next(e); }
});
app.patch('/api/me', auth, async (req, res, next) => {
  const schema = z.object({ name:z.string().trim().min(2).max(120), business:z.string().trim().min(2).max(160), phone:z.string().trim().max(40).optional().default(''), location:z.string().trim().max(160).optional().default(''), activity:z.string().trim().max(100).optional().default(''), digitalLevel:z.string().trim().max(60).optional().default('Inicial') });
  const parsed = schema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error:'Datos de perfil no válidos.' });
  try { const d=parsed.data; const r=await pool.query('UPDATE users SET name=$1,business=$2,phone=$3,location=$4,activity=$5,digital_level=$6,updated_at=NOW() WHERE id=$7 RETURNING id,name,email,business,phone,location,activity,digital_level,role,created_at',[d.name,d.business,d.phone,d.location,d.activity,d.digitalLevel,req.user.sub]); res.json({user:r.rows[0]}); }
  catch(e){next(e)}
});

app.get('/api/products', auth, async (req,res,next)=>{try{const r=await pool.query('SELECT id,name,category,price,stock,created_at,updated_at FROM products WHERE user_id=$1 ORDER BY created_at DESC',[req.user.sub]);res.json({items:r.rows})}catch(e){next(e)}});
app.post('/api/products', auth, validate(productSchema), async(req,res,next)=>{try{const d=req.body;const r=await pool.query('INSERT INTO products(user_id,name,category,price,stock) VALUES($1,$2,$3,$4,$5) RETURNING id,name,category,price,stock,created_at,updated_at',[req.user.sub,d.name,d.category,d.price,d.stock]);res.status(201).json({item:r.rows[0]})}catch(e){next(e)}});
app.patch('/api/products/:id', auth, async(req,res,next)=>{const parsed=productSchema.partial().safeParse(req.body);if(!parsed.success||!Object.keys(parsed.data||{}).length)return res.status(400).json({error:'Datos de producto no válidos.'});try{const d=parsed.data;const keys={name:'name',category:'category',price:'price',stock:'stock'};const sets=[],vals=[];for(const [k,v] of Object.entries(d)){vals.push(v);sets.push(`${keys[k]}=$${vals.length}`)}vals.push(req.params.id,req.user.sub);const r=await pool.query(`UPDATE products SET ${sets.join(',')},updated_at=NOW() WHERE id=$${vals.length-1} AND user_id=$${vals.length} RETURNING id,name,category,price,stock,created_at,updated_at`,vals);if(!r.rowCount)return res.status(404).json({error:'Producto no encontrado.'});res.json({item:r.rows[0]})}catch(e){next(e)}});
app.delete('/api/products/:id', auth, async(req,res,next)=>{try{const r=await pool.query('DELETE FROM products WHERE id=$1 AND user_id=$2 RETURNING id',[req.params.id,req.user.sub]);if(!r.rowCount)return res.status(404).json({error:'Producto no encontrado.'});res.status(204).end()}catch(e){next(e)}});

app.post('/api/sales', auth, validate(saleSchema), async(req,res,next)=>{
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const previous=await client.query('SELECT id,product_id,quantity,total,created_at FROM sales WHERE user_id=$1 AND client_mutation_id=$2',[req.user.sub,req.body.clientMutationId]);
    if(previous.rowCount){await client.query('COMMIT');return res.json({item:previous.rows[0],duplicate:true})}
    const pr=await client.query('SELECT id,name,price,stock FROM products WHERE id=$1 AND user_id=$2 FOR UPDATE',[req.body.productId,req.user.sub]);
    if(!pr.rowCount){await client.query('ROLLBACK');return res.status(404).json({error:'Producto no encontrado.'})}
    const p=pr.rows[0];if(p.stock<req.body.quantity){await client.query('ROLLBACK');return res.status(409).json({error:'No hay existencias suficientes.',available:p.stock})}
    const total=Number(p.price)*req.body.quantity;
    const sr=await client.query('INSERT INTO sales(user_id,product_id,quantity,unit_price,total,client_mutation_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,product_id,quantity,total,created_at',[req.user.sub,p.id,req.body.quantity,p.price,total,req.body.clientMutationId]);
    await client.query('UPDATE products SET stock=stock-$1,updated_at=NOW() WHERE id=$2 AND user_id=$3',[req.body.quantity,p.id,req.user.sub]);
    await client.query('COMMIT');res.status(201).json({item:sr.rows[0]});
  }catch(e){await client.query('ROLLBACK').catch(()=>{});if(e.code==='23505')return res.status(409).json({error:'Esta operación ya fue sincronizada.'});next(e)}finally{client.release()}
});
app.get('/api/sales',auth,async(req,res,next)=>{try{const r=await pool.query('SELECT s.id,s.product_id,p.name AS product_name,s.quantity,s.unit_price,s.total,s.created_at FROM sales s JOIN products p ON p.id=s.product_id WHERE s.user_id=$1 ORDER BY s.created_at DESC LIMIT 500',[req.user.sub]);res.json({items:r.rows})}catch(e){next(e)}});
app.get('/api/reports/summary',auth,async(req,res,next)=>{try{const [p,s,c]=await Promise.all([pool.query('SELECT COUNT(*)::int AS product_count,COALESCE(SUM(stock),0)::int AS units FROM products WHERE user_id=$1',[req.user.sub]),pool.query('SELECT COUNT(*)::int AS sales_count,COALESCE(SUM(total),0)::numeric AS income FROM sales WHERE user_id=$1',[req.user.sub]),pool.query('SELECT COUNT(*) FILTER (WHERE completed)::int AS completed,COUNT(*)::int AS total FROM course_progress WHERE user_id=$1',[req.user.sub])]);res.json({products:p.rows[0],sales:s.rows[0],courses:c.rows[0]})}catch(e){next(e)}});
app.get('/api/courses/progress',auth,async(req,res,next)=>{try{const r=await pool.query('SELECT course_id,completed,updated_at FROM course_progress WHERE user_id=$1 ORDER BY course_id',[req.user.sub]);res.json({items:r.rows})}catch(e){next(e)}});
app.put('/api/courses/:courseId/progress',auth,async(req,res,next)=>{const idSchema=z.string().regex(/^[a-z0-9-]{2,80}$/);const parsed=idSchema.safeParse(req.params.courseId);const body=z.object({completed:z.boolean()}).safeParse(req.body);if(!parsed.success||!body.success)return res.status(400).json({error:'Progreso no válido.'});try{const r=await pool.query('INSERT INTO course_progress(user_id,course_id,completed) VALUES($1,$2,$3) ON CONFLICT(user_id,course_id) DO UPDATE SET completed=EXCLUDED.completed,updated_at=NOW() RETURNING course_id,completed,updated_at',[req.user.sub,req.params.courseId,body.data.completed]);res.json({item:r.rows[0]})}catch(e){next(e)}});

// Basic pull/push endpoint for client-side offline queue. Each mutation needs a stable UUID.
app.post('/api/sync/push',auth,async(req,res,next)=>{
  const schema=z.object({mutations:z.array(z.object({id:z.string().uuid(),type:z.enum(['course-progress']),courseId:z.string().regex(/^[a-z0-9-]{2,80}$/),completed:z.boolean()})).max(100)});
  const parsed=schema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'Cola de sincronización no válida.'});
  const client=await pool.connect();try{await client.query('BEGIN');const results=[];for(const m of parsed.data.mutations){await client.query('INSERT INTO sync_mutations(user_id,mutation_id,mutation_type) VALUES($1,$2,$3) ON CONFLICT(user_id,mutation_id) DO NOTHING',[req.user.sub,m.id,m.type]);const exists=await client.query('SELECT 1 FROM sync_mutations WHERE user_id=$1 AND mutation_id=$2',[req.user.sub,m.id]);if(exists.rowCount){const r=await client.query('INSERT INTO course_progress(user_id,course_id,completed) VALUES($1,$2,$3) ON CONFLICT(user_id,course_id) DO UPDATE SET completed=EXCLUDED.completed,updated_at=NOW() RETURNING course_id,completed,updated_at',[req.user.sub,m.courseId,m.completed]);results.push({id:m.id,status:'synced',item:r.rows[0]})}}await client.query('COMMIT');res.json({results})}catch(e){await client.query('ROLLBACK').catch(()=>{});next(e)}finally{client.release()}
});

app.get('/api/admin/entrepreneurs', auth, async (req,res,next) => {
  if (req.user.role !== 'admin') return res.status(403).json({error:'No tienes permisos para consultar el panel administrativo.'});
  try { const r=await pool.query("SELECT id,name,email,business,phone,location,activity,digital_level,created_at FROM users WHERE role='entrepreneur' ORDER BY created_at DESC LIMIT 500"); res.json({items:r.rows}); } catch(e){next(e)}
});
app.use(express.static(path.join(__dirname, '../public'), { extensions: ['html'] }));
app.get('*', (req,res,next) => { if(req.path.startsWith('/api/')) return next(); res.sendFile(path.join(__dirname, '../public/index.html')); });
app.use((err, _req, res, _next) => { console.error(err); if (err.code === '23505') return res.status(409).json({error:'Ya existe un registro con esos datos.'}); res.status(500).json({error:'Ocurrió un error interno. Inténtalo de nuevo.'}); });
app.listen(port, () => console.log(`Mujer Emprendedora API escuchando en puerto ${port}`));
