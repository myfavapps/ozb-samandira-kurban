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

function requirePermission(user: Record<string, unknown>, permission: string) {
  const permissions = user.permissions as string[] || []
  if (!permissions.includes(permission)) throw new Error('403:Bu işlem için yetkiniz yok')
}

function requireAdmin(user: Record<string, unknown>) {
  if (user.role !== 'admin') throw new Error('403:Bu işlem için admin yetkisi gerekli')
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

  // Fetch role permissions from roles table
  const roles = await dbQuery(`/roles?name=eq.${encodeURIComponent(user.role)}&select=permissions,default_page`)
  const roleData = roles && roles.length > 0 ? roles[0] : { permissions: [], default_page: 'durum.html' }

  const now = Math.floor(Date.now() / 1000)
  const token = await signJWT({
    sub: user.id,
    role: user.role,
    permissions: roleData.permissions,
    name: user.display_name,
    iat: now,
    exp: now + 86400, // 24 hours
  })

  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      display_name: user.display_name,
      permissions: roleData.permissions,
      default_page: roleData.default_page,
    },
  }
}

async function handleCreateUser(data: Record<string, unknown>, _user: Record<string, unknown>) {
  const { username, password, role, display_name } = data
  if (!username || !password || !role || !display_name) throw new Error('400:Tüm alanlar gerekli')

  // Validate role exists in DB
  const roleCheck = await dbQuery(`/roles?name=eq.${encodeURIComponent(role as string)}&select=name`)
  if (!roleCheck || roleCheck.length === 0) throw new Error('400:Geçersiz rol')

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

async function handleUpdateUserPassword(data: Record<string, unknown>) {
  const { user_id, password } = data
  if (!user_id || !password) throw new Error('400:user_id ve password gerekli')
  if ((password as string).length < 4) throw new Error('400:Şifre en az 4 karakter olmalı')

  const salt = generateSalt()
  const password_hash = await hashPassword(password as string, salt)

  await dbMutate(`/users?id=eq.${user_id}`, 'PATCH', { password_hash, salt })
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

  const body = {
    kurban_number,
    masa_number,
    status: 'processing',
    started_at: new Date().toISOString(),
    completed_at: null,
    updated_by: user.sub,
  }

  // Try update existing
  const patchRes = await fetch(
    `${REST_URL}/processing_status?kurban_number=eq.${kurban_number}`,
    { method: 'PATCH', headers: { ...dbHeaders, 'Prefer': 'return=representation' }, body: JSON.stringify(body) }
  )
  if (patchRes.ok) {
    const updated = await patchRes.json()
    if (updated && updated.length > 0) return { success: true }
  }

  // Insert new
  const postRes = await fetch(`${REST_URL}/processing_status`, {
    method: 'POST',
    headers: dbHeadersMinimal,
    body: JSON.stringify(body),
  })
  if (!postRes.ok) throw new Error('500:Masa ataması yapılamadı')
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

  const body = {
    kurban_number,
    masa_number,
    hisse_count: hisse_count ?? null,
    et_kg: et_kg ?? null,
    kemik_kg: kemik_kg ?? null,
    updated_at: new Date().toISOString(),
    updated_by: user.sub,
  }

  // Try update existing row first
  const patchRes = await fetch(
    `${REST_URL}/masa_details?kurban_number=eq.${kurban_number}&masa_number=eq.${masa_number}`,
    { method: 'PATCH', headers: { ...dbHeaders, 'Prefer': 'return=representation' }, body: JSON.stringify(body) }
  )
  if (patchRes.ok) {
    const updated = await patchRes.json()
    if (updated && updated.length > 0) return { success: true }
  }

  // Row doesn't exist, insert
  const postRes = await fetch(`${REST_URL}/masa_details`, {
    method: 'POST',
    headers: dbHeadersMinimal,
    body: JSON.stringify(body),
  })
  if (!postRes.ok) {
    const text = await postRes.text()
    console.error('Masa insert error:', text)
    throw new Error('500:Masa detayları kaydedilemedi')
  }
  return { success: true }
}

// ---- Info Messages (Bilgi) handlers ----

async function handleListInfoMessages() {
  const messages = await dbQuery('/info_messages?select=*&order=created_at.desc')
  return { messages: messages || [] }
}

async function handleAddInfoMessage(data: Record<string, unknown>) {
  const { message } = data
  if (!message) throw new Error('400:message gerekli')

  const res = await fetch(`${REST_URL}/info_messages`, {
    method: 'POST',
    headers: { ...dbHeaders, 'Prefer': 'return=representation' },
    body: JSON.stringify({ message }),
  })
  if (!res.ok) throw new Error('500:Bilgi mesajı eklenemedi')
  const created = await res.json()
  return { success: true, info: created[0] }
}

async function handleUpdateInfoMessage(data: Record<string, unknown>) {
  const { id, message } = data
  if (!id || !message) throw new Error('400:id ve message gerekli')

  const res = await fetch(`${REST_URL}/info_messages?id=eq.${id}`, {
    method: 'PATCH',
    headers: dbHeadersMinimal,
    body: JSON.stringify({ message }),
  })
  if (!res.ok) throw new Error('500:Bilgi mesajı güncellenemedi')
  return { success: true }
}

async function handleDeleteInfoMessage(data: Record<string, unknown>) {
  const { id } = data
  if (!id) throw new Error('400:id gerekli')

  await dbMutate(`/info_messages?id=eq.${id}`, 'DELETE')
  return { success: true }
}

// ---- Announcement (Duyuru) handlers ----

async function handleGetAnnouncement() {
  const announcements = await dbQuery('/announcements?select=*&order=created_at.desc&limit=1')
  return { announcement: (announcements && announcements.length > 0) ? announcements[0] : null }
}

async function handleUpdateAnnouncement(data: Record<string, unknown>) {
  const { message } = data
  if (!message && message !== '') throw new Error('400:message gerekli')

  // Delete all existing
  await fetch(`${REST_URL}/announcements?id=gte.0`, { method: 'DELETE', headers: dbHeadersMinimal })

  if (message) {
    await fetch(`${REST_URL}/announcements`, {
      method: 'POST',
      headers: dbHeadersMinimal,
      body: JSON.stringify({ message, type: 'info' }),
    })
  }
  return { success: true }
}

// ---- Live Stream handlers ----

async function handleToggleStream(data: Record<string, unknown>) {
  const { active } = data
  if (typeof active !== 'boolean') throw new Error('400:active (boolean) gerekli')

  await fetch(`${REST_URL}/settings?key=eq.live_stream_active`, {
    method: 'PATCH',
    headers: dbHeadersMinimal,
    body: JSON.stringify({ value: String(active), updated_at: new Date().toISOString() }),
  })
  return { success: true, active }
}

// ---- Video handlers ----

async function handleListVideos() {
  const videos = await dbQuery('/videos?select=*&order=kurban_number.asc')
  return { videos: videos || [] }
}

async function handleDeleteVideo(data: Record<string, unknown>) {
  const { video_id } = data
  if (!video_id) throw new Error('400:video_id gerekli')

  await dbMutate(`/videos?id=eq.${video_id}`, 'DELETE')
  return { success: true }
}

async function handleAddVideo(data: Record<string, unknown>) {
  const { kurban_number, cloudinary_url } = data
  if (!kurban_number || !cloudinary_url) throw new Error('400:kurban_number ve cloudinary_url gerekli')

  const body = {
    kurban_number,
    cloudinary_url,
    uploaded_at: new Date().toISOString(),
  }

  // Try update existing row first
  const patchRes = await fetch(
    `${REST_URL}/videos?kurban_number=eq.${kurban_number}`,
    { method: 'PATCH', headers: { ...dbHeaders, 'Prefer': 'return=representation' }, body: JSON.stringify(body) }
  )
  if (patchRes.ok) {
    const updated = await patchRes.json()
    if (updated && updated.length > 0) return { success: true }
  }

  // Row doesn't exist, insert
  const postRes = await fetch(`${REST_URL}/videos`, {
    method: 'POST',
    headers: dbHeadersMinimal,
    body: JSON.stringify(body),
  })
  if (!postRes.ok) throw new Error('500:Video kaydedilemedi')
  return { success: true }
}

// ---- Role CRUD handlers ----

async function handleListRoles() {
  const roles = await dbQuery('/roles?select=*&order=name.asc')
  return { roles: roles || [] }
}

async function handleCreateRole(data: Record<string, unknown>) {
  const { name, display_name, permissions, default_page } = data
  if (!name || !display_name) throw new Error('400:name ve display_name gerekli')
  if (!/^[a-z][a-z0-9_]*$/.test(name as string)) throw new Error('400:Rol adı küçük harf, rakam ve alt çizgi içerebilir')

  const res = await fetch(`${REST_URL}/roles`, {
    method: 'POST',
    headers: { ...dbHeaders, 'Prefer': 'return=representation' },
    body: JSON.stringify({
      name,
      display_name,
      permissions: permissions || [],
      default_page: default_page || 'durum.html',
      is_system: false,
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    if (text.includes('duplicate')) throw new Error('400:Bu rol adı zaten mevcut')
    throw new Error('500:Rol oluşturulamadı')
  }
  const created = await res.json()
  return { role: created[0] }
}

async function handleUpdateRole(data: Record<string, unknown>) {
  const { name, display_name, permissions, default_page } = data
  if (!name) throw new Error('400:name gerekli')

  const updates: Record<string, unknown> = {}
  if (display_name !== undefined) updates.display_name = display_name
  if (permissions !== undefined) updates.permissions = permissions
  if (default_page !== undefined) updates.default_page = default_page

  if (Object.keys(updates).length === 0) throw new Error('400:Güncellenecek alan yok')

  const res = await fetch(`${REST_URL}/roles?name=eq.${encodeURIComponent(name as string)}`, {
    method: 'PATCH',
    headers: dbHeadersMinimal,
    body: JSON.stringify(updates),
  })
  if (!res.ok) throw new Error('500:Rol güncellenemedi')
  return { success: true }
}

async function handleDeleteRole(data: Record<string, unknown>) {
  const { name } = data
  if (!name) throw new Error('400:name gerekli')
  if (name === 'admin') throw new Error('400:Admin rolü silinemez')

  // Check system role
  const roleCheck = await dbQuery(`/roles?name=eq.${encodeURIComponent(name as string)}&select=is_system`)
  if (roleCheck && roleCheck.length > 0 && roleCheck[0].is_system) throw new Error('400:Sistem rolü silinemez')

  // Check if any active users have this role
  const users = await dbQuery(`/users?role=eq.${encodeURIComponent(name as string)}&is_active=eq.true&select=id`)
  if (users && users.length > 0) throw new Error('400:Bu role atanmış aktif kullanıcılar var')

  await dbMutate(`/roles?name=eq.${encodeURIComponent(name as string)}`, 'DELETE')
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

      // Admin-only: user management
      case 'create-user': {
        const user = await requireAuth(req)
        requireAdmin(user)
        result = await handleCreateUser(data, user)
        break
      }
      case 'list-users': {
        const user = await requireAuth(req)
        requireAdmin(user)
        result = await handleListUsers()
        break
      }
      case 'delete-user': {
        const user = await requireAuth(req)
        requireAdmin(user)
        result = await handleDeleteUser(data, user)
        break
      }
      case 'update-user-password': {
        const user = await requireAuth(req)
        requireAdmin(user)
        result = await handleUpdateUserPassword(data)
        break
      }

      // Admin-only: role management
      case 'list-roles': {
        const user = await requireAuth(req)
        requireAdmin(user)
        result = await handleListRoles()
        break
      }
      case 'create-role': {
        const user = await requireAuth(req)
        requireAdmin(user)
        result = await handleCreateRole(data)
        break
      }
      case 'update-role': {
        const user = await requireAuth(req)
        requireAdmin(user)
        result = await handleUpdateRole(data)
        break
      }
      case 'delete-role': {
        const user = await requireAuth(req)
        requireAdmin(user)
        result = await handleDeleteRole(data)
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
        requireAdmin(user)
        result = await handleUpdateSettings(data)
        break
      }
      case 'initialize-kurban': {
        const user = await requireAuth(req)
        requireAdmin(user)
        result = await handleInitializeKurban(data)
        break
      }

      // Kesim (permission: kesim)
      case 'update-kesim-status': {
        const user = await requireAuth(req)
        requirePermission(user, 'kesim')
        result = await handleUpdateKesimStatus(data)
        break
      }

      // Parcalama (permission: parcalama)
      case 'assign-to-masa': {
        const user = await requireAuth(req)
        requirePermission(user, 'parcalama')
        result = await handleAssignToMasa(data, user)
        break
      }
      case 'complete-processing': {
        const user = await requireAuth(req)
        requirePermission(user, 'parcalama')
        result = await handleCompleteProcessing(data, user)
        break
      }
      case 'update-masa-details': {
        const user = await requireAuth(req)
        requirePermission(user, 'parcalama')
        result = await handleUpdateMasaDetails(data, user)
        break
      }

      // Live Stream (permission: canli_yayin)
      case 'toggle-stream': {
        const user = await requireAuth(req)
        requirePermission(user, 'canli_yayin')
        result = await handleToggleStream(data)
        break
      }

      // Info Messages (permission: mesaj)
      case 'list-info-messages': {
        const user = await requireAuth(req)
        requirePermission(user, 'mesaj')
        result = await handleListInfoMessages()
        break
      }
      case 'add-info-message': {
        const user = await requireAuth(req)
        requirePermission(user, 'mesaj')
        result = await handleAddInfoMessage(data)
        break
      }
      case 'update-info-message': {
        const user = await requireAuth(req)
        requirePermission(user, 'mesaj')
        result = await handleUpdateInfoMessage(data)
        break
      }
      case 'delete-info-message': {
        const user = await requireAuth(req)
        requirePermission(user, 'mesaj')
        result = await handleDeleteInfoMessage(data)
        break
      }

      // Announcement (permission: mesaj)
      case 'get-announcement': {
        const user = await requireAuth(req)
        requirePermission(user, 'mesaj')
        result = await handleGetAnnouncement()
        break
      }
      case 'update-announcement': {
        const user = await requireAuth(req)
        requirePermission(user, 'mesaj')
        result = await handleUpdateAnnouncement(data)
        break
      }

      // Videos (permission: videolar)
      case 'list-videos': {
        const user = await requireAuth(req)
        requirePermission(user, 'videolar')
        result = await handleListVideos()
        break
      }
      case 'delete-video': {
        const user = await requireAuth(req)
        requirePermission(user, 'videolar')
        result = await handleDeleteVideo(data)
        break
      }
      case 'add-video': {
        const user = await requireAuth(req)
        requirePermission(user, 'videolar')
        result = await handleAddVideo(data)
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
