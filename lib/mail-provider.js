/**
 * Mail Provider - 邮箱渠道抽象基类
 * 所有邮箱渠道必须继承此类并实现相应方法
 */

class MailProvider {
  // 渠道唯一标识（子类必须覆盖）
  static id = 'base';

  // 渠道显示名称（子类必须覆盖）
  static name = 'Base Provider';

  // 是否需要用户配置（如 Gmail 需要输入邮箱地址，Guerrilla 不需要）
  static needsConfig = false;

  // 是否支持自动获取验证码
  static supportsAutoVerification = false;

  constructor() {
    // 当前邮箱地址
    this.address = null;
    // 会话开始时间（用于过滤验证码邮件）
    this.sessionStartTime = Date.now();
  }

  /**
   * 创建/获取邮箱地址
   * @param {Object} options - 创建选项
   * @returns {Promise<string>} 邮箱地址
   */
  async createInbox(options = {}) {
    throw new Error('子类必须实现 createInbox() 方法');
  }

  /**
   * 获取验证码
   * @param {string} senderEmail - 发件人邮箱（用于过滤）
   * @param {number} afterTimestamp - 只获取此时间之后的邮件
   * @param {Object} options - 配置选项
   * @returns {Promise<string|null>} 验证码或 null
   */
  async fetchVerificationCode(senderEmail, afterTimestamp, options = {}) {
    throw new Error('子类必须实现 fetchVerificationCode() 方法');
  }

  /**
   * 检查渠道是否已配置可用
   * @returns {boolean}
   */
  isConfigured() {
    return false;
  }

  /**
   * 清理资源（删除临时邮箱等）
   * @returns {Promise<void>}
   */
  async cleanup() {
    this.address = null;
  }

  /**
   * 获取当前邮箱地址
   * @returns {string|null}
   */
  getAddress() {
    return this.address;
  }

  /**
   * 获取渠道信息
   * @returns {Object}
   */
  getInfo() {
    return {
      id: this.constructor.id,
      name: this.constructor.name,
      address: this.address,
      needsConfig: this.constructor.needsConfig,
      supportsAutoVerification: this.constructor.supportsAutoVerification
    };
  }

  /**
   * 从邮件正文提取验证码（通用方法，子类可覆盖）
   * @param {string} body - 邮件正文
   * @returns {string|null}
   */
  extractVerificationCode(body) {
    const patterns = [
      /验证码[：:]\s*(\d{6})/,
      /verification\s*code[：:]\s*(\d{6})/i,
      /code[：:]\s*(\d{6})/i,
      /(\d{6})/
    ];

    for (const pattern of patterns) {
      const match = body.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return null;
  }
}

export { MailProvider };
