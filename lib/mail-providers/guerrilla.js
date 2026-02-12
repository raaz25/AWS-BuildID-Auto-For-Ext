/**
 * Guerrilla Mail Provider - 临时邮箱渠道
 * 免配置，自动生成临时邮箱，自动获取验证码
 *
 * API 文档: https://www.guerrillamail.com/GuerrillaMailAPI.html
 *
 * 注意：公共 API 不支持自定义域名，只能使用默认的 guerrillamailblock.com
 * 自定义域名需要注册私有站点并使用 API Token
 */

import { MailProvider } from '../mail-provider.js';

const API_URL = 'https://api.guerrillamail.com/ajax.php';

class GuerrillaProvider extends MailProvider {
  static id = 'guerrilla';
  static name = 'Guerrilla Mail';
  static needsConfig = false;
  static supportsAutoVerification = true;

  constructor() {
    super();
    // 会话 ID（需要在每次请求中携带）
    this.sessionId = null;
    // sid_token（API 返回的会话令牌）
    this.sidToken = null;
    // 邮箱时间戳
    this.emailTimestamp = null;
    // 已处理的邮件 ID（避免重复处理）
    this.processedMailIds = new Set();
  }

  /**
   * 生成随机用户名
   */
  _generateRandomUsername(length = 10) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    // 首字符必须是字母
    result += 'abcdefghijklmnopqrstuvwxyz'.charAt(Math.floor(Math.random() * 26));
    for (let i = 1; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * 调用 Guerrilla Mail API
   */
  async _callApi(func, params = {}) {
    const url = new URL(API_URL);
    url.searchParams.set('f', func);

    // 如果有 sid_token，添加到参数
    if (this.sidToken) {
      url.searchParams.set('sid_token', this.sidToken);
    }

    // 添加其他参数
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, value);
      }
    }

    console.log(`[GuerrillaProvider] API 调用: ${func}`, params);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`API 请求失败: ${response.status}`);
    }

    const data = await response.json();

    // 保存 sid_token
    if (data.sid_token) {
      this.sidToken = data.sid_token;
    }

    console.log(`[GuerrillaProvider] API 响应:`, data);

    return data;
  }

  /**
   * 创建/获取临时邮箱
   */
  async createInbox() {
    try {
      // 先初始化会话，获取 sid_token
      await this._callApi('get_email_address', { lang: 'en' });

      // 生成随机用户名
      const username = this._generateRandomUsername(12);

      // 使用 set_email_user 设置自定义用户名
      const data = await this._callApi('set_email_user', {
        email_user: username,
        lang: 'en'
      });

      if (!data.email_addr) {
        throw new Error('未能获取邮箱地址');
      }

      this.address = data.email_addr;
      this.emailTimestamp = data.email_timestamp;
      this.sessionStartTime = Date.now();
      this.processedMailIds.clear();

      console.log(`[GuerrillaProvider] 邮箱创建成功: ${this.address}`);
      return this.address;
    } catch (error) {
      console.error('[GuerrillaProvider] 创建邮箱失败:', error);
      throw error;
    }
  }

  /**
   * 检查新邮件
   */
  async _checkEmail(seq = 0) {
    try {
      const data = await this._callApi('check_email', { seq });
      return data.list || [];
    } catch (error) {
      console.error('[GuerrillaProvider] 检查邮件失败:', error);
      return [];
    }
  }

  /**
   * 获取邮件详情
   */
  async _fetchEmail(mailId) {
    try {
      const data = await this._callApi('fetch_email', { email_id: mailId });
      return data;
    } catch (error) {
      console.error('[GuerrillaProvider] 获取邮件失败:', error);
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

    // Guerrilla Mail 是临时邮箱，发件人过滤用不同方式
    const senderFilter = senderEmail?.toLowerCase() || 'aws';
    const startTimestamp = afterTimestamp || this.sessionStartTime;

    console.log(`[GuerrillaProvider] 开始获取验证码，发件人过滤: ${senderFilter}`);

    // 初始等待
    console.log(`[GuerrillaProvider] 等待 ${initialDelay / 1000} 秒让邮件到达...`);
    await new Promise(resolve => setTimeout(resolve, initialDelay));

    // 轮询获取验证码
    for (let i = 0; i < maxAttempts; i++) {
      console.log(`[GuerrillaProvider] 第 ${i + 1}/${maxAttempts} 次检查邮件...`);

      try {
        // 检查新邮件
        const emails = await this._checkEmail(0);

        for (const email of emails) {
          // 跳过已处理的邮件
          if (this.processedMailIds.has(email.mail_id)) {
            continue;
          }

          // 检查发件人（部分匹配）
          const from = (email.mail_from || '').toLowerCase();
          if (!from.includes(senderFilter) && !senderFilter.includes(from.split('@')[0])) {
            console.log(`[GuerrillaProvider] 跳过邮件，发件人不匹配: ${from}`);
            continue;
          }

          // 检查时间（Guerrilla 返回的时间戳是 Unix 秒）
          const mailTime = (email.mail_timestamp || 0) * 1000;
          if (mailTime < startTimestamp - 60000) { // 允许 1 分钟误差
            console.log(`[GuerrillaProvider] 跳过旧邮件: ${email.mail_subject}`);
            continue;
          }

          // 标记为已处理
          this.processedMailIds.add(email.mail_id);

          // 获取邮件详情
          const detail = await this._fetchEmail(email.mail_id);
          if (!detail) {
            continue;
          }

          // 从邮件正文提取验证码
          const body = detail.mail_body || '';
          const code = this.extractVerificationCode(body);

          if (code) {
            console.log(`[GuerrillaProvider] 成功获取验证码: ${code}`);
            return code;
          }

          // 也尝试从摘要提取
          const excerpt = email.mail_excerpt || '';
          const excerptCode = this.extractVerificationCode(excerpt);
          if (excerptCode) {
            console.log(`[GuerrillaProvider] 从摘要获取验证码: ${excerptCode}`);
            return excerptCode;
          }

          console.log('[GuerrillaProvider] 邮件中未找到验证码');
        }
      } catch (error) {
        console.error(`[GuerrillaProvider] 第 ${i + 1} 次检查失败:`, error);
      }

      // 等待后重试
      if (i < maxAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    }

    console.log('[GuerrillaProvider] 获取验证码超时');
    return null;
  }

  /**
   * 检查是否已配置（Guerrilla 不需要配置，只要有地址就行）
   */
  isConfigured() {
    return true; // 始终可用
  }

  /**
   * 是否可以自动获取验证码
   */
  canAutoVerify() {
    return true;
  }

  /**
   * 清理资源（Guerrilla 邮箱会自动过期，这里只清理本地状态）
   */
  async cleanup() {
    // 可选：调用 forget_me API
    if (this.sessionId) {
      try {
        await this._callApi('forget_me');
      } catch (e) {
        // 忽略错误
      }
    }

    this.sessionId = null;
    this.sidToken = null;
    this.emailTimestamp = null;
    this.processedMailIds.clear();
    await super.cleanup();
  }

  /**
   * 获取渠道信息
   */
  getInfo() {
    return {
      ...super.getInfo(),
      sidToken: this.sidToken,
      emailTimestamp: this.emailTimestamp
    };
  }
}

export { GuerrillaProvider };
