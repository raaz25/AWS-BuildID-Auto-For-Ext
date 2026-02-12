/**
 * Gmail Provider - Gmail 邮箱渠道
 * 封装 GmailAliasClient（别名生成）和 GmailApiClient（验证码获取）
 */

import { MailProvider } from '../mail-provider.js';
import { GmailAliasClient } from '../mail-api.js';
import { GmailApiClient } from '../gmail-api.js';

class GmailProvider extends MailProvider {
  static id = 'gmail';
  static name = 'Gmail';
  static needsConfig = true;
  static supportsAutoVerification = true;

  constructor(options = {}) {
    super();
    this.baseEmail = options.baseEmail || '';
    this.aliasClient = null;
    this.apiClient = null;
    this.apiAuthorized = false;
    this.senderFilter = options.senderFilter || 'no-reply@signin.aws';
  }

  /**
   * 设置基础邮箱地址
   */
  setBaseEmail(email) {
    this.baseEmail = email;
    if (this.aliasClient) {
      this.aliasClient.setBaseEmail(email);
    }
  }

  /**
   * 设置验证码发件人过滤
   */
  setSenderFilter(sender) {
    this.senderFilter = sender;
  }

  /**
   * 初始化 Gmail API 客户端
   */
  initApiClient() {
    if (!this.apiClient) {
      this.apiClient = new GmailApiClient();
    }
    return this.apiClient;
  }

  /**
   * Gmail API 授权
   */
  async authorize(interactive = true) {
    this.initApiClient();
    await this.apiClient.authenticate(interactive);
    this.apiAuthorized = true;
    return true;
  }

  /**
   * 检查 API 授权状态
   */
  async checkAuthorization() {
    this.initApiClient();
    this.apiAuthorized = await this.apiClient.isAuthorized();
    return this.apiAuthorized;
  }

  /**
   * 撤销授权
   */
  async revokeAuthorization() {
    if (this.apiClient) {
      await this.apiClient.revokeToken();
    }
    this.apiAuthorized = false;
  }

  /**
   * 创建 Gmail 别名邮箱
   */
  async createInbox(options = {}) {
    if (!this.baseEmail) {
      throw new Error('未配置 Gmail 基础地址');
    }

    // 初始化别名客户端
    if (!this.aliasClient) {
      this.aliasClient = new GmailAliasClient({ baseEmail: this.baseEmail });
    } else {
      this.aliasClient.setBaseEmail(this.baseEmail);
    }

    // 生成别名
    this.address = await this.aliasClient.createInbox({
      prefix: options.prefix,
      mode: options.mode || 'auto'
    });

    this.sessionStartTime = Date.now();
    return this.address;
  }

  /**
   * 获取验证码（优先使用 Gmail API，否则返回 null 需手动输入）
   */
  async fetchVerificationCode(senderEmail, afterTimestamp, options = {}) {
    // 如果未授权 API，返回 null（需要手动输入）
    if (!this.apiAuthorized || !this.apiClient) {
      console.log('[GmailProvider] API 未授权，需要手动输入验证码');
      return null;
    }

    const sender = senderEmail || this.senderFilter;
    const timestamp = afterTimestamp || this.sessionStartTime;

    try {
      const code = await this.apiClient.fetchVerificationCode(sender, timestamp, {
        initialDelay: options.initialDelay || 20000,
        maxAttempts: options.maxAttempts || 12,
        pollInterval: options.pollInterval || 5000
      });

      return code;
    } catch (error) {
      console.error('[GmailProvider] 获取验证码失败:', error);
      return null;
    }
  }

  /**
   * 检查是否已配置
   */
  isConfigured() {
    return !!this.baseEmail && this.baseEmail.includes('@');
  }

  /**
   * 是否支持自动验证码（需要 API 授权）
   */
  canAutoVerify() {
    return this.apiAuthorized;
  }

  /**
   * 清理资源
   */
  async cleanup() {
    await super.cleanup();
    if (this.aliasClient) {
      await this.aliasClient.deleteInbox();
    }
  }

  /**
   * 获取渠道信息
   */
  getInfo() {
    return {
      ...super.getInfo(),
      baseEmail: this.baseEmail,
      apiAuthorized: this.apiAuthorized,
      senderFilter: this.senderFilter
    };
  }
}

export { GmailProvider };
