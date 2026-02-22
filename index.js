const express = require('express');
const admin = require('firebase-admin');
const app = express();
app.use(express.json());

// Configuración
const VERIFY_TOKEN = 'marmotabots123';
const WHATSAPP_TOKEN = 'EAAU2SrMo5lMBQ1y2UmIp2SINHcG5Y7PZBYGw2ZA6lUjVXObcoIvcLHomyLD83OJcmhI5PtorZCLKzpZBMgC3yhX9vSPI5erCvvNbfI4eAJiSBc926KoEqZBwAbS23dZCZAkUdwSyfLJGceyhxQI4cM4LC6RQZCH0Uw02tZCP9rBZB5ekJlgNzpgqtReZBh7TTZAcTvMCEpn40CLcn7hdN1TNDx0frEN0h9354DlGwxpiN9SsK6oYwK6FcWo478SWcaJbFhSjo8SEAD4bstBEK8KRvzVY';
const PHONE_NUMBER_ID = '947807115089437';

// Firebase Admin
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

// Verificación webhook
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

// Recibir mensajes
app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;
    if (body.object === 'whatsapp_business_account') {
      const entry = body.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;
      const messages = value?.messages;

      if (messages && messages.length > 0) {
        const msg = messages[0];
        const from = msg.from;
        const text = msg.text?.body || '';
        const timestamp = new Date(parseInt(msg.timestamp) * 1000);

        // Buscar usuario que tenga ese número de WhatsApp
        const usersSnap = await db.collection('users')
          .where('whatsapp', '==', from).get();

        if (!usersSnap.empty) {
          const userDoc = usersSnap.docs[0];
          const userId = userDoc.id;

          // Guardar mensaje en Firestore
          await db.collection('users').doc(userId)
            .collection('chats').add({
              message: text,
              from: from,
              timestamp: timestamp,
              isBot: false,
              platform: 'whatsapp'
            });

          console.log(`Mensaje de ${from}: ${text}`);
        }
      }
    }
    res.sendStatus(200);
  } catch (e) {
    console.error('Error:', e);
    res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Webhook corriendo en puerto ' + PORT));
