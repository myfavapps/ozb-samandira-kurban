import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const botToken = Deno.env.get('BOT_TOKEN')!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

serve(async (req) => {
  try {
    const { message } = await req.json()
    if (!message || !message.text) return new Response('OK')

    const parts = message.text.split(' ')
    const command = parts[0]
    const arg = parts[1]

    let reply = ''

    switch(command) {
      case '/kesilecek':
        if (!arg) { reply = 'Kurban numarasi gerekli'; break }
        await updateStatus('waiting', parseInt(arg))
        reply = `Kurban #${arg} kesim bekliyor`
        break

      case '/kesiliyor':
        if (!arg) { reply = 'Kurban numarasi gerekli'; break }
        await updateStatus('in_progress', parseInt(arg))
        reply = `Kurban #${arg} kesiliyor`
        break

      case '/kesildi':
        if (!arg) { reply = 'Kurban numarasi gerekli'; break }
        await updateStatus('completed', parseInt(arg))
        reply = `Kurban #${arg} kesimi tamamlandi`
        break

      case '/iptal':
        if (!arg) { reply = 'Kurban numarasi gerekli'; break }
        await updateStatus('cancelled', parseInt(arg))
        reply = `Kurban #${arg} iptal edildi`
        break

      case '/duyuru':
        const msg = parts.slice(1).join(' ')
        if (!msg) { reply = 'Duyuru mesaji gerekli'; break }
        await updateAnnouncement(msg)
        reply = `Duyuru guncellendi`
        break

      default:
        reply = 'Komutlar: /kesilecek, /kesiliyor, /kesildi, /iptal, /duyuru'
    }

    await sendMessage(message.chat.id, reply)
    return new Response('OK')

  } catch (error) {
    console.error('Error:', error)
    return new Response('Error', { status: 500 })
  }
})

async function updateStatus(status: string, number: number) {
  await supabase.from('slaughter_status').insert({
    current_number: number,
    status: status,
    last_updated: new Date().toISOString()
  })
}

async function updateAnnouncement(message: string) {
  await supabase.from('announcements').insert({
    message: message,
    type: 'info'
  })
}

async function sendMessage(chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: text })
  })
}
