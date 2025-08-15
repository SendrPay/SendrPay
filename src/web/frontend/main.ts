// Frontend TypeScript entry point
interface TelegramWebApp {
  ready(): void;
  initData: string;
  close(): void;
  expand(): void;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp: TelegramWebApp;
    };
  }
}

class SendrPayApp {
  private baseUrl: string;

  constructor() {
    this.baseUrl = window.location.origin;
    this.init();
  }

  private async init() {
    // Check if running in Telegram WebApp
    if (window.Telegram?.WebApp) {
      this.handleTelegramWebApp();
    } else {
      this.showAuthOptions();
    }
  }

  private async handleTelegramWebApp() {
    const webApp = window.Telegram!.WebApp;
    webApp.ready();
    webApp.expand();

    const initData = webApp.initData;
    if (initData) {
      try {
        const response = await this.apiCall('/auth/tg', 'POST', { initData });
        if (response.success) {
          this.showDashboard();
        } else {
          this.showError('Telegram authentication failed');
        }
      } catch (error) {
        this.showError('Authentication error');
      }
    } else {
      this.showError('No Telegram data available');
    }
  }

  private showAuthOptions() {
    const app = document.getElementById('app');
    if (!app) return;

    app.innerHTML = `
      <div class="container">
        <div class="auth-card">
          <h1>SendrPay Web</h1>
          <p class="subtitle">Choose how to sign in:</p>
          
          <div class="auth-buttons">
            <a href="/auth/discord/start" class="auth-btn discord">
              <span>🎮</span>
              Continue with Discord
            </a>
            
            <button class="auth-btn twitter disabled" disabled>
              <span>🐦</span>
              Twitter (Coming Soon)
            </button>
            
            <button class="auth-btn email" onclick="window.sendpay.showEmailForm()">
              <span>📧</span>
              Continue with Email
            </button>
            
            <a href="https://t.me/SendrPayBot" class="auth-btn telegram">
              <span>💬</span>
              Open in Telegram
            </a>
          </div>
          
          <div id="emailForm" class="email-form" style="display: none;">
            <input type="email" id="email" placeholder="Enter your email" class="form-input">
            <button onclick="window.sendpay.sendMagicCode()" class="auth-btn primary">Send Magic Code</button>
            
            <div id="codeForm" class="code-form" style="display: none;">
              <input type="text" id="code" placeholder="Enter 6-digit code" class="form-input" maxlength="6">
              <button onclick="window.sendpay.verifyCode()" class="auth-btn primary">Verify Code</button>
            </div>
          </div>
        </div>
      </div>
    `;

    // Expose methods to global scope for onclick handlers
    (window as any).sendpay = {
      showEmailForm: () => this.showEmailForm(),
      sendMagicCode: () => this.sendMagicCode(),
      verifyCode: () => this.verifyCode()
    };
  }

  private showEmailForm() {
    const emailForm = document.getElementById('emailForm');
    if (emailForm) {
      emailForm.style.display = 'block';
    }
  }

  private async sendMagicCode() {
    const emailInput = document.getElementById('email') as HTMLInputElement;
    const email = emailInput?.value;

    if (!email || !email.includes('@')) {
      this.showToast('Please enter a valid email address', 'error');
      return;
    }

    try {
      const response = await this.apiCall('/auth/email/start', 'POST', { email });
      if (response.success) {
        document.getElementById('codeForm')!.style.display = 'block';
        this.showToast('Magic code sent to your email!', 'success');
      } else {
        this.showToast(response.error || 'Failed to send magic code', 'error');
      }
    } catch (error) {
      this.showToast('Error sending magic code', 'error');
    }
  }

  private async verifyCode() {
    const emailInput = document.getElementById('email') as HTMLInputElement;
    const codeInput = document.getElementById('code') as HTMLInputElement;
    
    const email = emailInput?.value;
    const code = codeInput?.value;

    if (!email || !code) {
      this.showToast('Please enter email and code', 'error');
      return;
    }

    try {
      const response = await this.apiCall('/auth/email/verify', 'POST', { email, code });
      if (response.success) {
        this.showDashboard();
      } else {
        this.showToast(response.error || 'Invalid or expired code', 'error');
      }
    } catch (error) {
      this.showToast('Error verifying code', 'error');
    }
  }

  private async showDashboard() {
    try {
      window.location.href = '/dashboard';
    } catch (error) {
      this.showError('Failed to load dashboard');
    }
  }

  private showError(message: string) {
    const app = document.getElementById('app');
    if (!app) return;

    app.innerHTML = `
      <div class="container">
        <div class="error-card">
          <h2>Error</h2>
          <p>${message}</p>
          <button onclick="window.location.reload()" class="auth-btn primary">Try Again</button>
        </div>
      </div>
    `;
  }

  private showToast(message: string, type: 'success' | 'error' = 'success') {
    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    // Add to document
    document.body.appendChild(toast);

    // Show toast
    setTimeout(() => toast.classList.add('show'), 100);

    // Remove toast after 3 seconds
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => document.body.removeChild(toast), 300);
    }, 3000);
  }

  private async apiCall(endpoint: string, method: 'GET' | 'POST' = 'GET', data?: any) {
    const config: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    };

    if (data && method === 'POST') {
      config.body = JSON.stringify(data);
    }

    const response = await fetch(this.baseUrl + endpoint, config);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new SendrPayApp();
});

export {};