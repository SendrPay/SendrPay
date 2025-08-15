import 'dotenv/config';
import { app } from './server';

const PORT = parseInt(process.env.PORT || '5000', 10); // Use port 5000 for main deployment

async function startWebServer() {
  try {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🌐 SendrPay Web server running on port ${PORT}`);
      console.log(`📱 Access at: http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start web server:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  startWebServer();
}

export { startWebServer };