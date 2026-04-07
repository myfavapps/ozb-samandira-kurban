import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const BOT_TOKEN = Deno.env.get('BOT_TOKEN')!
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
    
    if (!message || !message.text) {
      return new Response('OK')
    }

    const [command, ...args] = message.text.split(' ')
    const chatId = message.chat.id
    
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

📢 Diğer:
/duyuru [mesaj] - Duyuru güncelle
/yardim - Bu mesajı göster`
        break
        
      default:
        responseText = '❓ Bilinmeyen komut. /yardim yazarak komutları görebilirsiniz.'
    }

    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: responseText
      })
    })

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
