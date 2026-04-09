import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const BOT_TOKEN = Deno.env.get('BOT_TOKEN')!
const CLOUDINARY_CLOUD_NAME = Deno.env.get('CLOUDINARY_CLOUD_NAME') || ''
const CLOUDINARY_API_KEY = Deno.env.get('CLOUDINARY_API_KEY') || ''
const CLOUDINARY_API_SECRET = Deno.env.get('CLOUDINARY_API_SECRET') || ''
const REST_URL = `${SUPABASE_URL}/rest/v1`
const headers = {
  'apikey': SUPABASE_SERVICE_KEY,
  'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=minimal',
}

serve(async (req) => {
  try {
    const { message } = await req.json()
    
    if (!message) {
      return new Response('OK')
    }

    const chatId = message.chat.id

    // Handle video uploads with /video caption
    if (message.video && message.caption && message.caption.trim().startsWith('/video')) {
      const responseText = await handleVideoUpload(message)
      await sendMessage(chatId, responseText)
      return new Response('OK')
    }

    if (!message.text) {
      return new Response('OK')
    }

    const [command, ...args] = message.text.split(' ')
    
    let responseText = ''

    switch(command) {
      case '/kesilecek':
        if (!args[0]) {
          responseText = '❌ Kullanım: /kesilecek [numara]'
        } else {
          await updateStatus('waiting', parseInt(args[0]))
          responseText = `✅ Kurban #${args[0]} kesim bekliyor olarak işaretlendi.`
        }
        break
        
      case '/kesiliyor':
        if (!args[0]) {
          responseText = '❌ Kullanım: /kesiliyor [numara]'
        } else {
          await updateStatus('in_progress', parseInt(args[0]))
          responseText = `🔪 Kurban #${args[0]} şu an kesiliyor.`
        }
        break
        
      case '/kesildi':
        if (!args[0]) {
          responseText = '❌ Kullanım: /kesildi [numara]'
        } else {
          await updateStatus('completed', parseInt(args[0]))
          responseText = `✅ Kurban #${args[0]} kesimi tamamlandı.`
        }
        break
        
      case '/iptal':
        if (!args[0]) {
          responseText = '❌ Kullanım: /iptal [numara]'
        } else {
          await updateStatus('cancelled', parseInt(args[0]))
          responseText = `❌ Kurban #${args[0]} iptal edildi.`
        }
        break

      case '/isleniyor':
        if (!args[0] || !args[1]) {
          responseText = '❌ Kullanım: /isleniyor [kurban_no] [masa_no]'
        } else {
          await updateProcessing('processing', parseInt(args[0]), parseInt(args[1]))
          responseText = `🔧 Kurban #${args[0]} ${args[1]} nolu masada parçalanıyor.`
        }
        break

      case '/islendi':
        if (!args[0] || !args[1]) {
          responseText = '❌ Kullanım: /islendi [kurban_no] [masa_no]'
        } else {
          await updateProcessing('completed', parseInt(args[0]), parseInt(args[1]))
          responseText = `✅ Kurban #${args[0]} ${args[1]} nolu masada parçalama tamamlandı.`
        }
        break
        
      case '/duyuru':
        if (!args.length) {
          responseText = '❌ Kullanım: /duyuru [mesaj]'
        } else {
          const messageText = args.join(' ')
          await updateAnnouncement(messageText)
          responseText = `📢 Duyuru güncellendi: ${messageText}`
        }
        break
        
      case '/bilgi':
        if (!args.length) {
          responseText = '❌ Kullanım: /bilgi [mesaj]'
        } else {
          const bilgiText = args.join(' ')
          await addInfoMessage(bilgiText)
          responseText = `ℹ️ Bilgi mesajı eklendi: ${bilgiText}`
        }
        break

      case '/bilgi_list': {
        const msgs = await listInfoMessages()
        if (msgs.length === 0) {
          responseText = 'ℹ️ Henüz bilgi mesajı yok.'
        } else {
          responseText = '📋 Bilgi Mesajları:\n\n' + msgs.map((m: Record<string, unknown>) =>
            `#${m.id} - ${m.message}`
          ).join('\n')
        }
        break
      }

      case '/bilgi_sil':
        if (!args[0]) {
          responseText = '❌ Kullanım: /bilgi_sil [id]'
        } else {
          await deleteInfoMessage(parseInt(args[0]))
          responseText = `✅ Bilgi mesajı #${args[0]} silindi.`
        }
        break

      case '/start':
      case '/yardim':
        responseText = `🐄 Samandıra Kurban Bot Komutları:

📋 Kesim:
/kesilecek [numara] - Kesim bekliyor
/kesiliyor [numara] - Kesiliyor  
/kesildi [numara] - Kesim tamamlandı
/iptal [numara] - Kesim iptal

🔧 Parçalama:
/isleniyor [kurban_no] [masa_no] - Parçalanıyor
/islendi [kurban_no] [masa_no] - Parçalama tamam

📹 Video:
/video [numara] - Video dosyası ile birlikte gönderin

📢 Diğer:
/duyuru [mesaj] - Duyuru güncelle
/bilgi [mesaj] - Bilgi mesajı ekle
/bilgi_list - Bilgi mesajlarını listele
/bilgi_sil [id] - Bilgi mesajı sil
/yardim - Bu mesajı göster`
        break
        
      default:
        responseText = '❓ Bilinmeyen komut. /yardim yazarak komutları görebilirsiniz.'
    }

    await sendMessage(chatId, responseText)

    return new Response('OK')
    
  } catch (error) {
    console.error('Error:', error)
    return new Response('Error', { status: 500 })
  }
})

