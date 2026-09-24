const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const admin = require('firebase-admin');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// 1. Inicializa o Express (O Render exige que o App escute em uma porta para não dar erro)
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('OmniChat Backend - Status: Online');
});

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});

// 2. Inicializa o Firebase (Precisaremos da chave do Firebase no painel do Render)
try {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log('Firebase conectado com sucesso!');
} catch (error) {
  console.error('Erro ao conectar no Firebase (Esqueceu de colocar a FIREBASE_SERVICE_ACCOUNT nas variáveis de ambiente do Render?):', error.message);
}

const db = admin.firestore();

// 3. Inicializa o Gemini IA
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// 4. Inicializa o WhatsApp
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    args: ['--no-sandbox', '--disable-setuid-sandbox'] // Essencial para rodar no Render!
  }
});

client.on('qr', (qr) => {
  console.log('📱 ESCANEIE O QR CODE ABAIXO NO SEU WHATSAPP:');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('✅ WhatsApp conectado com sucesso!');
});

// 5. Escuta as Mensagens e Conversa com a IA
client.on('message', async (msg) => {
  try {
    // Ignora mensagens de grupos
    const chat = await msg.getChat();
    if (chat.isGroup) return;

    console.log(`📩 Nova mensagem de ${msg.from}: ${msg.body}`);

    // Pega o "Perfil da IA" que nós salvamos no painel Flutter lá no Firebase
    const profileDoc = await db.collection('settings').doc('ai_profile').get();
    let prompt = "Você é um assistente prestativo.";
    let temperature = 0.7;

    if (profileDoc.exists) {
      const data = profileDoc.data();
      prompt = data.instructions || prompt;
      temperature = data.temperature || temperature;
    }

    // Chama o Gemini para responder
    const modelWithTemp = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      generationConfig: { temperature: temperature }
    });

    // Cria o contexto (Prompt do Sistema + Mensagem do usuário)
    // No Gemini, passamos o prompt do sistema no "systemInstruction"
    const finalModel = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      systemInstruction: prompt,
      generationConfig: { temperature: temperature }
    });

    const result = await finalModel.generateContent(msg.body);
    const responseText = result.response.text();

    // Responde no WhatsApp
    await msg.reply(responseText);

    // Salva a conversa no Firebase (para aparecer no nosso App Flutter)
    const contact = await msg.getContact();
    const chatData = {
      name: contact.pushname || contact.number || "Desconhecido",
      phone: contact.number,
      lastMessage: msg.body,
      status: "esperando",
      tag: "IA",
      time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      unreadCount: 1,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    // Usamos o número de telefone como ID do documento
    await db.collection('chats').doc(contact.number).set(chatData, { merge: true });

  } catch (error) {
    console.error('Erro ao processar mensagem:', error);
  }
});

client.initialize();
