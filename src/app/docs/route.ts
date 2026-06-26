import { NextRequest } from "next/server"

export async function GET(req: NextRequest) {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>API Docs | Local-First Document Editor</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
  <style>
    html {
      box-sizing: border-box;
      overflow-y: scroll;
    }
    *, *:before, *:after {
      box-sizing: inherit;
    }
    body {
      margin: 0;
      background: #0f172a; /* Slate 900 for a beautiful dark look */
      color: #f1f5f9;
      font-family: 'Outfit', sans-serif;
    }
    /* Brand Header */
    .brand-header {
      background: linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%);
      padding: 1.5rem 2rem;
      border-bottom: 1px solid #334155;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .brand-title {
      font-size: 1.5rem;
      font-weight: 600;
      background: linear-gradient(to right, #6366f1, #a855f7);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin: 0;
    }
    .brand-subtitle {
      font-size: 0.875rem;
      color: #94a3b8;
    }
    .back-btn {
      color: #cbd5e1;
      text-decoration: none;
      font-size: 0.875rem;
      border: 1px solid #475569;
      padding: 0.5rem 1rem;
      border-radius: 6px;
      transition: all 0.2s;
    }
    .back-btn:hover {
      background: #1e293b;
      color: #ffffff;
      border-color: #6366f1;
    }

    /* Swagger UI Custom Styles to override default theme with premium colors */
    .swagger-ui {
      font-family: 'Outfit', sans-serif !important;
      background-color: #0f172a !important;
    }
    .swagger-ui .info, .swagger-ui .scheme-container {
      background-color: #0f172a !important;
      color: #f1f5f9 !important;
      border: none !important;
      box-shadow: none !important;
    }
    .swagger-ui .info .title, .swagger-ui .info h2, .swagger-ui .info h3, .swagger-ui .info h4, .swagger-ui .info h5 {
      color: #ffffff !important;
      font-family: 'Outfit', sans-serif !important;
    }
    .swagger-ui .info p, .swagger-ui .info li, .swagger-ui .info td, .swagger-ui .info a {
      color: #94a3b8 !important;
    }
    .swagger-ui .opblock-tag {
      color: #e2e8f0 !important;
      border-bottom: 1px solid #334155 !important;
      font-family: 'Outfit', sans-serif !important;
    }
    .swagger-ui .opblock {
      background: #1e293b !important;
      border: 1px solid #334155 !important;
      border-radius: 8px !important;
      box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1) !important;
    }
    .swagger-ui .opblock .opblock-summary-operation-id, .swagger-ui .opblock .opblock-summary-path, .swagger-ui .opblock .opblock-summary-path__deprecated {
      font-family: 'JetBrains Mono', monospace !important;
      color: #f1f5f9 !important;
    }
    .swagger-ui .opblock .opblock-summary-description {
      color: #cbd5e1 !important;
    }
    .swagger-ui .opblock-section-header {
      background: #1e293b !important;
      color: #ffffff !important;
    }
    .swagger-ui .tabli button {
      color: #94a3b8 !important;
      font-family: 'Outfit', sans-serif !important;
    }
    .swagger-ui .tabli.active button {
      color: #6366f1 !important;
    }
    .swagger-ui .response-col_status {
      color: #ffffff !important;
    }
    .swagger-ui table thead tr td, .swagger-ui table thead tr th {
      color: #cbd5e1 !important;
      border-bottom: 1px solid #334155 !important;
    }
    .swagger-ui .parameter__name, .swagger-ui .parameter__type {
      color: #f8fafc !important;
    }
    .swagger-ui .parameter__in {
      color: #94a3b8 !important;
    }
    .swagger-ui select {
      background: #0f172a !important;
      color: #ffffff !important;
      border: 1px solid #475569 !important;
    }
    .swagger-ui input[type=text] {
      background: #0f172a !important;
      color: #ffffff !important;
      border: 1px solid #475569 !important;
    }
    .swagger-ui textarea {
      background: #0f172a !important;
      color: #ffffff !important;
      border: 1px solid #475569 !important;
    }
    .swagger-ui button.btn.execute {
      background-color: #6366f1 !important;
      color: #ffffff !important;
      border: none !important;
      border-radius: 6px !important;
    }
    .swagger-ui button.btn.execute:hover {
      background-color: #4f46e5 !important;
    }
    .swagger-ui .dialog-ux .modal-ux {
      background-color: #1e293b !important;
      border: 1px solid #475569 !important;
    }
    .swagger-ui .dialog-ux .modal-ux-header h3 {
      color: #ffffff !important;
    }
    .swagger-ui .dialog-ux .modal-ux-content {
      color: #cbd5e1 !important;
    }
    .swagger-ui .model-box {
      background: #0f172a !important;
      border: 1px solid #334155 !important;
      border-radius: 4px !important;
    }
    .swagger-ui .model {
      color: #cbd5e1 !important;
    }
    .swagger-ui .model-title {
      color: #ffffff !important;
    }
    .swagger-ui .prop-type {
      color: #38bdf8 !important;
    }
    .swagger-ui .prop-format {
      color: #64748b !important;
    }
    .swagger-ui .servers-title {
      color: #ffffff !important;
    }
  </style>
</head>
<body>
  <header class="brand-header">
    <div>
      <h1 class="brand-title">Local-First Document Editor</h1>
      <span class="brand-subtitle">Interactive REST API Engine</span>
    </div>
    <a href="/" class="back-btn">← Back to Workspace</a>
  </header>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js" crossorigin></script>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-standalone-preset.js" crossorigin></script>
  <script>
    window.onload = () => {
      window.ui = SwaggerUIBundle({
        url: '/openapi.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIBundle.presets.SwaggerUIStandalonePreset
        ],
        layout: "BaseLayout"
      });
    };
  </script>
</body>
</html>
`
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  })
}
