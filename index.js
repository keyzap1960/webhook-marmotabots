const express = require('express');
const admin = require('firebase-admin');

const app = express();
app.use(express.json());

const VERIFY_TOKEN = 'marmotabots123';
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// CORS para Flutter web
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Verificación webhook WhatsApp
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

// Recibir mensajes WhatsApp
app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;
    if (body.object === 'whatsapp_business_account') {
      const messages = body.entry?.[0]?.changes?.[0]?.value?.messages;
      if (messages && messages.length > 0) {
        const msg = messages[0];
        const from = msg.from;
        const text = msg.text?.body || '';
        const timestamp = new Date(parseInt(msg.timestamp) * 1000);

        const usersSnap = await db.collection('users').where('whatsapp', '==', from).get();
        if (!usersSnap.empty) {
          const userId = usersSnap.docs[0].id;
          await db.collection('users').doc(userId).collection('chats').add({
            message: text, from: from, timestamp: timestamp, isBot: false, platform: 'whatsapp'
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

// Claude bot
app.post('/claude', async (req, res) => {
  try {
    const { message, products, history } = req.body;

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
        max_tokens: 1024,
        system: 'Eres un asistente de ventas experto y amigable. ' + (products || ''),
        messages: messages,
      }),
    });

    const data = await response.json();
    res.json({ text: data.content[0].text });
  } catch (e) {
    console.error('Error Claude:', e);
    res.status(500).json({ text: 'Error al procesar tu mensaje.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Webhook corriendo en puerto ' + PORT));
