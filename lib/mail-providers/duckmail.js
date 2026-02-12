/**
 * DuckMail Provider - DuckMail 临时邮箱渠道
 * API Key 可选，支持公共域名和私有域名
 *
 * API 文档: https://www.duckmail.sbs/api-docs
 * API 基础 URL: https://api.duckmail.sbs
 */

import { MailProvider } from '../mail-provider.js';

const API_URL = 'https://api.duckmail.sbs';

class DuckMailProvider extends MailProvider {
  static id = 'duckmail';
  static name = 'DuckMail';
  static needsConfig = false;  // API Key 可选，不强制配置
  static supportsAutoVerification = true;

  constructor(options = {}) {
    super();
    this.apiKey = options.apiKey || '';  // 可选 API Key
    this.domain = options.domain || '';  // 用户选择的域名
    this.bearerToken = null;  // 认证 Token
    this.password = null;  // 账户密码
    this.processedMailIds = new Set();
  }

  /**
   * 设置 API Key
   */
  setApiKey(apiKey) {
    this.apiKey = apiKey || '';
  }

  /**
   * 设置域名
   */
  setDomain(domain) {
    this.domain = domain;
  }

  /**
   * 生成随机用户名（更复杂，降低冲突概率）
   * 包含小写字母、数字，长度 12-16 位
   */
  _generateRandomUsername() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const length = 12 + Math.floor(Math.random() * 5); // 12-16 位
    let result = 'abcdefghijklmnopqrstuvwxyz'.charAt(Math.floor(Math.random() * 26)); // 首字符必须是字母
    for (let i = 1; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    // 加上时间戳后 4 位增加唯一性
    result += Date.now().toString(36).slice(-4);
    return result;
  }

  /**
   * 生成随机密码
   */
  _generatePassword(length = 16) {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%';
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
   * 调用 DuckMail API（通过 offscreen document 代理）
   */
  async _callApi(endpoint, options = {}) {
    const url = `${API_URL}${endpoint}`;

    console.log(`[DuckMailProvider] API 调用: ${options.method || 'GET'} ${endpoint}`);

    await this._ensureOffscreen();

    const headers = {
      'Content-Type': 'application/json'
    };

    // 添加认证头
    if (options.useToken && this.bearerToken) {
      headers['Authorization'] = `Bearer ${this.bearerToken}`;
    } else if (options.useApiKey && this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const response = await chrome.runtime.sendMessage({
      type: 'OFFSCREEN_FETCH',
      url: url,
      options: {
        method: options.method || 'GET',
        headers: headers,
        body: options.body ? JSON.stringify(options.body) : undefined
      }
    });

    if (!response.success) {
      throw new Error(response.error || 'API 请求失败');
    }

    console.log(`[DuckMailProvider] API 响应:`, response.data);
    return response.data;
  }

  /**
   * 获取可用域名列表（静态方法，供 popup 调用）
   */
  async fetchDomains() {
    try {
      const data = await this._callApi('/domains', {
        useApiKey: !!this.apiKey
      });

      // API 返回格式: { "hydra:member": [{ domain: "xxx", ... }, ...] }
      let domains = [];
      if (data['hydra:member'] && Array.isArray(data['hydra:member'])) {
        domains = data['hydra:member'].map(item => item.domain);
      } else if (data.domains) {
        domains = data.domains;
      } else if (Array.isArray(data)) {
        domains = data;
      }

      console.log(`[DuckMailProvider] 获取域名列表:`, domains);
      return domains;
    } catch (error) {
      console.error('[DuckMailProvider] 获取域名失败:', error);
      // 返回默认公共域名
      return ['duckmail.sbs'];
    }
  }

  /**
   * 创建邮箱账户（带重试机制）
   */
  async createInbox(options = {}) {
    if (!this.domain) {
      throw new Error('未选择域名，请先选择邮箱域名');
    }

    const maxRetries = 3;
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // 生成随机用户名和密码
        const username = this._generateRandomUsername();
        this.password = this._generatePassword();
        const address = `${username}@${this.domain}`;

        console.log(`[DuckMailProvider] 创建账户 (尝试 ${attempt}/${maxRetries}): ${address}`);

        // 创建账户
        await this._callApi('/accounts', {
          method: 'POST',
          useApiKey: !!this.apiKey,
          body: {
            address: address,
            password: this.password
          }
        });

        // 获取认证 Token
        const tokenResult = await this._callApi('/token', {
          method: 'POST',
          body: {
            address: address,
            password: this.password
          }
        });

        if (!tokenResult.token) {
          throw new Error('获取认证 Token 失败');
        }

        this.bearerToken = tokenResult.token;
        this.address = address;
        this.sessionStartTime = Date.now();
        this.processedMailIds.clear();

        console.log(`[DuckMailProvider] 邮箱创建成功: ${this.address}`);
        return this.address;

      } catch (error) {
        lastError = error;
        console.warn(`[DuckMailProvider] 创建账户失败 (尝试 ${attempt}/${maxRetries}):`, error.message);

        // 如果是用户名已存在的错误，重试
        if (error.message && (error.message.includes('already') || error.message.includes('exist') || error.message.includes('duplicate'))) {
          if (attempt < maxRetries) {
            console.log(`[DuckMailProvider] 用户名可能已存在，重新生成...`);
            await new Promise(resolve => setTimeout(resolve, 500));
            continue;
          }
        }

        // 其他错误直接抛出
        throw error;
      }
    }

    // 所有重试都失败
    console.error('[DuckMailProvider] 创建邮箱失败，已达最大重试次数');
    throw lastError || new Error('创建邮箱失败');
  }

