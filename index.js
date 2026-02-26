const express = require('express');
const app = express();

app.use(express.json());

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === 'marmotabots123') {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post('/webhook', (req, res) => {
  res.sendStatus(200);
});

app.post('/claude', async (req, res) => {
  try {
    const { message, products, history } = req.body;
    if (!message) return res.status(400).json({ error: 'Mensaje requerido' });

    const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
    if (!CLAUDE_API_KEY) return res.status(500).json({ error: 'API key no configurada' });

    const messages = [];
    if (history && history.length > 0) {
      for (const msg of history) {
        messages.push({ role: msg.role === 'assistant' ? 'assistant' : 'user', content: msg.content });
      }
    }
    messages.push({ role: 'user', content: message });

    const systemPrompt = `Eres un asesor de ventas real llamado "Mia". Trabajas para este negocio y conoces todos sus productos.

CÓMO DEBES HABLAR:
- Como una persona real, cálida y cercana. Nada de robots.
- Respuestas CORTAS: máximo 3 líneas. Si el cliente quiere más info, él pregunta.
- NUNCA listes todo el catálogo de una vez. Pregunta qué necesita primero.
- Usa UN emoji máximo por mensaje, no en cada línea.
- NUNCA uses asteriscos (**) ni markdown. Solo texto normal.
- Si no sabes algo, dilo con naturalidad: "Eso sí no te puedo confirmar ahora mismo"
- Cuando el cliente muestre interés, guíalo suavemente hacia la compra.
- Habla como si estuvieras en WhatsApp con un amigo, pero profesional.

EJEMPLOS DE CÓMO RESPONDER:
Cliente: "¿Qué tienen?"
Tú: "Hola! Cuéntame, ¿qué estás buscando? Así te muestro lo que más te conviene 😊"

Cliente: "¿Cuánto cuesta el producto X?"
Tú: "El X está en $XX. ¿Te lo enviamos o prefieres pasar a recogerlo?"

Cliente: "Quiero comprar"
Tú: "Perfecto! Te confirmo la disponibilidad ahora mismo. ¿A qué dirección te lo mandamos?"

${products ? 'PRODUCTOS DEL NEGOCIO:\n' + products : 'Por el momento no hay productos cargados.'}

Recuerda: eres Mia, una persona real. Nunca digas que eres una IA o un bot.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: systemPrompt,
        messages: messages
      })
    });

    const data = await response.json();
    if (data.content && data.content[0]) {
      return res.json({ text: data.content[0].text });
    } else {
      console.error('Error Claude:', JSON.stringify(data));
      return res.json({ text: 'Hola! Estoy aquí para ayudarte. ¿Qué necesitas?' });
    }
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ text: 'Perdona, tuve un problemita. ¿Me repites?' });
  }
});

app.get('/', (req, res) => {
  res.json({ status: 'MarmotaBots server corriendo ✅' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Servidor corriendo en puerto ' + PORT));
