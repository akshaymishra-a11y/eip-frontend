import { CodeBlock } from './CodeBlock';

export function SdkInstructions({ apiKey }: { apiKey: string }) {
  // apiUrl points the SDK at this platform's NestJS ingestion endpoint
  // (POST /api/telemetry/ingest) instead of talking to Supabase directly —
  // same backend this web app itself calls (VITE_API_URL).
  const snippet = `const eip = require('archonix-sdk');\n\nconst monitor = eip.init({\n  apiKey: '${apiKey}',\n  apiUrl: '${import.meta.env.VITE_API_URL}',\n});\n\napp.use(monitor.middleware());`;

  return (
    <div className="space-y-2">
      <p className="text-sm text-text-secondary">Add this to your Express app's entry point to start seeing live data within seconds.</p>
      <CodeBlock label="index.js" code={snippet} />
    </div>
  );
}
