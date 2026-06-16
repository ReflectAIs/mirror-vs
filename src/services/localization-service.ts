/**
 * Simple i18n / localization service for Mirror VS webview.
 * Supports multiple languages with dictionary-based translations.
 */

// English (default)
const EN: Record<string, string> = {
  'app.title': 'Mirror VS',
  'app.subtitle': 'AI Pair Programmer',
  'welcome.title': 'Mirror VS',
  'welcome.subtitle': 'Your interactive AI pair programmer',
  'welcome.context': 'Link files by typing @ in your prompt',
  'welcome.instant': 'One-click apply with smart checkpoints',
  'welcome.dual': 'Seamlessly switch between Ollama & DeepSeek',
  'welcome.hint': 'Open a file and start typing below ⬇️',
  'input.placeholder': "Ask to modify code... Type '@' to link files",
  'settings.title': '⚙️ Configuration',
  'settings.provider': 'AI Provider',
  'settings.ollama.host': 'Ollama API Host',
  'settings.ollama.model': 'Local Model',
  'settings.deepseek.key': 'DeepSeek API Key',
  'settings.deepseek.model': 'Cloud Model',
  'settings.figma.key': 'Figma Personal Access Token',
  'settings.context.max': 'Max Active Turns',
  'settings.context.retain': 'Turns to Retain',
  'settings.save': 'Save Configuration',
  'history.title': '💬 Chat Sessions',
  'history.empty': 'No previous sessions',
  'git.title': '🔀 Git Changes',
  'git.empty': 'No changes detected',
  'git.added': 'Added',
  'git.modified': 'Modified',
  'git.deleted': 'Deleted',
  'git.untracked': 'Untracked',
  'git.accept': 'Accept Changes',
  'git.reject': 'Reject Changes',
  'buddy.idle': 'Ready to help!',
  'buddy.thinking': 'Thinking...',
  'buddy.coding': 'Writing code...',
  'buddy.tools': 'Running tools...',
  'buddy.error': 'Oops! Something went wrong',
  'telemetry.title': '📊 Telemetry Dashboard',
  'telemetry.tokens': 'Total Tokens',
  'telemetry.cost': 'Total Cost',
  'telemetry.latency': 'Avg Latency',
  'telemetry.errors': 'Errors',
  'telemetry.sessions': 'Sessions',
  'feedback.title': '💬 Feedback',
  'feedback.rating': 'Rating',
  'feedback.comment': 'Comment (optional)',
  'feedback.submit': 'Submit Feedback',
  'feedback.thanks': 'Thank you for your feedback!',
};

// Spanish
const ES: Record<string, string> = {
  'app.title': 'Mirror VS',
  'app.subtitle': 'Asistente de Codificación IA',
  'welcome.title': 'Mirror VS',
  'welcome.subtitle': 'Tu programador virtual interactivo',
  'welcome.context': 'Enlaza archivos escribiendo @ en tu mensaje',
  'welcome.instant': 'Aplicación con un clic y puntos de control',
  'welcome.dual': 'Cambia entre Ollama y DeepSeek sin problemas',
  'welcome.hint': 'Abre un archivo y empieza a escribir abajo ⬇️',
  'input.placeholder': "Pide modificar código... Escribe '@' para enlazar archivos",
  'settings.title': '⚙️ Configuración',
  'settings.provider': 'Proveedor IA',
  'settings.ollama.host': 'Host de API Ollama',
  'settings.ollama.model': 'Modelo Local',
  'settings.deepseek.key': 'Clave API DeepSeek',
  'settings.deepseek.model': 'Modelo Cloud',
  'settings.figma.key': 'Token de Acceso Figma',
  'settings.context.max': 'Máximo de Turnos Activos',
  'settings.context.retain': 'Turnos a Retener',
  'settings.save': 'Guardar Configuración',
  'history.title': '💬 Sesiones de Chat',
  'history.empty': 'No hay sesiones anteriores',
  'git.title': '🔀 Cambios Git',
  'git.empty': 'No se detectaron cambios',
  'git.added': 'Añadido',
  'git.modified': 'Modificado',
  'git.deleted': 'Eliminado',
  'git.untracked': 'Sin seguimiento',
  'git.accept': 'Aceptar Cambios',
  'git.reject': 'Rechazar Cambios',
  'buddy.idle': '¡Listo para ayudar!',
  'buddy.thinking': 'Pensando...',
  'buddy.coding': 'Escribiendo código...',
  'buddy.tools': 'Ejecutando herramientas...',
  'buddy.error': '¡Ups! Algo salió mal',
  'telemetry.title': '📊 Panel de Telemetría',
  'telemetry.tokens': 'Total de Tokens',
  'telemetry.cost': 'Costo Total',
  'telemetry.latency': 'Latencia Promedio',
  'telemetry.errors': 'Errores',
  'telemetry.sessions': 'Sesiones',
  'feedback.title': '💬 Comentarios',
  'feedback.rating': 'Puntuación',
  'feedback.comment': 'Comentario (opcional)',
  'feedback.submit': 'Enviar Comentarios',
  'feedback.thanks': '¡Gracias por tus comentarios!',
};

