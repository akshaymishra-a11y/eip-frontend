export type SdkFrameworkId = 'nodejs' | 'python' | 'go' | 'java';

export type SdkFramework = {
  id: SdkFrameworkId;
  label: string;
  icon: string;
  /** Node.js is the only SDK shipped today — the rest are on the public roadmap. */
  available: boolean;
  installLabel: string;
  installCmd: string;
  initLabel: string;
  initCode: (apiKey: string, serviceName: string) => string;
  dbWrapLabel: string;
  dbWrapCode: string;
  loggingLabel: string;
  loggingCode: string;
};

export const SDK_FRAMEWORKS: SdkFramework[] = [
  {
    id: 'go',
    label: 'Go',
    icon: 'code',
    available: false,
    installLabel: 'Terminal',
    installCmd: 'go get github.com/eip-platform/eip-go-sdk',
    initLabel: 'main.go',
    initCode: (apiKey, serviceName) =>
      `eip.Init(eip.Config{\n  APIKey:      "${apiKey}",\n  Environment: "production",\n  ServiceName: "${serviceName}",\n})\ndefer eip.Shutdown()`,
    dbWrapLabel: 'main.go',
    dbWrapCode: 'monitor.WrapDatabase(db, "postgres")',
    loggingLabel: 'main.go',
    loggingCode:
      'monitor.Logger.Info("Order created", eip.Fields{"orderId": orderId})\nmonitor.Logger.Warn("Payment retried", nil)\nmonitor.Logger.Error("Payment failed", eip.Fields{"reason": reason})',
  },
  {
    id: 'nodejs',
    label: 'Node.js',
    icon: 'terminal',
    available: true,
    installLabel: 'Terminal',
    installCmd: 'npm install github:akshaymishra-a11y/eip-sdk',
    initLabel: 'index.js',
    // apiUrl points the SDK at this platform's NestJS ingestion endpoint
    // (POST /api/telemetry/ingest) instead of talking to Supabase directly —
    // same backend this web app itself calls (VITE_API_URL).
    initCode: (apiKey, serviceName) =>
      `const eip = require('archonix-sdk');\n\nconst monitor = eip.init({\n  apiKey: '${apiKey}',\n  apiUrl: '${import.meta.env.VITE_API_URL}',\n  environment: 'production',\n  serviceName: '${serviceName}',\n});\n\napp.use(monitor.middleware());`,
    dbWrapLabel: 'index.js',
    dbWrapCode: "monitor.wrapDatabase(pool, 'postgres');",
    loggingLabel: 'index.js',
    loggingCode:
      "monitor.logger.info('Order created', { orderId });\nmonitor.logger.warn('Payment retried');\nmonitor.logger.error('Payment failed', { reason });",
  },
  {
    id: 'python',
    label: 'Python',
    icon: 'terminal',
    available: false,
    installLabel: 'Terminal',
    installCmd: 'pip install eip-sdk',
    initLabel: 'app.py',
    initCode: (apiKey, serviceName) =>
      `import eip\n\nmonitor = eip.init(\n    api_key="${apiKey}",\n    environment="production",\n    service_name="${serviceName}",\n)\napp.wsgi_app = monitor.middleware(app.wsgi_app)`,
    dbWrapLabel: 'app.py',
    dbWrapCode: 'monitor.wrap_database(pool, "postgres")',
    loggingLabel: 'app.py',
    loggingCode:
      'monitor.logger.info("Order created", order_id=order_id)\nmonitor.logger.warn("Payment retried")\nmonitor.logger.error("Payment failed", reason=reason)',
  },
  {
    id: 'java',
    label: 'Java',
    icon: 'terminal',
    available: false,
    installLabel: 'pom.xml',
    installCmd: '<dependency>\n  <groupId>com.eip-platform</groupId>\n  <artifactId>eip-sdk</artifactId>\n</dependency>',
    initLabel: 'Application.java',
    initCode: (apiKey, serviceName) =>
      `EipMonitor monitor = EipMonitor.init(EipConfig.builder()\n    .apiKey("${apiKey}")\n    .environment("production")\n    .serviceName("${serviceName}")\n    .build());`,
    dbWrapLabel: 'Application.java',
    dbWrapCode: 'monitor.wrapDatabase(dataSource, "postgres");',
    loggingLabel: 'Application.java',
    loggingCode:
      'monitor.logger().info("Order created", Map.of("orderId", orderId));\nmonitor.logger().warn("Payment retried");\nmonitor.logger().error("Payment failed", Map.of("reason", reason));',
  },
];

export function maskApiKey(key: string) {
  if (key.length <= 12) return key;
  return `${key.slice(0, 8)}${'•'.repeat(10)}${key.slice(-4)}`;
}