async function updateStatus(status: string, number: number) {
  // Try to update existing row by kurban_number
  const patchRes = await fetch(`${REST_URL}/slaughter_status?kurban_number=eq.${number}`, {
    method: 'PATCH',
    headers: { ...headers, 'Prefer': 'return=representation' },
    body: JSON.stringify({
      status,
      current_number: number,
      last_updated: new Date().toISOString(),
    }),
  })
  
  if (patchRes.ok) {
    const data = await patchRes.json()
    if (data && data.length > 0) return // Updated existing row
  }

  // Row doesn't exist, insert new one
  const insRes = await fetch(`${REST_URL}/slaughter_status`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      kurban_number: number,
      current_number: number,
      status,
      last_updated: new Date().toISOString(),
    }),
  })
  if (!insRes.ok) console.error('Insert error:', insRes.status, await insRes.text())
}

async function updateProcessing(status: string, kurbanNumber: number, masaNumber: number) {
  if (status === 'completed') {
    // Update existing row
    const res = await fetch(`${REST_URL}/processing_status?kurban_number=eq.${kurbanNumber}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        status: 'completed',
        masa_number: masaNumber,
        completed_at: new Date().toISOString(),
      }),
    })
    if (!res.ok) console.error('Processing update error:', res.status, await res.text())
  } else {
    // Upsert: insert or update
    const res = await fetch(`${REST_URL}/processing_status`, {
      method: 'POST',
      headers: { ...headers, 'Prefer': 'return=minimal,resolution=merge-duplicates' },
      body: JSON.stringify({
        kurban_number: kurbanNumber,
        masa_number: masaNumber,
        status: 'processing',
        started_at: new Date().toISOString(),
        completed_at: null,
      }),
    })
    if (!res.ok) console.error('Processing insert error:', res.status, await res.text())
  }
}

async function updateAnnouncement(message: string) {
  await fetch(`${REST_URL}/announcements?id=gte.0`, {
    method: 'DELETE',
    headers,
  })
  await fetch(`${REST_URL}/announcements`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ message, type: 'info' }),
  })
}

async function addInfoMessage(message: string) {
  await fetch(`${REST_URL}/info_messages`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ message }),
  })
}

async function listInfoMessages(): Promise<Record<string, unknown>[]> {
  const res = await fetch(`${REST_URL}/info_messages?select=id,message,created_at&order=created_at.desc`, {
    headers,
  })
  if (!res.ok) return []
  return await res.json()
}

async function deleteInfoMessage(id: number) {
  await fetch(`${REST_URL}/info_messages?id=eq.${id}`, {
    method: 'DELETE',
    headers,
  })
}

async function sendMessage(chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  })
}

// ---- Video upload to Cloudinary ----

async function handleVideoUpload(message: Record<string, unknown>): Promise<string> {
  try {
    const caption = (message.caption as string).trim()
    const parts = caption.split(/\s+/)
    const kurbanNumber = parseInt(parts[1])
    if (!kurbanNumber || kurbanNumber < 1) {
      return '❌ Kullanım: /video [numara] (video dosyası ile birlikte gönderin)'
    }

    if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
      return '❌ Cloudinary ayarları yapılmamış. Yönetici ile iletişime geçin.'
    }

    const video = message.video as Record<string, unknown>
    const fileId = video.file_id as string

    // 1. Get file path from Telegram
    const fileRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`)
    if (!fileRes.ok) return '❌ Video dosyası alınamadı.'
    const fileData = await fileRes.json()
    const filePath = fileData.result?.file_path
    if (!filePath) return '❌ Video dosya yolu bulunamadı.'

    // 2. Download file from Telegram
    const downloadUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`
    const downloadRes = await fetch(downloadUrl)
    if (!downloadRes.ok) return '❌ Video indirilemedi.'
    const videoBlob = await downloadRes.blob()

    // 3. Upload to Cloudinary (signed upload)
    const timestamp = Math.floor(Date.now() / 1000)
    const publicId = `kurban-${kurbanNumber}`
    const paramsToSign = `overwrite=true&public_id=${publicId}&timestamp=${timestamp}${CLOUDINARY_API_SECRET}`
    const signatureHash = await sha1(paramsToSign)

    const formData = new FormData()
    formData.append('file', videoBlob, `kurban-${kurbanNumber}.mp4`)
    formData.append('public_id', publicId)
    formData.append('overwrite', 'true')
    formData.append('timestamp', String(timestamp))
    formData.append('api_key', CLOUDINARY_API_KEY)
    formData.append('signature', signatureHash)

    const uploadRes = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`,
      { method: 'POST', body: formData }
    )
    if (!uploadRes.ok) {
      const errText = await uploadRes.text()
      console.error('Cloudinary upload error:', errText)
      return '❌ Video Cloudinary\'ye yüklenemedi.'
    }
    const uploadData = await uploadRes.json()
    const secureUrl = uploadData.secure_url

    // 4. Save to DB (upsert: try update then insert)
    const dbBody = {
      kurban_number: kurbanNumber,
      cloudinary_url: secureUrl,
      uploaded_at: new Date().toISOString(),
    }

    const patchRes = await fetch(`${REST_URL}/videos?kurban_number=eq.${kurbanNumber}`, {
      method: 'PATCH',
      headers: { ...headers, 'Prefer': 'return=representation' },
      body: JSON.stringify(dbBody),
    })
    if (patchRes.ok) {
      const updated = await patchRes.json()
      if (!updated || updated.length === 0) {
        // Row doesn't exist, insert
        await fetch(`${REST_URL}/videos`, {
          method: 'POST',
          headers,
          body: JSON.stringify(dbBody),
        })
      }
    }

    return `✅ Kurban #${kurbanNumber} videosu yüklendi!\n🔗 ${secureUrl}`
  } catch (error) {
    console.error('Video upload error:', error)
    return '❌ Video yükleme sırasında hata oluştu.'
  }
}

async function sha1(message: string): Promise<string> {
  const data = new TextEncoder().encode(message)
  const hash = await crypto.subtle.digest('SHA-1', data)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}
