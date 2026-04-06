// Supabase Edge Function: Telegram Bot Webhook Handler
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const BOT_TOKEN = Deno.env.get('BOT_TOKEN')!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

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
        
      case '/duyuru':
        if (!args.length) {
          responseText = '❌ Kullanım: /duyuru [mesaj]'
        } else {
          const messageText = args.join(' ')
          await updateAnnouncement(messageText)
          responseText = `📢 Duyuru güncellendi: ${messageText}`
        }
        break
        
      case '/video':
        // Video işleme - Cloudinary entegrasyonu gerekiyor
        responseText = '📹 Video işleme için: Videoyu doğrudan gönderin veya /video [numara] [cloudinary_url]'
        break
        
      case '/start':
      case '/yardim':
        responseText = `🐄 Samandıra Kurban Bot Komutları:

/kesilecek [numara] - Kurban kesim bekliyor
/kesiliyor [numara] - Kurban kesiliyor  
/kesildi [numara] - Kurban kesimi tamamlandı
/iptal [numara] - Kurban kesimi iptal edildi
/duyuru [mesaj] - Duyuru güncelle
/video [numara] - Video ekle
/yardim - Bu mesajı göster`
        break
        
      default:
        responseText = '❓ Bilinmeyen komut. /yardim yazarak komutları görebilirsiniz.'
    }

    // Send response via Telegram API
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
  await supabase
    .from('slaughter_status')
    .upsert({ 
      current_number: number, 
      status,
      last_updated: new Date().toISOString()
    })
}

async function updateAnnouncement(message: string) {
  await supabase
    .from('announcements')
    .insert({ message, type: 'info' })
}