  /**
   * 获取邮件列表
   * API 返回格式: { "hydra:member": [{ id, from, subject, createdAt, ... }], ... }
   */
  async _getEmails() {
    try {
      if (!this.bearerToken) {
        throw new Error('未认证，无法获取邮件');
      }

      const data = await this._callApi('/messages', {
        useToken: true
      });

      // 解析 hydra:member 格式
      if (data['hydra:member'] && Array.isArray(data['hydra:member'])) {
        return data['hydra:member'];
      }
      return data.messages || data || [];
    } catch (error) {
      console.error('[DuckMailProvider] 获取邮件列表失败:', error);
      return [];
    }
  }

  /**
   * 获取单封邮件详情
   */
  async _getEmailDetail(id) {
    try {
      const data = await this._callApi(`/messages/${id}`, {
        useToken: true
      });
      return data;
    } catch (error) {
      console.error('[DuckMailProvider] 获取邮件详情失败:', error);
      return null;
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

    console.log(`[DuckMailProvider] 开始获取验证码，发件人过滤: ${senderFilter}`);

    // 初始等待
    console.log(`[DuckMailProvider] 等待 ${initialDelay / 1000} 秒让邮件到达...`);
    await new Promise(resolve => setTimeout(resolve, initialDelay));

    // 轮询获取验证码
    for (let i = 0; i < maxAttempts; i++) {
      console.log(`[DuckMailProvider] 第 ${i + 1}/${maxAttempts} 次检查邮件...`);

      try {
        const emails = await this._getEmails();

        for (const email of emails) {
          // 跳过已处理的邮件
          if (this.processedMailIds.has(email.id)) {
            continue;
          }

          // 检查发件人（部分匹配）
          const from = (email.from || email.sender || '').toLowerCase();
          if (!from.includes(senderFilter) && !senderFilter.includes(from.split('@')[0])) {
            console.log(`[DuckMailProvider] 跳过邮件，发件人不匹配: ${from}`);
            continue;
          }

          // 检查时间
          const mailTime = email.createdAt ? new Date(email.createdAt).getTime() : Date.now();
          if (mailTime < startTimestamp - 60000) {
            console.log(`[DuckMailProvider] 跳过旧邮件: ${email.subject}`);
            continue;
          }

          // 标记为已处理
          this.processedMailIds.add(email.id);

          // 获取邮件详情
          const detail = await this._getEmailDetail(email.id);
          if (!detail) continue;

          // 从邮件正文提取验证码
          const body = detail.text || detail.body || detail.content || '';
          const code = this.extractVerificationCode(body);

          if (code) {
            console.log(`[DuckMailProvider] 成功获取验证码: ${code}`);
            return code;
          }

          // 也尝试从 HTML 内容提取
          if (detail.html) {
            const htmlCode = this.extractVerificationCode(detail.html);
            if (htmlCode) {
              console.log(`[DuckMailProvider] 从 HTML 获取验证码: ${htmlCode}`);
              return htmlCode;
            }
          }

          console.log('[DuckMailProvider] 邮件中未找到验证码');
        }
      } catch (error) {
        console.error(`[DuckMailProvider] 第 ${i + 1} 次检查失败:`, error);
      }

      // 等待后重试
      if (i < maxAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    }

    console.log('[DuckMailProvider] 获取验证码超时');
    return null;
  }

  /**
   * 检查是否已配置（域名已选择即可）
   */
  isConfigured() {
    return !!this.domain;
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
    this.bearerToken = null;
    this.password = null;
    await super.cleanup();
  }

  /**
   * 获取渠道信息
   */
  getInfo() {
    return {
      ...super.getInfo(),
      apiKey: this.apiKey ? '******' : null,
      domain: this.domain
    };
  }
}

export { DuckMailProvider };
