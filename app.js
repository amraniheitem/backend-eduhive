require('dotenv').config();
const express = require('express');
const { ApolloServer } = require('@apollo/server');
const { expressMiddleware } = require('@apollo/server/express4');
const mongoose = require('mongoose');
const cors = require('cors');

const typeDefs = require('./graphql/typeDefs');
const resolvers = require('./graphql/resolvers');
const { authenticate } = require('./Middleware/auth');
const uploadRoutes = require('./routes/upload');
const memoryUploadRoutes = require('./routes/upload.routes');

const app = express();

// ========================================
// ORDRE CORRECT DES MIDDLEWARES
// ========================================

// 1. CORS en premier
app.use(cors());

// 2. Routes avec fichiers AVANT express.json()
app.use('/upload', uploadRoutes); // ← DÉPLACER ICI
app.use('/memory', memoryUploadRoutes); // Upload PDF/Audio pour mémorisation

// 3. Ensuite les parsers JSON/URL-encoded
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => console.log('✅ MongoDB connecté'))
  .catch(err => console.error('❌ Erreur MongoDB:', err));

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date(),
    mongodb: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'
  });
});

app.get('/', (req, res) => {
  res.json({
    message: 'API EduPlatform',
    version: '1.0.0',
    endpoints: {
      graphql: '/graphql',
      health: '/health',
      upload: '/upload/video (POST) ou /upload/pdf (POST)'
    }
  });
});

// Apollo Server
const server = new ApolloServer({
  typeDefs,
  resolvers
});

async function startServer() {
  await server.start();

  app.use(
    '/graphql',
    cors(),
    express.json(),
    expressMiddleware(server, {
      context: async ({ req }) => {
        const auth = await authenticate(req);
        return auth;
      }
    })
  );

  const PORT = process.env.PORT || 8000;

  app.listen(PORT, () => {
    console.log(`🚀 Serveur démarré sur http://localhost:${PORT}`);
    console.log(`📊 GraphQL endpoint: http://localhost:${PORT}/graphql`);
    console.log(`📤 Upload endpoint: http://localhost:${PORT}/upload/video`);
  });
}

startServer().catch(err => {
  console.error('Erreur démarrage serveur:', err);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  mongoose.connection.close();
  process.exit(0);
});

module.exports = app;