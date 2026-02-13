/**
 * MoeMail Provider - MoeMail 临时邮箱渠道
 * 需要 API Key 配置，支持自定义邮箱前缀、域名和有效期
 *
 * API 文档: https://docs.moemail.app/api#openapi
 */

import { MailProvider } from '../mail-provider.js';

class MoeMailProvider extends MailProvider {
  static id = 'moemail';
  static name = 'MoeMail';
  static needsConfig = true;
  static supportsAutoVerification = true;

  constructor(options = {}) {
    super();
    this.apiUrl = options.apiUrl || 'http://';
    this.apiKey = options.apiKey || '';
    this.domain = options.domain || '';
    this.prefix = options.prefix || '';
    this.randomLength = options.randomLength || 5;
    this.duration = options.duration || 0; // 0 = 永久
    this.processedMailIds = new Set();
    this.emailId = null; // 存储创建的邮箱 ID
  }

  /**
   * 设置 API 配置
   */
  setConfig(config) {
    if (config.apiUrl) this.apiUrl = config.apiUrl;
    if (config.apiKey) this.apiKey = config.apiKey;
    if (config.domain) this.domain = config.domain;
    if (config.prefix !== undefined) this.prefix = config.prefix;
    if (config.randomLength) this.randomLength = config.randomLength;
    if (config.duration !== undefined) this.duration = config.duration;
  }

  /**
   * 生成随机字符串
   */
  _generateRandomString(length = 5) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
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
   * 调用 MoeMail API（通过 offscreen document 代理）
   */
  async _callApi(endpoint, options = {}) {
    // 确保 URL 使用 HTTPS
    let apiUrl = this.apiUrl;
    if (apiUrl.startsWith('http://')) {
      apiUrl = apiUrl.replace('http://', 'https://');
    }
    
    const url = `${apiUrl}${endpoint}`;

    console.log(`[MoeMailProvider] API 调用: ${options.method || 'GET'} ${endpoint}`);

    // 确保 offscreen document 存在
    await this._ensureOffscreen();

    const headers = {};

    // 添加认证头（使用 X-API-Key）
    if (this.apiKey) {
      headers['X-API-Key'] = this.apiKey;
    }

    // 对于 POST 请求，使用正确的 Content-Type
    let requestBody = options.body;
    if (options.method === 'POST' && options.body) {
      headers['Content-Type'] = 'application/json';
      requestBody = JSON.stringify(options.body);
    }

    // 通过 offscreen document 发起请求
    const response = await chrome.runtime.sendMessage({
      type: 'OFFSCREEN_FETCH',
      url: url,
      options: {
        method: options.method || 'GET',
        headers: headers,
        body: requestBody
      }
    });

    if (!response.success) {
      throw new Error(response.error || 'API 请求失败');
    }

    const data = response.data;
    console.log(`[MoeMailProvider] API 响应:`, data);
    return data;
  }

  /**
   * 获取可用域名列表
   */
  async fetchDomains() {
    try {
      const data = await this._callApi('/api/config');
      
      if (data.emailDomains) {
        // 解析逗号分隔的域名字符串
        const domains = data.emailDomains.split(',').map(d => d.trim()).filter(d => d);
        console.log(`[MoeMailProvider] 获取域名列表:`, domains);
        return domains;
      }
      
      console.warn('[MoeMailProvider] 配置响应中未找到 emailDomains');
      return [];
    } catch (error) {
      console.error('[MoeMailProvider] 获取域名失败:', error);
      throw error;
    }
  }

  /**
   * 创建临时邮箱
   */
  async createInbox(options = {}) {
    try {
      if (!this.apiKey) {
        throw new Error('未配置 API Key');
      }

      if (!this.domain) {
        throw new Error('未配置邮箱域名');
      }

      // 生成邮箱用户名（不包含域名）
      const randomStr = this._generateRandomString(this.randomLength);
      const username = this.prefix ? `${this.prefix}${randomStr}` : randomStr;

      // 调用 API 创建邮箱（严格按照 API 文档格式）
      const requestBody = {
        name: username,
        expiryTime: this.duration || 0,  // 始终包含 expiryTime 字段，默认为 0（永久）
        domain: this.domain
      };

      console.log(`[MoeMailProvider] 创建邮箱请求:`, requestBody);
      console.log(`[MoeMailProvider] 请求 JSON:`, JSON.stringify(requestBody));

      const data = await this._callApi('/api/emails/generate', {
        method: 'POST',
        body: requestBody
      });

      // 根据实际 API 响应格式解析
      if (data.id && data.email) {
        this.emailId = data.id;
        this.address = data.email;
      } else if (data.email) {
        // 如果只有 email 字段，使用 email 作为 ID
        this.emailId = data.email;
        this.address = data.email;
      } else {
        throw new Error('API 响应格式不正确，缺少 email 字段');
      }

      this.sessionStartTime = Date.now();
      this.processedMailIds.clear();

      console.log(`[MoeMailProvider] 邮箱创建成功: ${this.address} (ID: ${this.emailId})`);
      return this.address;
    } catch (error) {
      console.error('[MoeMailProvider] 创建邮箱失败:', error);
      throw error;
    }
  }

