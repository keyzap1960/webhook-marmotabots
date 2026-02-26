const express = require('express');
const admin = require('firebase-admin');

const app = express();
app.use(express.json());

const VERIFY_TOKEN = 'marmotabots123';
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = '947807115089437';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;
    if (body.object === 'whatsapp_business_account') {
      const messages = body.entry?.[0]?.changes?.[0]?.value?.messages;
      if (messages && messages.length > 0) {
        const msg = messages[0];
        const from = msg.from;
        const text = msg.text?.body || '';
        const usersSnap = await db.collection('users').where('whatsapp', '==', from).get();
        let userId = null;
        let products = '';
        if (!usersSnap.empty) {
          userId = usersSnap.docs[0].id;
          await db.collection('users').doc(userId).collection('chats').add({
            message: text, from: from, timestamp: new Date(), isBot: false, platform: 'whatsapp'
          });
          const productsSnap = await db.collection('users').doc(userId).collection('products').get();
          if (!productsSnap.empty) {
            products = productsSnap.docs.map(d =>
              `- ${d.data().name}: $${d.data().price} - ${d.data().description || ''}`
            ).join('\n');
          }
        }
        const botReply = await getCloudeResponse(text, products, []);
        await fetch(`https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${WHATSAPP_TOKEN}` },
          body: JSON.stringify({ messaging_product: 'whatsapp', to: from, type: 'text', text: { body: botReply } }),
        });
        if (userId) {
          await db.collection('users').doc(userId).collection('chats').add({
            message: botReply, from: 'bot', timestamp: new Date(), isBot: true, platform: 'whatsapp'
          });
        }
      }
    }
    res.sendStatus(200);
  } catch (e) {
    console.error('Error webhook:', e);
    res.sendStatus(500);
  }
});

app.post('/claude', async (req, res) => {
  try {
    const { message, products, history } = req.body;
    const text = await getCloudeResponse(message, products, history);
    res.json({ text });
  } catch (e) {
    console.error('Error Claude:', e);
    res.status(500).json({ text: 'Lo siento, ocurrió un error.' });
  }
});

async function getCloudeResponse(message, products, history) {
  const messages = history && history.length > 0
    ? [...history, { role: 'user', content: message }]
    : [{ role: 'user', content: message }];

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system: `Eres Mia, una asistente de ventas humana, cálida y natural. NUNCA digas que eres IA.
Habla como una persona real, de forma corta y amigable. Máximo 3 líneas por respuesta.
No uses asteriscos ni markdown. Usa emojis con moderación.
Si preguntan por productos muestra máximo 3 opciones y pregunta qué le interesa más.
${products ? 'Productos disponibles:\n' + products : ''}`,
      messages,
    }),
  });

  const data = await response.json();
  return data.content?.[0]?.text || '¡Hola! ¿En qué te puedo ayudar?';
}

app.get('/', (req, res) => res.json({ status: 'MarmotaBots ✅' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Servidor corriendo en puerto ' + PORT));
