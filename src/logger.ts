import pino from 'pino';

const logger = pino({
  level: 'debug',
  transport: { target: require.resolve('pino-pretty'), options: { colorize: true } }
});

export default logger;
