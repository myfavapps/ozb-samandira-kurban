import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const JWT_SECRET = Deno.env.get('PANEL_JWT_SECRET') || 'default-secret-change-me'
const REST_URL = `${SUPABASE_URL}/rest/v1`

const dbHeaders = {
  'apikey': SUPABASE_SERVICE_KEY,
  'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
}

const dbHeadersMinimal = {
  ...dbHeaders,
  'Prefer': 'return=minimal',
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// ---- Crypto helpers ----

async function sha256(message: string): Promise<string> {
  const data = new TextEncoder().encode(message)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function generateSalt(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function hashPassword(password: string, salt: string): Promise<string> {
  return sha256(salt + password)
}

// ---- JWT helpers ----

function base64url(str: string): string {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64urlDecode(str: string): string {
  str = str.replace(/-/g, '+').replace(/_/g, '/')
  while (str.length % 4) str += '='
  return atob(str)
}

async function signJWT(payload: Record<string, unknown>): Promise<string> {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = base64url(JSON.stringify(payload))
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(JWT_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${header}.${body}`))
  const signature = base64url(String.fromCharCode(...new Uint8Array(sig)))
  return `${header}.${body}.${signature}`
}

async function verifyJWT(token: string): Promise<Record<string, unknown> | null> {
  try {
    const [header, body, signature] = token.split('.')
    if (!header || !body || !signature) return null

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(JWT_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    )
    // Decode signature
    const sigStr = base64urlDecode(signature)
    const sigBytes = new Uint8Array(sigStr.length)
    for (let i = 0; i < sigStr.length; i++) sigBytes[i] = sigStr.charCodeAt(i)

    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(`${header}.${body}`))
    if (!valid) return null

    const payload = JSON.parse(base64urlDecode(body))
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

// ---- Auth middleware ----

async function requireAuth(req: Request): Promise<Record<string, unknown>> {
  const auth = req.headers.get('authorization')
  if (!auth || !auth.startsWith('Bearer ')) throw new Error('401:Yetkilendirme gerekli')
  const payload = await verifyJWT(auth.slice(7))
  if (!payload) throw new Error('401:Geçersiz veya süresi dolmuş token')
  return payload
}

function requireRole(user: Record<string, unknown>, ...roles: string[]) {
  if (!roles.includes(user.role as string)) throw new Error('403:Bu işlem için yetkiniz yok')
}

// ---- DB helpers ----

async function dbQuery(path: string, options?: RequestInit) {
  const res = await fetch(`${REST_URL}${path}`, { headers: dbHeaders, ...options })
  if (!res.ok) {
    const text = await res.text()
    console.error(`DB error ${res.status}: ${text}`)
    throw new Error(`500:Veritabanı hatası`)
  }
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

async function dbMutate(path: string, method: string, body?: unknown) {
  const res = await fetch(`${REST_URL}${path}`, {
    method,
    headers: body ? dbHeadersMinimal : dbHeaders,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text()
    console.error(`DB mutate error ${res.status}: ${text}`)
    throw new Error(`500:Veritabanı hatası`)
  }
  return res
}

// ---- Action handlers ----

async function handleLogin(data: Record<string, unknown>) {
  const { username, password } = data
  if (!username || !password) throw new Error('400:Kullanıcı adı ve şifre gerekli')

  const users = await dbQuery(`/users?username=eq.${encodeURIComponent(username as string)}&is_active=eq.true&select=*`)
  if (!users || users.length === 0) throw new Error('401:Kullanıcı bulunamadı')

  const user = users[0]
  const hash = await hashPassword(password as string, user.salt)
  if (hash !== user.password_hash) throw new Error('401:Yanlış şifre')

  const now = Math.floor(Date.now() / 1000)
  const token = await signJWT({
    sub: user.id,
    role: user.role,
    name: user.display_name,
    iat: now,
    exp: now + 86400, // 24 hours
  })

  return { token, user: { id: user.id, username: user.username, role: user.role, display_name: user.display_name } }
}

async function handleCreateUser(data: Record<string, unknown>, _user: Record<string, unknown>) {
  const { username, password, role, display_name } = data
  if (!username || !password || !role || !display_name) throw new Error('400:Tüm alanlar gerekli')
  if (!['admin', 'kesim', 'parcalama'].includes(role as string)) throw new Error('400:Geçersiz rol')

  const salt = generateSalt()
  const password_hash = await hashPassword(password as string, salt)

  const res = await fetch(`${REST_URL}/users`, {
    method: 'POST',
    headers: { ...dbHeaders, 'Prefer': 'return=representation' },
    body: JSON.stringify({ username, password_hash, salt, role, display_name }),
  })
  if (!res.ok) {
    const text = await res.text()
    if (text.includes('duplicate')) throw new Error('400:Bu kullanıcı adı zaten mevcut')
    throw new Error('500:Kullanıcı oluşturulamadı')
  }
  const created = await res.json()
  return { user: { id: created[0].id, username: created[0].username, role: created[0].role, display_name: created[0].display_name } }
}

async function handleListUsers() {
  const users = await dbQuery('/users?select=id,username,role,display_name,is_active,created_at&order=id.asc')
  return { users }
}

async function handleDeleteUser(data: Record<string, unknown>, currentUser: Record<string, unknown>) {
  const { user_id } = data
  if (!user_id) throw new Error('400:user_id gerekli')
  if (user_id === currentUser.sub) throw new Error('400:Kendinizi silemezsiniz')

  await dbMutate(`/users?id=eq.${user_id}`, 'PATCH', { is_active: false })
  return { success: true }
}

async function handleGetSettings() {
  const settings = await dbQuery('/settings?select=key,value')
  const result: Record<string, string> = {}
  for (const s of settings) result[s.key] = s.value
  return { settings: result }
}

async function handleUpdateSettings(data: Record<string, unknown>) {
  const { kurban_count, masa_count } = data
  if (kurban_count !== undefined) {
    await fetch(`${REST_URL}/settings?key=eq.kurban_count`, {
      method: 'PATCH',
      headers: dbHeadersMinimal,
      body: JSON.stringify({ value: String(kurban_count), updated_at: new Date().toISOString() }),
    })
  }
  if (masa_count !== undefined) {
    await fetch(`${REST_URL}/settings?key=eq.masa_count`, {
      method: 'PATCH',
      headers: dbHeadersMinimal,
      body: JSON.stringify({ value: String(masa_count), updated_at: new Date().toISOString() }),
    })
  }
  return { success: true }
}

async function handleInitializeKurban(data: Record<string, unknown>) {
  const { kurban_count } = data
  if (!kurban_count || typeof kurban_count !== 'number' || kurban_count < 1) throw new Error('400:Geçerli kurban sayısı gerekli')

  // Delete all existing slaughter_status rows
  await fetch(`${REST_URL}/slaughter_status?id=gte.0`, { method: 'DELETE', headers: dbHeadersMinimal })

  // Insert N rows (batch insert)
  const rows = []
  for (let i = 1; i <= kurban_count; i++) {
    rows.push({ kurban_number: i, current_number: i, status: 'waiting', last_updated: new Date().toISOString() })
  }
  const res = await fetch(`${REST_URL}/slaughter_status`, {
    method: 'POST',
    headers: dbHeadersMinimal,
    body: JSON.stringify(rows),
  })
  if (!res.ok) throw new Error('500:Kurbanlar oluşturulamadı')

  // Also update settings
  await fetch(`${REST_URL}/settings?key=eq.kurban_count`, {
    method: 'PATCH',
    headers: dbHeadersMinimal,
    body: JSON.stringify({ value: String(kurban_count), updated_at: new Date().toISOString() }),
  })

  return { success: true, count: kurban_count }
}

async function handleUpdateKesimStatus(data: Record<string, unknown>) {
  const { kurban_number, status } = data
  if (!kurban_number || !status) throw new Error('400:kurban_number ve status gerekli')
  if (!['waiting', 'in_progress', 'completed', 'cancelled'].includes(status as string)) throw new Error('400:Geçersiz durum')

  const res = await fetch(`${REST_URL}/slaughter_status?kurban_number=eq.${kurban_number}`, {
    method: 'PATCH',
    headers: dbHeadersMinimal,
    body: JSON.stringify({ status, last_updated: new Date().toISOString() }),
  })
  if (!res.ok) throw new Error('500:Durum güncellenemedi')
  return { success: true }
}

async function handleAssignToMasa(data: Record<string, unknown>, user: Record<string, unknown>) {
  const { kurban_number, masa_number } = data
  if (!kurban_number || !masa_number) throw new Error('400:kurban_number ve masa_number gerekli')

  // Upsert into processing_status
  const res = await fetch(`${REST_URL}/processing_status`, {
    method: 'POST',
    headers: { ...dbHeadersMinimal, 'Prefer': 'return=minimal,resolution=merge-duplicates' },
    body: JSON.stringify({
      kurban_number,
      masa_number,
      status: 'processing',
      started_at: new Date().toISOString(),
      completed_at: null,
      updated_by: user.sub,
    }),
  })
  if (!res.ok) throw new Error('500:Masa ataması yapılamadı')
  return { success: true }
}

async function handleCompleteProcessing(data: Record<string, unknown>, user: Record<string, unknown>) {
  const { kurban_number } = data
  if (!kurban_number) throw new Error('400:kurban_number gerekli')

  const res = await fetch(`${REST_URL}/processing_status?kurban_number=eq.${kurban_number}`, {
    method: 'PATCH',
    headers: dbHeadersMinimal,
    body: JSON.stringify({
      status: 'completed',
      completed_at: new Date().toISOString(),
      updated_by: user.sub,
    }),
  })
  if (!res.ok) throw new Error('500:İşlem tamamlanamadı')
  return { success: true }
}

async function handleUpdateMasaDetails(data: Record<string, unknown>, user: Record<string, unknown>) {
  const { kurban_number, masa_number, hisse_count, et_kg, kemik_kg } = data
  if (!kurban_number || !masa_number) throw new Error('400:kurban_number ve masa_number gerekli')

  const res = await fetch(`${REST_URL}/masa_details`, {
    method: 'POST',
    headers: { ...dbHeadersMinimal, 'Prefer': 'return=minimal,resolution=merge-duplicates' },
    body: JSON.stringify({
      kurban_number,
      masa_number,
      hisse_count: hisse_count ?? null,
      et_kg: et_kg ?? null,
      kemik_kg: kemik_kg ?? null,
      updated_at: new Date().toISOString(),
      updated_by: user.sub,
    }),
  })
  if (!res.ok) throw new Error('500:Masa detayları kaydedilemedi')
  return { success: true }
}

// ---- Main handler ----

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { action, ...data } = body
    let result: unknown

    switch (action) {
      // Auth (no JWT required)
      case 'login':
        result = await handleLogin(data)
        break

      // Auth (admin only)
      case 'create-user': {
        const user = await requireAuth(req)
        requireRole(user, 'admin')
        result = await handleCreateUser(data, user)
        break
      }
      case 'list-users': {
        const user = await requireAuth(req)
        requireRole(user, 'admin')
        result = await handleListUsers()
        break
      }
      case 'delete-user': {
        const user = await requireAuth(req)
        requireRole(user, 'admin')
        result = await handleDeleteUser(data, user)
        break
      }

      // Settings
      case 'get-settings': {
        await requireAuth(req)
        result = await handleGetSettings()
        break
      }
      case 'update-settings': {
        const user = await requireAuth(req)
        requireRole(user, 'admin')
        result = await handleUpdateSettings(data)
        break
      }
      case 'initialize-kurban': {
        const user = await requireAuth(req)
        requireRole(user, 'admin')
        result = await handleInitializeKurban(data)
        break
      }

      // Kesim (kesim + admin)
      case 'update-kesim-status': {
        const user = await requireAuth(req)
        requireRole(user, 'admin', 'kesim')
        result = await handleUpdateKesimStatus(data)
        break
      }

      // Parcalama (parcalama + admin)
      case 'assign-to-masa': {
        const user = await requireAuth(req)
        requireRole(user, 'admin', 'parcalama')
        result = await handleAssignToMasa(data, user)
        break
      }
      case 'complete-processing': {
        const user = await requireAuth(req)
        requireRole(user, 'admin', 'parcalama')
        result = await handleCompleteProcessing(data, user)
        break
      }
      case 'update-masa-details': {
        const user = await requireAuth(req)
        requireRole(user, 'admin', 'parcalama')
        result = await handleUpdateMasaDetails(data, user)
        break
      }

      default:
        throw new Error('400:Bilinmeyen action: ' + action)
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    const msg = (error as Error).message || 'Beklenmeyen hata'
    const [code, text] = msg.includes(':') ? msg.split(':') : ['500', msg]
    const statusCode = parseInt(code) || 500
    return new Response(JSON.stringify({ error: text }), {
      status: statusCode,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