// Hindi
const HI: Record<string, string> = {
  'app.title': 'Mirror VS',
  'app.subtitle': 'AI कोडिंग सहायक',
  'welcome.title': 'Mirror VS',
  'welcome.subtitle': 'आपका इंटरैक्टिव AI पेयर प्रोग्रामर',
  'welcome.context': 'अपने प्रॉम्प्ट में @ टाइप करके फ़ाइलें लिंक करें',
  'welcome.instant': 'स्मार्ट चेकपॉइंट्स के साथ एक-क्लिक लागू करें',
  'welcome.dual': 'Ollama और DeepSeek के बीच आसानी से स्विच करें',
  'welcome.hint': 'एक फ़ाइल खोलें और नीचे टाइप करना शुरू करें ⬇️',
  'input.placeholder': "कोड संशोधित करने के लिए पूछें... फ़ाइलें लिंक करने के लिए '@' टाइप करें",
  'settings.title': '⚙️ कॉन्फ़िगरेशन',
  'settings.provider': 'AI प्रदाता',
  'settings.ollama.host': 'Ollama API होस्ट',
  'settings.ollama.model': 'स्थानीय मॉडल',
  'settings.deepseek.key': 'DeepSeek API कुंजी',
  'settings.deepseek.model': 'क्लाउड मॉडल',
  'settings.figma.key': 'Figma व्यक्तिगत एक्सेस टोकन',
  'settings.context.max': 'अधिकतम सक्रिय टर्न',
  'settings.context.retain': 'रखने के लिए टर्न',
  'settings.save': 'कॉन्फ़िगरेशन सहेजें',
  'history.title': '💬 चैट सत्र',
  'history.empty': 'कोई पिछला सत्र नहीं',
  'git.title': '🔀 Git परिवर्तन',
  'git.empty': 'कोई परिवर्तन नहीं मिला',
  'git.added': 'जोड़ा गया',
  'git.modified': 'संशोधित',
  'git.deleted': 'हटाया गया',
  'git.untracked': 'अनट्रैक किया गया',
  'git.accept': 'परिवर्तन स्वीकार करें',
  'git.reject': 'परिवर्तन अस्वीकार करें',
  'buddy.idle': 'मदद के लिए तैयार!',
  'buddy.thinking': 'सोच रहा है...',
  'buddy.coding': 'कोड लिख रहा है...',
  'buddy.tools': 'उपकरण चला रहा है...',
  'buddy.error': 'उफ़! कुछ गलत हो गया',
  'telemetry.title': '📊 टेलीमेट्री डैशबोर्ड',
  'telemetry.tokens': 'कुल टोकन',
  'telemetry.cost': 'कुल लागत',
  'telemetry.latency': 'औसत विलंबता',
  'telemetry.errors': 'त्रुटियाँ',
  'telemetry.sessions': 'सत्र',
  'feedback.title': '💬 प्रतिक्रिया',
  'feedback.rating': 'रेटिंग',
  'feedback.comment': 'टिप्पणी (वैकल्पिक)',
  'feedback.submit': 'प्रतिक्रिया सबमिट करें',
  'feedback.thanks': 'आपकी प्रतिक्रिया के लिए धन्यवाद!',
};

