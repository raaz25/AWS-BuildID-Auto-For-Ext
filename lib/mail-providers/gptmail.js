/**
 * GPTMail Provider - GPTMail 临时邮箱渠道
 * 需要 API Key 配置，支持随机生成邮箱前缀和域名
 *
 * API 文档: https://www.chatgpt.org.uk/2025/11/gptmailapiapi.html
 */

import { MailProvider } from '../mail-provider.js';

const API_URL = 'https://mail.chatgpt.org.uk';
const DEFAULT_API_KEY = 'gpt-test';

class GPTMailProvider extends MailProvider {
  static id = 'gptmail';
  static name = 'GPTMail';
  static needsConfig = true;
  static supportsAutoVerification = true;

  constructor(options = {}) {
    super();
    this.apiKey = options.apiKey || DEFAULT_API_KEY;
    this.processedMailIds = new Set();
  }

  /**
   * 设置 API Key
   */
  setApiKey(apiKey) {
    this.apiKey = apiKey || DEFAULT_API_KEY;
  }

  /**
   * 生成随机用户名前缀
   */
  _generateRandomPrefix(length = 10) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    result += 'abcdefghijklmnopqrstuvwxyz'.charAt(Math.floor(Math.random() * 26));
    for (let i = 1; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * 确保 offscreen document 已创建
   */
  async _ensureOffscreen() {
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT']
    });

    if (existingContexts.length > 0) {
      return;
    }

    await chrome.offscreen.createDocument({
      url: 'offscreen/offscreen.html',
      reasons: ['DOM_PARSER'],
      justification: 'Execute cross-origin requests with extension permissions'
    });
  }

  /**
   * 调用 GPTMail API（通过 offscreen document 代理）
   */
  async _callApi(endpoint, options = {}) {
    const separator = endpoint.includes('?') ? '&' : '?';
    const url = `${API_URL}${endpoint}${separator}api_key=${encodeURIComponent(this.apiKey)}`;

    console.log(`[GPTMailProvider] API 调用: ${endpoint}`);

    // 确保 offscreen document 存在
    await this._ensureOffscreen();

    // 通过 offscreen document 发起请求
    const response = await chrome.runtime.sendMessage({
      type: 'OFFSCREEN_FETCH',
      url: url,
      options: {
        method: options.method || 'GET',
        headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
        body: options.body ? JSON.stringify(options.body) : undefined
      }
    });

    if (!response.success) {
      throw new Error(response.error || 'API 请求失败');
    }

    const data = response.data;

    if (!data.success) {
      throw new Error(data.error || 'API 返回错误');
    }

    console.log(`[GPTMailProvider] API 响应:`, data);
    return data.data;
  }

  /**
   * 创建临时邮箱（完全随机，不指定 prefix 和 domain）
   */
  async createInbox(options = {}) {
    try {
      // 使用 GET 请求，完全随机生成邮箱
      const data = await this._callApi('/api/generate-email');

      if (!data.email) {
        throw new Error('未能获取邮箱地址');
      }

      this.address = data.email;
      this.sessionStartTime = Date.now();
      this.processedMailIds.clear();

      console.log(`[GPTMailProvider] 邮箱创建成功: ${this.address}`);
      return this.address;
    } catch (error) {
      console.error('[GPTMailProvider] 创建邮箱失败:', error);
      throw error;
    }
  }

  /**
   * 获取邮件列表
   */
  async _getEmails() {
    try {
      const data = await this._callApi(`/api/emails?email=${encodeURIComponent(this.address)}`);
      return data.emails || [];
    } catch (error) {
      console.error('[GPTMailProvider] 获取邮件列表失败:', error);
      return [];
    }
  }

  /**
   * 获取验证码（自动轮询）
   */
  async fetchVerificationCode(senderEmail, afterTimestamp, options = {}) {
    const {
      initialDelay = 15000,
      maxAttempts = 15,
      pollInterval = 4000
    } = options;

    const senderFilter = senderEmail?.toLowerCase() || 'aws';
    const startTimestamp = afterTimestamp || this.sessionStartTime;

    console.log(`[GPTMailProvider] 开始获取验证码，发件人过滤: ${senderFilter}`);

    // 初始等待
    console.log(`[GPTMailProvider] 等待 ${initialDelay / 1000} 秒让邮件到达...`);
    await new Promise(resolve => setTimeout(resolve, initialDelay));

    // 轮询获取验证码
    for (let i = 0; i < maxAttempts; i++) {
      console.log(`[GPTMailProvider] 第 ${i + 1}/${maxAttempts} 次检查邮件...`);

      try {
        const emails = await this._getEmails();

        for (const email of emails) {
          // 跳过已处理的邮件
          if (this.processedMailIds.has(email.id)) {
            continue;
          }

          // 检查发件人（部分匹配）
          const from = (email.from_address || '').toLowerCase();
          if (!from.includes(senderFilter) && !senderFilter.includes(from.split('@')[0])) {
            console.log(`[GPTMailProvider] 跳过邮件，发件人不匹配: ${from}`);
            continue;
          }

          // 检查时间（timestamp 是 Unix 秒）
          const mailTime = (email.timestamp || 0) * 1000;
          if (mailTime < startTimestamp - 60000) {
            console.log(`[GPTMailProvider] 跳过旧邮件: ${email.subject}`);
            continue;
          }

          // 标记为已处理
          this.processedMailIds.add(email.id);

          // 从邮件正文提取验证码
          const body = email.content || '';
          const code = this.extractVerificationCode(body);

          if (code) {
            console.log(`[GPTMailProvider] 成功获取验证码: ${code}`);
            return code;
          }

          // 也尝试从 HTML 内容提取
          if (email.html_content) {
            const htmlCode = this.extractVerificationCode(email.html_content);
            if (htmlCode) {
              console.log(`[GPTMailProvider] 从 HTML 获取验证码: ${htmlCode}`);
              return htmlCode;
            }
          }

          console.log('[GPTMailProvider] 邮件中未找到验证码');
        }
      } catch (error) {
        console.error(`[GPTMailProvider] 第 ${i + 1} 次检查失败:`, error);
      }

      // 等待后重试
      if (i < maxAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    }

    console.log('[GPTMailProvider] 获取验证码超时');
    return null;
  }

  /**
   * 检查是否已配置（有 API Key 就行）
   */
  isConfigured() {
    return !!this.apiKey;
  }

  /**
   * 是否可以自动获取验证码
   */
  canAutoVerify() {
    return true;
  }

  /**
   * 清理资源
   */
  async cleanup() {
    this.processedMailIds.clear();
    await super.cleanup();
  }

  /**
   * 获取渠道信息
   */
  getInfo() {
    return {
      ...super.getInfo(),
      apiKey: this.apiKey ? '******' : null
    };
  }
}

export { GPTMailProvider, DEFAULT_API_KEY };
