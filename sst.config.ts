/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "chat-bot",
      removal: input?.stage === "production" ? "retain" : "remove",
      protect: ["production"].includes(input?.stage),
      home: "aws",
    };
  },
  async run() {
    const secrets = {
      GOOGLE_CX_TOKEN: new sst.Secret("GOOGLE_CX_TOKEN"),
      GOOGLE_API_KEY: new sst.Secret("GOOGLE_API_KEY"),
      OPEN_WEATHER_MAP_TOKEN: new sst.Secret("OPEN_WEATHER_MAP_TOKEN"),
      TOKEN: new sst.Secret("TOKEN"),
      YOUTUBE_TOKEN: new sst.Secret("YOUTUBE_TOKEN"),
      FIXER_API_KEY: new sst.Secret("FIXER_API_KEY"),
      EXCHANGE_RATE_API_KEY: new sst.Secret("EXCHANGE_RATE_API_KEY"),
      OPENAI_API_KEY: new sst.Secret("OPENAI_API_KEY"),
      OPENAI_CHAT_IDS: new sst.Secret("OPENAI_CHAT_IDS"),
      GEMINI_API_KEY: new sst.Secret("GEMINI_API_KEY"),
      UPSTASH_REDIS_URL: new sst.Secret("UPSTASH_REDIS_URL"),
      UPSTASH_REDIS_TOKEN: new sst.Secret("UPSTASH_REDIS_TOKEN"),
      DAT1CO_API_KEY: new sst.Secret("DAT1CO_API_KEY"),
    };

    const chatStatisticsTable = new sst.aws.Dynamo("ChatStatisticsTable", {
      fields: {
        chatId: "string",
      },
      primaryIndex: { hashKey: "chatId" },
    });

    const chatEventsTable = new sst.aws.Dynamo("ChatEventsTable", {
      fields: {
        chatId: "string",
        date: "number",
      },
      primaryIndex: { hashKey: "chatId", rangeKey: "date" },
    });

    // Worker function
    const replyWorker = new sst.aws.Function("TelegramReplyWorker", {
      handler: "src/telegram-bot/telegram-reply-worker.default",
      memory: "1536 MB",
      timeout: "300 seconds",
      link: [
        chatStatisticsTable,
        chatEventsTable,
        ...Object.values(secrets),
      ],
    });

    // Main Bot Function
    const telegramBot = new sst.aws.Function("TelegramBot", {
      handler: "src/telegram-bot/index.default",
      timeout: "300 seconds",
      url: true,
      link: [
        chatStatisticsTable,
        chatEventsTable,
        ...Object.values(secrets),
      ],
      environment: {
        REPLY_WORKER_FUNCTION_NAME: replyWorker.name,
      },
    });

    // Schedulers
    new sst.aws.Cron("CurrencyScheduler", {
      schedule: "cron(0 9,11,13,15,17 ? * MON-FRI *)",
      job: {
        handler: "src/telegram-bot/currency-scheduler.default",
        link: [secrets.TOKEN, secrets.FIXER_API_KEY, secrets.EXCHANGE_RATE_API_KEY],
      },
    });

    new sst.aws.Cron("RedisScheduler", {
      schedule: "rate(1 hour)",
      job: {
        handler: "src/telegram-bot/redis-scheduler.default",
        link: [secrets.UPSTASH_REDIS_URL, secrets.UPSTASH_REDIS_TOKEN],
      },
    });

    // Sharp Statistics
    const sharpStatistics = new sst.aws.Function("SharpStatistics", {
      handler: "src/sharp-statistics/index.default",
      memory: "1536 MB",
      url: true,
      nodejs: {
        install: ["sharp", "recharts", "react", "react-dom", "styled-components", "polished"],
      },
      copyFiles: [
        { from: "fonts" },
      ],
      environment: {
        FONTCONFIG_PATH: "/var/task/fonts",
      },
    });

    // Web
    const web = new sst.aws.TanstackStart("Web", {
      path: "web",
      link: [telegramBot],
    });

    return {
      TelegramBotURL: telegramBot.url,
      SharpStatisticsURL: sharpStatistics.url,
      WebURL: web.url,
    };
  },
});