// Chinese Simplified
const ZH: Record<string, string> = {
  'app.title': 'Mirror VS',
  'app.subtitle': 'AI 编码助手',
  'welcome.title': 'Mirror VS',
  'welcome.subtitle': '您的交互式 AI 结对编程伙伴',
  'welcome.context': '在提示中键入 @ 链接文件',
  'welcome.instant': '一键应用，智能检查点',
  'welcome.dual': '在 Ollama 和 DeepSeek 之间无缝切换',
  'welcome.hint': '打开文件并在下方开始输入 ⬇️',
  'input.placeholder': '要求修改代码... 键入 @ 链接文件',
  'settings.title': '⚙️ 配置',
  'settings.provider': 'AI 提供商',
  'settings.ollama.host': 'Ollama API 主机',
  'settings.ollama.model': '本地模型',
  'settings.deepseek.key': 'DeepSeek API 密钥',
  'settings.deepseek.model': '云模型',
  'settings.figma.key': 'Figma 个人访问令牌',
  'settings.context.max': '最大活跃轮次',
  'settings.context.retain': '保留轮次',
  'settings.save': '保存配置',
  'history.title': '💬 聊天会话',
  'history.empty': '没有之前的会话',
  'git.title': '🔀 Git 更改',
  'git.empty': '未检测到更改',
  'git.added': '已添加',
  'git.modified': '已修改',
  'git.deleted': '已删除',
  'git.untracked': '未跟踪',
  'git.accept': '接受更改',
  'git.reject': '拒绝更改',
  'buddy.idle': '准备帮助！',
  'buddy.thinking': '思考中...',
  'buddy.coding': '编写代码...',
  'buddy.tools': '运行工具...',
  'buddy.error': '哎呀！出错了',
  'telemetry.title': '📊 遥测仪表板',
  'telemetry.tokens': '总令牌数',
  'telemetry.cost': '总成本',
  'telemetry.latency': '平均延迟',
  'telemetry.errors': '错误',
  'telemetry.sessions': '会话',
  'feedback.title': '💬 反馈',
  'feedback.rating': '评分',
  'feedback.comment': '评论（可选）',
  'feedback.submit': '提交反馈',
  'feedback.thanks': '感谢您的反馈！',
};

const SUPPORTED_LOCALES: Record<string, Record<string, string>> = {
  en: EN,
  es: ES,
  hi: HI,
  zh: ZH,
};

export class LocalizationService {
  private static instance: LocalizationService;
  private _currentLocale = 'en';
  private _dictionary: Record<string, string> = EN;

  static getInstance(): LocalizationService {
    if (!LocalizationService.instance) {
      LocalizationService.instance = new LocalizationService();
    }
    return LocalizationService.instance;
  }

  /**
   * Get current locale code
   */
  get currentLocale(): string {
    return this._currentLocale;
  }

  /**
   * Get all supported locales
   */
  getSupportedLocales(): { code: string; name: string }[] {
    return [
      { code: 'en', name: 'English' },
      { code: 'es', name: 'Español' },
      { code: 'hi', name: 'हिन्दी' },
      { code: 'zh', name: '简体中文' },
    ];
  }

  /**
   * Set the active locale
   */
  setLocale(locale: string): boolean {
    const dict = SUPPORTED_LOCALES[locale];
    if (dict) {
      this._currentLocale = locale;
      this._dictionary = dict;
      return true;
    }
    console.warn(`Locale "${locale}" not supported, falling back to English`);
    this._currentLocale = 'en';
    this._dictionary = EN;
    return false;
  }

  /**
   * Translate a key
   */
  translate(key: string, params?: Record<string, string>): string {
    let text = this._dictionary[key] || EN[key] || key;
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        text = text.replace(`{{${k}}}`, v);
      });
    }
    return text;
  }

  /**
   * Get the entire dictionary for the current locale
   */
  getDictionary(): Record<string, string> {
    return { ...this._dictionary };
  }
}