  /**
   * 获取邮件列表
   */
  async _getEmails() {
    try {
      if (!this.emailId) {
        throw new Error('邮箱 ID 未初始化');
      }

      // 获取单个邮箱的详细信息，包含消息列表
      const data = await this._callApi(`/api/emails/${this.emailId}`);
      
      // 根据 API 响应格式，消息可能在 messages 字段中
      return data.messages || [];
    } catch (error) {
      console.error('[MoeMailProvider] 获取邮件列表失败:', error);
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

    console.log(`[MoeMailProvider] 开始获取验证码，发件人过滤: ${senderFilter}`);

    // 初始等待
    console.log(`[MoeMailProvider] 等待 ${initialDelay / 1000} 秒让邮件到达...`);
    await new Promise(resolve => setTimeout(resolve, initialDelay));

    // 轮询获取验证码
    for (let i = 0; i < maxAttempts; i++) {
      console.log(`[MoeMailProvider] 第 ${i + 1}/${maxAttempts} 次检查邮件...`);

      try {
        const emails = await this._getEmails();

        for (const email of emails) {
          // 跳过已处理的邮件
          if (this.processedMailIds.has(email.id)) {
            continue;
          }

          // 检查发件人（部分匹配）或主题包含 AWS 关键词
          const from = (email.from_address || '').toLowerCase();
          const subject = (email.subject || '').toLowerCase();
          const fromMatch = from.includes(senderFilter) || senderFilter.includes(from.split('@')[0]);
          const subjectMatch = subject.includes('aws') && (subject.includes('verif') || subject.includes('验证'));
          if (!fromMatch && !subjectMatch) {
            console.log(`[MoeMailProvider] 跳过邮件，发件人不匹配: ${from}`);
            continue;
          }

          // 检查时间（根据实际 API 响应调整时间字段）
          const mailTime = email.received_at || email.sent_at || Date.now();
          if (mailTime < startTimestamp - 60000) {
            console.log(`[MoeMailProvider] 跳过旧邮件: ${email.subject}`);
            continue;
          }

          // 标记为已处理
          this.processedMailIds.add(email.id);

          // 从邮件正文提取验证码
          const body = email.content || '';
          const code = this.extractVerificationCode(body);

          if (code) {
            console.log(`[MoeMailProvider] 成功获取验证码: ${code}`);
            return code;
          }

          // 也尝试从 HTML 内容提取
          if (email.html) {
            const htmlCode = this.extractVerificationCode(email.html);
            if (htmlCode) {
              console.log(`[MoeMailProvider] 从 HTML 获取验证码: ${htmlCode}`);
              return htmlCode;
            }
          }

          console.log('[MoeMailProvider] 邮件中未找到验证码');
        }
      } catch (error) {
        console.error(`[MoeMailProvider] 第 ${i + 1} 次检查失败:`, error);
      }

      // 等待后重试
      if (i < maxAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    }

    console.log('[MoeMailProvider] 获取验证码超时');
    return null;
  }

  /**
   * 检查是否已配置（需要 API Key 和域名）
   */
  isConfigured() {
    return !!(this.apiKey && this.domain);
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
    this.emailId = null;
    await super.cleanup();
  }

  /**
   * 获取渠道信息
   */
  getInfo() {
    return {
      ...super.getInfo(),
      apiUrl: this.apiUrl,
      apiKey: this.apiKey ? '******' : null,
      domain: this.domain,
      prefix: this.prefix,
      randomLength: this.randomLength,
      duration: this.duration
    };
  }
}

export { MoeMailProvider };