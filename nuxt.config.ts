export default defineNuxtConfig({
  compatibilityDate: '2026-10-15',
  devtools: { enabled: false },
  css: ['~/assets/main.css'],
  app: { head: {
    htmlAttrs: { lang: 'zh-CN' },
    title: 'ai · 三维图',
    meta: [
      { name: 'theme-color', content: '#ffffff' },
      { name: 'description', content: 'AI 模型三维图：Intelligence Index、Cost per Task 与 Time per Task。' },
    ],
  } },
});
